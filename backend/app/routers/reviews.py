import asyncio
import logging
from typing import Optional, List
from fastapi import APIRouter, Depends, HTTPException, BackgroundTasks, Request
from sqlalchemy.orm import Session

logger = logging.getLogger(__name__)

from ..database import get_db
from ..models import PRReview, Suggestion, ReviewStatus, ReviewRuleSet, PRChatMessage, ChatRole
from ..schemas import (
    PRReviewCreate, 
    PRReviewResponse, 
    PRReviewDetailResponse,
    PRReviewListResponse,
    RecentPRItem,
    RecentPRListResponse,
    ChatRequest,
    ChatResponse,
    ChatHistoryResponse,
)
from ..services import (
    get_provider_service,
    detect_provider,
    detect_target_type,
    extract_target_ref,
    ProviderType,
    ReviewTargetType,
)
from ..services.pr_agent_service import PRAgentService
from ..services.github_service import GitHubService
from ..services.gitlab_service import GitLabService
from ..config import get_settings

router = APIRouter(prefix="/api/reviews", tags=["reviews"])


async def process_review(
    review_id: int,
    pr_url: str,
    db: Session,
    extended: bool = False,
    extra_instructions: str = None,
    target_type: str = ReviewTargetType.PR,
):
    """Background task to process PR review"""
    # Re-fetch the review from DB (needed for background task)
    review = db.query(PRReview).filter(PRReview.id == review_id).first()
    if not review:
        logger.warning(f"Review {review_id} not found in database")
        return
    
    try:
        # Initialize processing logs if not extended
        if not extended:
            review.processing_logs = []
            review.add_log(f"Starting review processing for PR: {pr_url}", "info", db)
        else:
            review.add_log(f"Starting extended review processing for PR: {pr_url}", "info", db)
        
        # Update status to reviewing
        review.status = ReviewStatus.REVIEWING.value
        review.current_stage = None
        review.add_log("Status changed to: reviewing", "info", db)
        await asyncio.to_thread(db.commit)
        
        # Detect provider
        provider = detect_provider(pr_url)
        review.provider = provider
        review.add_log(f"Provider detected: {provider}", "info", db)
        await asyncio.to_thread(db.commit)
        
        # Fetch target info for metadata
        if not extended:
            review.current_stage = "fetching_pr_info"
            review.add_log("Stage: Fetching PR information for metadata...", "info", db)
            await asyncio.to_thread(db.commit)
            
            try:
                provider_service = await asyncio.to_thread(get_provider_service, pr_url)
                if target_type == ReviewTargetType.COMMIT:
                    pr_info = await asyncio.to_thread(provider_service.get_commit_info, pr_url)
                else:
                    pr_info = await asyncio.to_thread(provider_service.get_pr_info, pr_url)
                review.project_name = pr_info.project_name
                review.pr_number = pr_info.pr_number if pr_info.pr_number and pr_info.pr_number > 0 else None
                review.pr_title = pr_info.title
                review.pr_author = pr_info.author
                review.source_branch = pr_info.source_branch
                review.target_branch = pr_info.target_branch
                review.add_log(f"PR metadata retrieved: {pr_info.project_name} #{pr_info.pr_number}", "info", db)
                await asyncio.to_thread(db.commit)
            except Exception as e:
                # If fetching PR info fails, continue anyway - pr-agent will handle it
                review.add_log(f"Warning: Could not fetch PR metadata: {e}", "warning", db)
                await asyncio.to_thread(db.commit)
        
        # Update stage: running pr-agent review
        review.current_stage = "getting_llm_review"
        review.add_log("Stage: Running pr-agent review...", "info", db)
        await asyncio.to_thread(db.commit)
        
        # Use pr-agent service for review (it handles diff fetching and processing internally)
        pr_agent_service = PRAgentService()
        review.add_log(f"PR-Agent service initialized", "info", db)
        await asyncio.to_thread(db.commit)
        
        async def log_callback(msg, level="info"):
            review.add_log(msg, level, db)
            await asyncio.to_thread(db.commit)

        provider_service = await asyncio.to_thread(get_provider_service, pr_url)
        if target_type == ReviewTargetType.COMMIT:
            review_result = await pr_agent_service.review_commit(
                pr_url,
                provider_service=provider_service,
                log_callback=log_callback,
                extended=extended,
                extra_instructions=extra_instructions,
            )
        else:
            review_result = await pr_agent_service.review_pr(
                pr_url,
                log_callback=log_callback,
                extended=extended,
                extra_instructions=extra_instructions,
            )
        suggestions = review_result.get("suggestions", [])
        
        # Save advanced review metadata
        if not extended or review_result.get("score"):
            review.score = review_result.get("score")
        if not extended or review_result.get("effort"):
            review.effort = review_result.get("effort")
        if not extended or review_result.get("security_concerns"):
            review.security_concerns = review_result.get("security_concerns")
        if not extended or review_result.get("can_be_split"):
            review.can_be_split = review_result.get("can_be_split")
        if not extended or review_result.get("description"):
            review.pr_description = review_result.get("description")
        
        review.add_log(f"PR-Agent review completed: {len(suggestions)} suggestions found", "info", db)
        
        # Update stage: saving suggestions
        review.current_stage = "saving_suggestions"
        review.add_log(f"Stage: Saving {len(suggestions)} suggestions to database...", "info", db)
        await asyncio.to_thread(db.commit)
        
        # Get existing suggestions to avoid duplicates
        existing_suggestions = db.query(Suggestion).filter(Suggestion.review_id == review.id).all()
        existing_keys = set()
        for s in existing_suggestions:
            # Create a unique key for each suggestion to avoid duplicates
            key = f"{s.file_path}:{s.line_start}:{s.line_end}:{s.suggestion[:50]}"
            existing_keys.add(key)

        # Save suggestions to DB
        new_count = 0
        for sugg in suggestions:
            key = f"{sugg.file_path}:{sugg.line_start}:{sugg.line_end}:{sugg.suggestion[:50]}"
            if key in existing_keys:
                continue
                
            db_suggestion = Suggestion(
                review_id=review.id,
                file_path=sugg.file_path,
                line_start=sugg.line_start,
                line_end=sugg.line_end,
                severity=sugg.severity,
                category=sugg.category,
                original_code=sugg.original_code,
                improved_code=sugg.improved_code,
                suggestion=sugg.suggestion,
                explanation=sugg.explanation,
                score=sugg.score,
                score_why=sugg.score_why
            )
            db.add(db_suggestion)
            new_count += 1
        
        review.add_log(f"Added {new_count} new suggestions", "info", db)
        
        # Update status to completed and clear stage
        review.status = ReviewStatus.COMPLETED.value
        review.current_stage = None
        review.add_log("Review processing completed successfully", "info", db)
        await asyncio.to_thread(db.commit)
        
    except Exception as e:
        error_msg = str(e)
        logger.error(f"Error processing review {review_id}: {error_msg}", exc_info=True)
        review.status = ReviewStatus.FAILED.value
        review.current_stage = None
        review.error_message = error_msg
        review.add_log(f"ERROR: {error_msg}", "error", db)
        db.commit()


