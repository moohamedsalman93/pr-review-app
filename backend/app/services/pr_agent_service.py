import os
import yaml
import re
import asyncio
import logging
import json
from typing import List, Optional
from functools import partial
from litellm import completion

logger = logging.getLogger(__name__)

from pr_agent.tools.pr_reviewer import PRReviewer
from pr_agent.tools.pr_code_suggestions import PRCodeSuggestions
from pr_agent.tools.pr_description import PRDescription
from pr_agent.tools.pr_questions import PRQuestions
from pr_agent.algo.ai_handlers.litellm_ai_handler import LiteLLMAIHandler
from pr_agent.config_loader import get_settings
from pr_agent.git_providers import get_git_provider_with_context
from pr_agent.algo.utils import load_yaml

from ..config import get_settings as get_app_settings
from .llm_service import CodeSuggestion


class PRAgentService:
    """Service to integrate pr-agent's tools for code reviews and PR analysis"""
    
    def __init__(self):
        """Initialize pr-agent service with configuration from app settings"""
        self.app_settings = get_app_settings()
        self._configure_pr_agent()
    
    def _configure_pr_agent(self):
        """Configure pr-agent settings based on app settings"""
        # Configure AI provider and model
        provider = self.app_settings.ai_provider or "ollama"
        model = self.app_settings.ai_model
        
        # Handle different providers
        if provider in ["ollama", "ollama_cloud"]:
            if self.app_settings.ai_base_url:
                get_settings().set("OLLAMA.API_BASE", self.app_settings.ai_base_url)
            
            if provider == "ollama_cloud" and self.app_settings.ai_api_key:
                get_settings().set("OLLAMA.API_KEY", self.app_settings.ai_api_key)
            
            # Set model (Ollama format: ollama/model_name)
            if not model.startswith("ollama/"):
                model = f"ollama/{model}"
            get_settings().set("config.model", model)
            get_settings().set("config.fallback_models", [model])
            
        elif provider == "openai":
            if self.app_settings.ai_api_key:
                get_settings().set("OPENAI.KEY", self.app_settings.ai_api_key)
            if self.app_settings.ai_base_url:
                get_settings().set("OPENAI.BASE_URL", self.app_settings.ai_base_url)
            get_settings().set("config.model", model)

        elif provider == "anthropic":
            if self.app_settings.ai_api_key:
                get_settings().set("ANTHROPIC.KEY", self.app_settings.ai_api_key)
            get_settings().set("config.model", model)
            # pr-agent defaults fallback_models to OpenAI's o4-mini; avoid that without an OpenAI key.
            get_settings().set("config.fallback_models", [])

        elif provider == "gemini":
            # pr-agent LiteLLM handler only wires GEMINI_API_KEY from GOOGLE_AI_STUDIO.GEMINI_API_KEY
            # (see litellm_ai_handler); GEMINI.KEY alone is ignored.
            if self.app_settings.ai_api_key:
                key = self.app_settings.ai_api_key.strip()
                get_settings().set("GOOGLE_AI_STUDIO.GEMINI_API_KEY", key)
                os.environ["GEMINI_API_KEY"] = key
            m = (model or "").strip()
            if m.endswith(":latest"):
                m = m[: -len(":latest")]
            if m and "/" not in m:
                m = f"gemini/{m}"
            get_settings().set("config.model", m)
            # Same as anthropic: shipped default fallback is OpenAI o4-mini → dummy_key errors.
            get_settings().set("config.fallback_models", [])
        
        # Set common config
        max_tokens = self.app_settings.max_tokens or 128000
        get_settings().set("config.max_model_tokens", max_tokens)
        get_settings().set("config.custom_model_max_tokens", max_tokens)
        
        # Increase timeout for AI (default is 120s)
        get_settings().set("config.ai_timeout", 300)
        
        # Disable publishing output (we'll handle it ourselves)
        get_settings().set("config.publish_output", False)
        
        # Enable score and other advanced metrics
        get_settings().set("pr_reviewer.require_score_review", True)
        get_settings().set("pr_reviewer.require_estimate_effort_to_review", True)
        get_settings().set("pr_reviewer.require_security_review", True)
        get_settings().set("pr_code_suggestions.suggestions_score_threshold", 0)
        
        # Set git provider tokens (will be set per request based on PR URL)
        if self.app_settings.github_token:
            get_settings().set("GITHUB.USER_TOKEN", self.app_settings.github_token)
            get_settings().set("GITHUB.DEPLOYMENT_TYPE", "user")
        
        if self.app_settings.gitlab_token:
            get_settings().set("GITLAB.PERSONAL_ACCESS_TOKEN", self.app_settings.gitlab_token)
            if self.app_settings.gitlab_url and self.app_settings.gitlab_url != "https://gitlab.com":
                get_settings().set("GITLAB.URL", self.app_settings.gitlab_url)
    
    def _detect_git_provider(self, pr_url: str) -> str:
        """Detect git provider from PR URL"""
        pr_url_lower = pr_url.lower()
        if "github.com" in pr_url_lower:
            return "github"
        elif "gitlab.com" in pr_url_lower or "gitlab" in pr_url_lower:
            return "gitlab"
        else:
            # Default to gitlab for custom instances
            return "gitlab"
    
    def _configure_git_provider(self, pr_url: str):
        """Configure git provider settings for the specific PR"""
        provider = self._detect_git_provider(pr_url)
        
        # Set git provider in pr-agent config
        get_settings().set("config.git_provider", provider)
        
        # Ensure tokens are set
        if provider == "github" and self.app_settings.github_token:
            get_settings().set("GITHUB.USER_TOKEN", self.app_settings.github_token)
            get_settings().set("GITHUB.DEPLOYMENT_TYPE", "user")
        elif provider == "gitlab":
            if self.app_settings.gitlab_token:
                get_settings().set("GITLAB.PERSONAL_ACCESS_TOKEN", self.app_settings.gitlab_token)
            if self.app_settings.gitlab_url and self.app_settings.gitlab_url != "https://gitlab.com":
                get_settings().set("GITLAB.URL", self.app_settings.gitlab_url)
    
    async def review_pr(self, pr_url: str, log_callback: Optional[callable] = None, extended: bool = False, extra_instructions: str = None) -> dict:
        """
        Review a PR using pr-agent's PRReviewer and PRCodeSuggestions.
        
        Args:
            pr_url: Full PR/MR URL
            log_callback: Optional async function to call for logging progress
            extended: Whether to run in extended mode for more suggestions
            extra_instructions: Optional custom instructions to inject into pr-agent prompts
            
        Returns:
            Dictionary with review metadata, code suggestions, and PR description
        """
        async def log(msg, level="info"):
            if log_callback:
                await log_callback(msg, level)

        # Refresh DB-backed options (e.g. review_runs) in case settings cache was updated after service init.
        self.app_settings = get_app_settings()

        # Configure git provider for this PR
        self._configure_git_provider(pr_url)
        
        # Inject custom instructions if provided
        if extra_instructions:
            await log(f"Applying custom review rules...")
            get_settings().set("pr_code_suggestions.extra_instructions", extra_instructions)
            get_settings().set("pr_reviewer.extra_instructions", extra_instructions)
        else:
            # Clear any previous extra_instructions
            get_settings().set("pr_code_suggestions.extra_instructions", "")
            get_settings().set("pr_reviewer.extra_instructions", "")
        
        # Set extended mode if requested
        if extended:
            await log("Extended mode enabled - requesting more suggestions...")
            get_settings().set("pr_code_suggestions.max_number_of_calls", 6)
        else:
            get_settings().set("pr_code_suggestions.max_number_of_calls", 3)

        review_runs = int(getattr(self.app_settings, "review_runs", 1) or 1)
        review_runs = max(1, min(review_runs, 5))

        aggregated = {
            "score": None,
            "effort": None,
            "security_concerns": None,
            "can_be_split": None,
            "suggestions": [],
            "description": None,
        }
        seen_suggestion_keys = set()
        last_error: Exception | None = None
        had_tool_errors = False
        first_tool_error_message: str | None = None

        for run_idx in range(review_runs):
            await log(f"Initializing PR-Agent tools (pass {run_idx + 1}/{review_runs})...")
            pass_had_error = False
            try:
                reviewer = PRReviewer(
                    pr_url=pr_url,
                    is_answer=False,
                    is_auto=False,
                    args=None,
                    ai_handler=partial(LiteLLMAIHandler),
                )

                improver = PRCodeSuggestions(
                    pr_url=pr_url,
                    args=None,
                    ai_handler=partial(LiteLLMAIHandler),
                )

                describer = PRDescription(
                    pr_url=pr_url,
                    args=None,
                    ai_handler=partial(LiteLLMAIHandler),
                )
            except Exception as e:
                # Catch initialization errors (often token/permission related)
                error_str = str(e)
                if "Failed to get git provider" in error_str or "404" in error_str:
                    friendly_msg = (
                        "GitHub Access Error: 404 Not Found. "
                        "Please check your GitHub Token permissions. "
                        "If using a Fine-grained Personal Access Token, ensure it has "
                        "'Contents: Read-only' and 'Pull Requests: Read-only' permissions "
                        "and matches the repository owner."
                    )
                    await log(f"CRITICAL ERROR: {friendly_msg}", "error")
                    raise ValueError(friendly_msg) from e
                raise

            await log(f"Running AI analysis in parallel (pass {run_idx + 1}/{review_runs})...")
            review_task = asyncio.create_task(reviewer.run())
            improve_task = asyncio.create_task(improver.run())
            describe_task = asyncio.create_task(describer.run())

            # Three LLM-heavy tools in parallel; 600s is often too tight on slow providers.
            per_pass_timeout = 900
            done, pending = await asyncio.wait(
                [review_task, improve_task, describe_task],
                timeout=per_pass_timeout,
            )
            if pending:
                pass_had_error = True
                await log(
                    f"Warning: Some AI tasks timed out after {per_pass_timeout}s",
                    "warning",
                )
                for task in pending:
                    task.cancel()
                await asyncio.gather(*pending, return_exceptions=True)

            for task in done:
                try:
                    await task
                except Exception as e:
                    pass_had_error = True
                    if first_tool_error_message is None:
                        first_tool_error_message = str(e)
                    await log(f"AI task finished with error: {e}", "warning")

            await log(f"Processing AI results (pass {run_idx + 1}/{review_runs})...")

            try:
                pass_produced_output = False

                # Metadata from reviewer
                if reviewer.prediction:
                    pass_produced_output = True
                    try:
                        review_data = load_yaml(reviewer.prediction.strip()).get("review", {})
                        score = self._parse_int(review_data.get("score"))
                        effort = self._parse_int(review_data.get("estimated_effort_to_review_[1-5]"))
                        sec = review_data.get("security_concerns")
                        if sec and isinstance(sec, str) and sec.lower() == "no":
                            sec = None
                        can_split = review_data.get("can_be_split")

                        if score is not None:
                            aggregated["score"] = max(aggregated["score"] or 0, score)
                        if effort is not None:
                            aggregated["effort"] = max(aggregated["effort"] or 0, effort)
                        if aggregated["security_concerns"] is None and sec:
                            aggregated["security_concerns"] = sec
                        if aggregated["can_be_split"] is None and can_split is not None:
                            aggregated["can_be_split"] = can_split
                    except Exception as e:
                        logging.getLogger(__name__).error(f"Error parsing reviewer output: {e}")

                # Suggestions from improver
                pass_suggestions: List[CodeSuggestion] = []
                if hasattr(improver, "data") and isinstance(improver.data, dict):
                    raw_list = improver.data.get("code_suggestions")
                    if not isinstance(raw_list, list):
                        raw_list = []
                    if raw_list:
                        pass_produced_output = True
                    for suggestion_data in raw_list:
                        if not isinstance(suggestion_data, dict):
                            continue
                        suggestion = self._convert_suggestion(suggestion_data)
                        if suggestion:
                            pass_suggestions.append(suggestion)

                # Fallback suggestions from reviewer
                if not pass_suggestions and reviewer.prediction:
                    pass_suggestions = self._parse_review_output(reviewer.prediction, reviewer.git_provider)

                # Dedupe + append
                added = 0
                for s in pass_suggestions:
                    key = f"{s.file_path}:{s.line_start}:{s.line_end}:{(s.suggestion or '')[:80]}"
                    if key in seen_suggestion_keys:
                        continue
                    seen_suggestion_keys.add(key)
                    aggregated["suggestions"].append(s)
                    added += 1

                await log(f"Pass {run_idx + 1}/{review_runs} produced {len(pass_suggestions)} suggestions ({added} new).")

                # Description (keep first non-empty)
                if aggregated["description"] is None and hasattr(describer, "prediction") and describer.prediction:
                    pass_produced_output = True
                    aggregated["description"] = describer.prediction
                elif hasattr(describer, "prediction") and describer.prediction:
                    pass_produced_output = True

                # Some provider/tool errors are swallowed internally by PR-Agent and only logged.
                # If the whole pass produced no usable artifacts at all, treat it as a failed pass.
                if not pass_produced_output:
                    pass_had_error = True
                    if first_tool_error_message is None:
                        first_tool_error_message = "No AI output was produced by the configured model."
                    await log(
                        f"Warning: review pass {run_idx + 1}/{review_runs} returned no AI output.",
                        "warning",
                    )

                had_tool_errors = had_tool_errors or pass_had_error
                last_error = None
            except Exception as e:
                last_error = e
                await log(f"Warning: review pass {run_idx + 1}/{review_runs} failed: {e}", "warning")
                continue

        if had_tool_errors:
            detail = first_tool_error_message or "AI review failed due to internal tool errors."
            raise RuntimeError(f"AI review failed: {detail}")
        if aggregated["suggestions"] or aggregated["description"] or aggregated["score"] is not None:
            return aggregated
        if last_error:
            raise last_error
        return aggregated

    def _build_litellm_call_kwargs(self) -> dict:
        provider = (self.app_settings.ai_provider or "").lower()
        kwargs = {}
        if self.app_settings.ai_api_key:
            kwargs["api_key"] = self.app_settings.ai_api_key
        if self.app_settings.ai_base_url and provider not in {"anthropic", "gemini"}:
            kwargs["api_base"] = self.app_settings.ai_base_url
        return kwargs

    def _resolve_litellm_model(self) -> str:
        provider = (self.app_settings.ai_provider or "").lower()
        model = self.app_settings.ai_model
        if provider in {"ollama", "ollama_cloud"} and model and not str(model).startswith("ollama/"):
            return f"ollama/{model}"
        if provider == "gemini":
            m = (model or "").strip()
            if m.endswith(":latest"):
                m = m[: -len(":latest")]
            if m and "/" not in m:
                return f"gemini/{m}"
            return m
        return model

    async def review_commit(
        self,
        commit_url: str,
        provider_service: object,
        log_callback: Optional[callable] = None,
        extended: bool = False,
        extra_instructions: str = None,
    ) -> dict:
        """
        Review a single commit by fetching commit patch and running one LLM pass.
        """
        async def log(msg, level="info"):
            if log_callback:
                await log_callback(msg, level)

        self.app_settings = get_app_settings()
        await log("Fetching commit details for AI analysis...")
        commit_info = await asyncio.to_thread(provider_service.get_commit_info, commit_url)

        diff_parts = []
        for d in commit_info.diffs[:80]:
            patch = d.diff or ""
            if not patch.strip():
                continue
            diff_parts.append(f"File: {d.new_path or d.filename}\n```diff\n{patch[:8000]}\n```")
        diff_blob = "\n\n".join(diff_parts)[:120000]
        if not diff_blob.strip():
            raise ValueError("Commit has no patch content to review (binary-only or empty diff).")

        depth_hint = "Generate up to 30 suggestions." if extended else "Generate up to 12 suggestions."
        instruction_block = extra_instructions.strip() if extra_instructions else "No extra instructions."
        prompt = f"""
You are an expert code reviewer.
Review this single git commit and return STRICT JSON only.

Rules:
- Focus on correctness, security, performance, and maintainability.
- Include precise file paths and line hints when possible.
- {depth_hint}
- Respect extra project rules: {instruction_block}

Return JSON in this shape:
{{
  "review": {{
    "score": 1-100,
    "estimated_effort_to_review_[1-5]": 1-5,
    "security_concerns": "string or null"
  }},
  "code_suggestions": [
    {{
      "relevant_file": "path/to/file",
      "relevant_lines_start": 1,
      "relevant_lines_end": 1,
      "severity": "info|warning|error",
      "category": "style|bug|performance|security|best_practice",
      "suggestion": "what to improve",
      "suggestion_content": "why this matters"
    }}
  ],
  "summary": "short summary"
}}

Commit title: {commit_info.title}
Commit description:
{commit_info.description or ""}

Patch data:
{diff_blob}
"""

        await log("Running LLM commit review...")
        model = self._resolve_litellm_model()
        litellm_kwargs = self._build_litellm_call_kwargs()
        response = await asyncio.to_thread(
            completion,
            model=model,
            messages=[
                {"role": "system", "content": "Return JSON only, no markdown."},
                {"role": "user", "content": prompt},
            ],
            temperature=0.1,
            timeout=300,
            **litellm_kwargs,
        )

        text = (response.choices[0].message.content or "").strip()
        json_match = re.search(r"\{[\s\S]*\}", text)
        payload_text = json_match.group(0) if json_match else text
        try:
            payload = json.loads(payload_text)
        except Exception:
            payload = {"review": {}, "code_suggestions": [], "summary": text[:500]}

        review_data = payload.get("review", {}) if isinstance(payload, dict) else {}
        raw_suggestions = payload.get("code_suggestions", []) if isinstance(payload, dict) else []
        suggestions: List[CodeSuggestion] = []
        for item in raw_suggestions if isinstance(raw_suggestions, list) else []:
            if not isinstance(item, dict):
                continue
            suggestion = self._convert_suggestion(item)
            if suggestion:
                suggestions.append(suggestion)

        return {
            "score": self._parse_int(review_data.get("score")),
            "effort": self._parse_int(review_data.get("estimated_effort_to_review_[1-5]")),
            "security_concerns": review_data.get("security_concerns"),
            "can_be_split": None,
            "suggestions": suggestions,
            "description": payload.get("summary") if isinstance(payload, dict) else None,
        }

    async def chat_with_pr(self, pr_url: str, question: str, request: Optional[object] = None) -> str:
        """
        Chat with a PR using pr-agent's PRQuestions tool.
        
        Args:
            pr_url: Full PR/MR URL
            question: The user's question about the PR
            request: Optional FastAPI Request object to check for client disconnection
            
        Returns:
            AI-generated answer
        """
        # Configure git provider for this PR
        self._configure_git_provider(pr_url)
        
        # Initialize PRQuestions tool
        try:
            chat_tool = PRQuestions(
                pr_url=pr_url,
                args=[question],
                ai_handler=partial(LiteLLMAIHandler)
            )
        except Exception as e:
            error_str = str(e)
            if "Failed to get git provider" in error_str or "404" in error_str:
                raise ValueError(
                    "GitHub Access Error: 404 Not Found. "
                    "Please check your GitHub Token permissions (ensure 'Contents' and 'Pull Requests' access)."
                ) from e
            raise e
        
        # Run the chat tool with periodic cancellation check
        try:
            # Wrap the run in a task so we can check for cancellation
            run_task = asyncio.create_task(chat_tool.run())
            
            # Check periodically if client disconnected
            if request:
                check_interval = 0.3  # Check every 300ms
                while not run_task.done():
                    try:
                        # Check if client disconnected
                        if await request.is_disconnected():
                            logger.info("Client disconnected, cancelling chat tool")
                            run_task.cancel()
                            # Wait a bit for cancellation to propagate
                            try:
                                await asyncio.wait_for(run_task, timeout=0.5)
                            except (asyncio.CancelledError, asyncio.TimeoutError):
                                pass
                            raise asyncio.CancelledError("Client disconnected")
                        
                        # Wait with timeout to allow periodic checks
                        await asyncio.sleep(check_interval)
                    except asyncio.CancelledError:
                        # Re-raise cancellation
                        run_task.cancel()
                        raise
            
            # Wait for task completion
            await run_task
        except asyncio.CancelledError:
            logger.info("Chat tool execution cancelled")
            raise
        
        # Extract the answer from the tool's prediction
        if hasattr(chat_tool, 'prediction') and chat_tool.prediction:
            return chat_tool.prediction
        
        return "I'm sorry, I couldn't generate an answer for that question."

    def _parse_int(self, value):
        if value is None: return None
        try:
            if isinstance(value, str):
                match = re.search(r'\d+', value)
                return int(match.group()) if match else None
            return int(value)
        except:
            return None
    
    def _parse_review_output(self, yaml_output: str, git_provider) -> List[CodeSuggestion]:
        """
        Parse pr-agent's YAML review output and convert to CodeSuggestion format.
        
        Args:
            yaml_output: The YAML string output from PRReviewer
            git_provider: The git provider instance (for getting file info)
            
        Returns:
            List of CodeSuggestion objects
        """
        suggestions = []
        
        try:
            # Use pr-agent's load_yaml function which handles various edge cases
            first_key = 'review'
            last_key = 'security_concerns'
            keys_fix_yaml = [
                "ticket_compliance_check", 
                "estimated_effort_to_review_[1-5]:", 
                "security_concerns:", 
                "key_issues_to_review:",
                "relevant_file:", 
                "relevant_line:", 
                "suggestion:"
            ]
            
            data = load_yaml(
                yaml_output.strip(),
                keys_fix_yaml=keys_fix_yaml,
                first_key=first_key,
                last_key=last_key
            )
            
            if not data or 'review' not in data:
                return suggestions
            
            review_data = data['review']
            
            # Extract code suggestions from the review
            # pr-agent structures suggestions in various ways:
            # - code_suggestions: list of suggestions with file paths and line numbers
            # - key_issues_to_review: list of issues that need attention
            
            # Process code_suggestions if present
            if 'code_suggestions' in review_data:
                code_suggestions = review_data['code_suggestions']
                if isinstance(code_suggestions, list):
                    for suggestion_data in code_suggestions:
                        suggestion = self._convert_suggestion(suggestion_data)
                        if suggestion:
                            suggestions.append(suggestion)
            
            # Process key_issues_to_review if present
            if 'key_issues_to_review' in review_data:
                issues = review_data['key_issues_to_review']
                # Handle both list and dict formats
                if isinstance(issues, list):
                    for issue in issues:
                        if isinstance(issue, dict):
                            suggestion = self._convert_issue_to_suggestion(issue)
                            if suggestion:
                                suggestions.append(suggestion)
                elif isinstance(issues, dict):
                    # Sometimes it's a dict with file paths as keys
                    for file_path, file_issues in issues.items():
                        if isinstance(file_issues, list):
                            for issue in file_issues:
                                if isinstance(issue, dict):
                                    issue['relevant_file'] = file_path
                                    suggestion = self._convert_issue_to_suggestion(issue)
                                    if suggestion:
                                        suggestions.append(suggestion)
            
            # Process PR feedback (general feedback that might reference files)
            if 'pr_feedback' in review_data:
                feedback = review_data['pr_feedback']
                # Try to extract file-specific feedback
                # This is a fallback for when suggestions aren't in structured format
                if isinstance(feedback, str):
                    # Try to parse file references from feedback text
                    file_suggestions = self._extract_file_suggestions_from_text(feedback)
                    suggestions.extend(file_suggestions)
            
        except Exception as e:
            # Log error but return empty list
            import logging
            logger = logging.getLogger(__name__)
            logger.error(f"Error parsing pr-agent review output: {e}", exc_info=True)
            # Try fallback text extraction
            suggestions = self._extract_suggestions_from_text(yaml_output)
        
        return suggestions
    
    def _convert_suggestion(self, suggestion_data: dict) -> Optional[CodeSuggestion]:
        """Convert pr-agent suggestion format to CodeSuggestion"""
        try:
            file_path = suggestion_data.get('relevant_file') or suggestion_data.get('file_path', 'unknown')
            
            # Extract line numbers
            line_start = suggestion_data.get('relevant_lines_start') or suggestion_data.get('start_line') or suggestion_data.get('line_start')
            line_end = suggestion_data.get('relevant_lines_end') or suggestion_data.get('end_line') or suggestion_data.get('line_end') or line_start
            
            # Extract suggestion text (pr-agent / model variants use different keys)
            suggestion_text = (
                suggestion_data.get('improved_code') or
                suggestion_data.get('suggestion') or
                suggestion_data.get('suggestion_content') or
                suggestion_data.get('issue_content') or
                suggestion_data.get('description') or
                ''
            )
            if isinstance(suggestion_text, str):
                suggestion_text = suggestion_text.strip()
            if not suggestion_text:
                return None
            
            # Extract original code if available
            original_code = suggestion_data.get('existing_code') or suggestion_data.get('original_code') or suggestion_data.get('code', None)
            
            # Improved code specifically from PRCodeSuggestions
            improved_code = suggestion_data.get('improved_code')
            
            # Determine severity based on suggestion type or content
            severity = self._determine_severity(suggestion_data)
            
            # Determine category
            category = self._determine_category(suggestion_data)
            
            # Extract explanation
            explanation = (
                suggestion_data.get('suggestion_content') or
                suggestion_data.get('explanation') or
                suggestion_data.get('issue_content') or
                suggestion_data.get('description', None)
            )
            
            # Extract score and score_why
            score = self._parse_int(suggestion_data.get('score'))
            score_why = suggestion_data.get('score_why')
            
            return CodeSuggestion(
                file_path=file_path,
                line_start=line_start,
                line_end=line_end,
                severity=severity,
                category=category,
                original_code=original_code,
                improved_code=improved_code,
                suggestion=suggestion_text,
                explanation=explanation,
                score=score,
                score_why=score_why
            )
        except Exception as e:
            import logging
            logger = logging.getLogger(__name__)
            logger.warning(f"Error converting suggestion: {e}")
            return None
    
    def _convert_issue_to_suggestion(self, issue_data: dict) -> Optional[CodeSuggestion]:
        """Convert pr-agent issue format to CodeSuggestion"""
        try:
            file_path = issue_data.get('relevant_file', 'unknown')
            line_start = issue_data.get('start_line')
            line_end = issue_data.get('end_line') or line_start
            
            issue_content = issue_data.get('issue_content', '')
            issue_header = issue_data.get('issue_header', '')
            
            # Combine header and content for suggestion
            suggestion_text = f"{issue_header}: {issue_content}" if issue_header else issue_content
            
            return CodeSuggestion(
                file_path=file_path,
                line_start=line_start,
                line_end=line_end,
                severity="warning",  # Issues are typically warnings
                category="best_practice",  # Default category
                original_code=None,
                suggestion=suggestion_text,
                explanation=issue_content,
                score=issue_data.get('score'),
                score_why=issue_data.get('score_why')
            )
        except Exception as e:
            import logging
            logger = logging.getLogger(__name__)
            logger.warning(f"Error converting issue: {e}")
            return None
    
    def _determine_severity(self, suggestion_data: dict) -> str:
        """Determine severity level from suggestion data"""
        severity = suggestion_data.get('severity', '').lower()
        
        if severity in ['error', 'critical', 'high']:
            return 'error'
        elif severity in ['warning', 'medium']:
            return 'warning'
        else:
            return 'info'
    
    def _determine_category(self, suggestion_data: dict) -> str:
        """Determine category from suggestion data"""
        category = suggestion_data.get('category', '').lower()
        
        valid_categories = ['style', 'bug', 'performance', 'security', 'best_practice']
        if category in valid_categories:
            return category
        
        # Try to infer from content
        suggestion_text = str(suggestion_data.get('suggestion', '') + ' ' + 
                            suggestion_data.get('issue_content', '')).lower()
        
        if any(word in suggestion_text for word in ['security', 'vulnerability', 'exploit', 'insecure']):
            return 'security'
        elif any(word in suggestion_text for word in ['bug', 'error', 'incorrect', 'wrong', 'fix']):
            return 'bug'
        elif any(word in suggestion_text for word in ['performance', 'slow', 'optimize', 'efficient']):
            return 'performance'
        elif any(word in suggestion_text for word in ['style', 'format', 'naming', 'convention']):
            return 'style'
        else:
            return 'best_practice'
    
    def _extract_file_suggestions_from_text(self, text: str) -> List[CodeSuggestion]:
        """Extract file-specific suggestions from unstructured text"""
        suggestions = []
        
        # Try to find file references in the text
        # Pattern: file paths or "in file X" patterns
        file_pattern = r'(?:file|File|in)\s+[`"]?([^\s`"]+\.(?:py|js|ts|java|cpp|h|go|rs|rb|php|cs|swift|kt|scala|sh|yaml|yml|json|md|txt))[`"]?'
        matches = re.finditer(file_pattern, text, re.IGNORECASE)
        
        for match in matches:
            file_path = match.group(1)
            # Create a generic suggestion for this file
            suggestions.append(CodeSuggestion(
                file_path=file_path,
                line_start=None,
                line_end=None,
                severity='info',
                category='best_practice',
                original_code=None,
                suggestion=text[:200],  # First 200 chars as suggestion
                explanation=None
            ))
        
        return suggestions
    
    def _extract_suggestions_from_text(self, text: str) -> List[CodeSuggestion]:
        """Fallback: extract suggestions from plain text output"""
        suggestions = []
        
        # Try to find structured patterns in text
        # Look for file paths and line numbers
        pattern = r'([^\s]+\.(?:py|js|ts|java|cpp|h|go|rs|rb|php|cs|swift|kt|scala|sh|yaml|yml|json|md|txt))(?::(\d+))?(?::(\d+))?'
        matches = re.finditer(pattern, text)
        
        for match in matches:
            file_path = match.group(1)
            line_start = int(match.group(2)) if match.group(2) else None
            line_end = int(match.group(3)) if match.group(3) else line_start
            
            suggestions.append(CodeSuggestion(
                file_path=file_path,
                line_start=line_start,
                line_end=line_end,
                severity='info',
                category='best_practice',
                original_code=None,
                suggestion=text[:200],
                explanation=None
            ))
        
        return suggestions