@router.post("", response_model=PRReviewResponse)
def create_review(
    review_data: PRReviewCreate,
    background_tasks: BackgroundTasks,
    db: Session = Depends(get_db)
):
    """
    Submit a PR for review.
    
    Creates a new review entry and starts background processing.
    """
    # Detect provider and target from URL
    provider = detect_provider(review_data.pr_url)
    raw_target_type = (review_data.target_type or "").strip().lower()
    if raw_target_type not in {ReviewTargetType.PR, ReviewTargetType.COMMIT}:
        raw_target_type = detect_target_type(review_data.pr_url)
    target_type = raw_target_type
    target_ref = review_data.target_ref or extract_target_ref(review_data.pr_url, target_type)
    
    # Create review entry
    review = PRReview(
        pr_url=review_data.pr_url,
        target_type=target_type,
        target_ref=target_ref,
        target_base_ref=review_data.target_base_ref,
        provider=provider,
        status=ReviewStatus.PENDING.value,
        processing_logs=[],
        rule_set_id=review_data.rule_set_id
    )
    review.add_log(f"Review created for PR: {review_data.pr_url}", "info", None)
    review.add_log(f"Provider: {provider}", "info", None)
    review.add_log("Status: pending - waiting for background task to start", "info", None)
    db.add(review)
    db.commit()
    db.refresh(review)
    
    # Start background processing
    # Note: We need to create a new session for background task
    from ..database import SessionLocal
    
    async def run_review_task():
        """Background task to process review - FastAPI BackgroundTasks supports async"""
        logger.info(f"[BACKGROUND TASK] Starting review processing for review_id={review.id}")
        new_db = SessionLocal()
        try:
            # Add initial log entry
            review_db = await asyncio.to_thread(lambda: new_db.query(PRReview).filter(PRReview.id == review.id).first())
            if review_db:
                review_db.add_log("Background task started - processing beginning", "info", None)
                await asyncio.to_thread(new_db.commit)
                logger.info(f"[BACKGROUND TASK] Logged start for review_id={review.id}")
            else:
                logger.error(f"[BACKGROUND TASK] Review {review.id} not found in database!")
                return
            
            # Fetch rule set instructions if rule_set_id is present
            extra_instructions = None
            if review_data.rule_set_id:
                rule_set = await asyncio.to_thread(
                    lambda: new_db.query(ReviewRuleSet).filter(
                        ReviewRuleSet.id == review_data.rule_set_id,
                        ReviewRuleSet.is_active == True
                    ).first()
                )
                if rule_set:
                    extra_instructions = rule_set.instructions
                    review_db.add_log(f"Using rule set: {rule_set.name}", "info", None)
                    await asyncio.to_thread(new_db.commit)
                    logger.info(f"[BACKGROUND TASK] Applied rule set '{rule_set.name}' for review_id={review.id}")
            
            await process_review(
                review.id,
                review_data.pr_url,
                new_db,
                extra_instructions=extra_instructions,
                target_type=target_type,
            )
            logger.info(f"[BACKGROUND TASK] Completed review processing for review_id={review.id}")
        except Exception as e:
            logger.error(f"[BACKGROUND TASK] Error processing review {review.id}: {e}", exc_info=True)
            # Log error and update review status
            error_db = SessionLocal()
            try:
                error_review = await asyncio.to_thread(lambda: error_db.query(PRReview).filter(PRReview.id == review.id).first())
                if error_review:
                    error_review.status = ReviewStatus.FAILED.value
                    error_review.current_stage = None
                    error_review.error_message = str(e)
                    error_review.add_log(f"FATAL ERROR in background task: {str(e)}", "error", None)
                    await asyncio.to_thread(error_db.commit)
            finally:
                try:
                    await asyncio.to_thread(error_db.close)
                except Exception:
                    pass
        finally:
            try:
                await asyncio.to_thread(new_db.close)
            except Exception:
                pass
            logger.info(f"[BACKGROUND TASK] Closed database session for review_id={review.id}")
    
    # FastAPI BackgroundTasks supports async functions directly
    # It will properly await them after the response is sent
    logger.info(f"[CREATE REVIEW] Adding background task for review_id={review.id}, pr_url={review_data.pr_url}")
    background_tasks.add_task(run_review_task)
    logger.info(f"[CREATE REVIEW] Background task added successfully for review_id={review.id}")
    
    return review


@router.post("/{review_id}/extend", response_model=PRReviewResponse)
def extend_review(
    review_id: int,
    background_tasks: BackgroundTasks,
    db: Session = Depends(get_db)
):
    """
    Generate more suggestions for an existing review.
    """
    review = db.query(PRReview).filter(PRReview.id == review_id).first()
    
    if not review:
        raise HTTPException(status_code=404, detail="Review not found")
        
    if review.status == ReviewStatus.REVIEWING.value:
        raise HTTPException(status_code=400, detail="Review is already in progress")
    
    # Update status to pending for extension
    review.status = ReviewStatus.PENDING.value
    review.add_log("Extension requested - waiting for background task to start", "info", db)
    db.commit()
    db.refresh(review)
    
    # Start background processing for extension
    from ..database import SessionLocal
    
    async def run_extension_task():
        logger.info(f"[EXTENSION TASK] Starting extended review for review_id={review.id}")
        new_db = SessionLocal()
        try:
            review_db = await asyncio.to_thread(lambda: new_db.query(PRReview).filter(PRReview.id == review.id).first())
            if review_db:
                review_db.add_log("Extension task started", "info", None)
                await asyncio.to_thread(new_db.commit)
            
            await process_review(
                review.id,
                review.pr_url,
                new_db,
                extended=True,
                target_type=(review.target_type or ReviewTargetType.PR),
            )
            logger.info(f"[EXTENSION TASK] Completed extended review for review_id={review.id}")
        except Exception as e:
            logger.error(f"[EXTENSION TASK] Error extending review {review.id}: {e}", exc_info=True)
            error_db = SessionLocal()
            try:
                error_review = await asyncio.to_thread(lambda: error_db.query(PRReview).filter(PRReview.id == review.id).first())
                if error_review:
                    error_review.status = ReviewStatus.FAILED.value
                    error_review.add_log(f"FATAL ERROR in extension task: {str(e)}", "error", None)
                    await asyncio.to_thread(error_db.commit)
            finally:
                await asyncio.to_thread(error_db.close)
        finally:
            await asyncio.to_thread(new_db.close)
            
    background_tasks.add_task(run_extension_task)
    
    return review


@router.get("", response_model=PRReviewListResponse)
def list_reviews(
    page: int = 1,
    per_page: int = 20,
    status: Optional[str] = None,
    db: Session = Depends(get_db)
):
    """
    List all PR reviews with pagination.
    """
    query = db.query(PRReview)
    
    if status:
        query = query.filter(PRReview.status == status)
    
    total = query.count()
    
    reviews = (
        query
        .order_by(PRReview.created_at.desc())
        .offset((page - 1) * per_page)
        .limit(per_page)
        .all()
    )
    
    return PRReviewListResponse(
        items=reviews,
        total=total,
        page=page,
        per_page=per_page
    )


@router.get("/recent", response_model=RecentPRListResponse)
async def list_recent_provider_prs(
    limit: int = 20,
    provider: Optional[str] = None,
    target_type: str = ReviewTargetType.PR,
):
    """
    List recent open PRs/MRs from connected providers.
    """
    safe_limit = max(1, min(int(limit or 20), 100))
    selected = (provider or "").strip().lower()
    settings = get_settings()

    providers: list[str] = []
    if selected in {ProviderType.GITHUB, ProviderType.GITLAB}:
        providers = [selected]
    else:
        providers = [ProviderType.GITHUB, ProviderType.GITLAB]

    items: list[RecentPRItem] = []
    per_provider_cap = safe_limit
    target = (target_type or ReviewTargetType.PR).strip().lower()
    if target not in {ReviewTargetType.PR, ReviewTargetType.COMMIT}:
        target = ReviewTargetType.PR

    async def fetch_github_items() -> list[RecentPRItem]:
        try:
            gh_service = GitHubService(token=settings.github_token)
            gh_items = await asyncio.to_thread(
                gh_service.list_recent_commits if target == ReviewTargetType.COMMIT else gh_service.list_recent_prs,
                per_provider_cap,
            )
            return [RecentPRItem(**item.__dict__) for item in gh_items if item.web_url]
        except Exception as e:
            logger.warning(f"Failed to fetch recent GitHub PRs: {e}")
            return []

    async def fetch_gitlab_items() -> list[RecentPRItem]:
        try:
            gl_service = GitLabService()
            gl_items = await asyncio.to_thread(
                gl_service.list_recent_commits if target == ReviewTargetType.COMMIT else gl_service.list_recent_prs,
                per_provider_cap,
            )
            return [RecentPRItem(**item.__dict__) for item in gl_items if item.web_url]
        except Exception as e:
            logger.warning(f"Failed to fetch recent GitLab MRs: {e}")
            return []

    fetch_tasks = []
    if ProviderType.GITHUB in providers and (settings.github_token or "").strip():
        fetch_tasks.append(fetch_github_items())
    if ProviderType.GITLAB in providers and (settings.gitlab_token or "").strip():
        fetch_tasks.append(fetch_gitlab_items())

    if fetch_tasks:
        provider_results = await asyncio.gather(*fetch_tasks)
        for provider_items in provider_results:
            items.extend(provider_items)

    items.sort(key=lambda x: x.updated_at, reverse=True)
    sliced = items[:safe_limit]
    return RecentPRListResponse(items=sliced, total=len(items))


@router.get("/{review_id}", response_model=PRReviewDetailResponse)
def get_review(review_id: int, db: Session = Depends(get_db)):
    """
    Get a specific review with all suggestions.
    """
    review = db.query(PRReview).filter(PRReview.id == review_id).first()
    
    if not review:
        raise HTTPException(status_code=404, detail="Review not found")
    
    return review


@router.delete("/{review_id}")
def delete_review(review_id: int, db: Session = Depends(get_db)):
    """
    Delete a review and all its suggestions.
    """
    review = db.query(PRReview).filter(PRReview.id == review_id).first()
    
    if not review:
        raise HTTPException(status_code=404, detail="Review not found")
    
    db.delete(review)
    db.commit()
    
    return {"message": "Review deleted successfully"}


@router.post("/ask", response_model=ChatResponse)
async def chat_with_pr(
    chat_data: ChatRequest,
    request: Request,
    db: Session = Depends(get_db)
):
    """
    Ask a question about a specific PR.
    """
    review = db.query(PRReview).filter(PRReview.id == chat_data.review_id).first()
    
    if not review:
        raise HTTPException(status_code=404, detail="Review not found")
    
    pr_agent_service = PRAgentService()
    try:
        # Run chat with cancellation support
        answer = await pr_agent_service.chat_with_pr(review.pr_url, chat_data.question, request)

        # Persist the conversation (per review) so it survives restarts.
        display_question = (chat_data.display_question or chat_data.question).strip()
        if display_question:
            db.add(PRChatMessage(review_id=review.id, role=ChatRole.USER.value, content=display_question))
        db.add(PRChatMessage(review_id=review.id, role=ChatRole.ASSISTANT.value, content=answer))
        db.commit()
        return ChatResponse(answer=answer)
    except asyncio.CancelledError:
        logger.info(f"Chat request cancelled for review {chat_data.review_id}")
        raise HTTPException(status_code=499, detail="Request cancelled")
    except HTTPException:
        raise
    except Exception as e:
        # Check if it's a cancellation-related error
        if "cancelled" in str(e).lower() or "disconnected" in str(e).lower():
            logger.info(f"Chat request cancelled: {e}")
            raise HTTPException(status_code=499, detail="Request cancelled")
        logger.error(f"Error in chat_with_pr: {e}", exc_info=True)
        raise HTTPException(status_code=500, detail=str(e))


@router.get("/{review_id}/chat", response_model=ChatHistoryResponse)
def get_chat_history(
    review_id: int,
    limit: int = 200,
    db: Session = Depends(get_db),
):
    """
    Get persisted chat messages for a review (oldest first).
    """
    review = db.query(PRReview).filter(PRReview.id == review_id).first()
    if not review:
        raise HTTPException(status_code=404, detail="Review not found")

    limit = min(max(1, limit), 2000)
    items = (
        db.query(PRChatMessage)
        .filter(PRChatMessage.review_id == review_id)
        .order_by(PRChatMessage.created_at.asc(), PRChatMessage.id.asc())
        .limit(limit)
        .all()
    )
    return ChatHistoryResponse(items=items)


@router.delete("/{review_id}/chat")
def clear_chat_history(review_id: int, db: Session = Depends(get_db)):
    """
    Clear persisted chat for a review. This is the only way chat is removed.
    """
    review = db.query(PRReview).filter(PRReview.id == review_id).first()
    if not review:
        raise HTTPException(status_code=404, detail="Review not found")

    db.query(PRChatMessage).filter(PRChatMessage.review_id == review_id).delete(synchronize_session=False)
    db.commit()
    return {"message": "Chat cleared"}
