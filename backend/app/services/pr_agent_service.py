import yaml
import re
import asyncio
from typing import List, Optional
from functools import partial

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
        if provider == "ollama":
            if self.app_settings.ai_base_url:
                get_settings().set("OLLAMA.API_BASE", self.app_settings.ai_base_url)
            
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
            
        elif provider == "gemini":
            if self.app_settings.ai_api_key:
                get_settings().set("GEMINI.KEY", self.app_settings.ai_api_key)
            get_settings().set("config.model", model)
        
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
        
        # Initialize tools
        await log("Initializing PR-Agent tools...")
        try:
            reviewer = PRReviewer(
                pr_url=pr_url,
                is_answer=False,
                is_auto=False,
                args=None,
                ai_handler=partial(LiteLLMAIHandler)
            )
            
            improver = PRCodeSuggestions(
                pr_url=pr_url,
                args=None,
                ai_handler=partial(LiteLLMAIHandler)
            )

            describer = PRDescription(
                pr_url=pr_url,
                args=None,
                ai_handler=partial(LiteLLMAIHandler)
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
            raise e
        
        # Run the review, improvement and description tools in parallel
        await log("Running AI analysis (review, suggestions, and description) in parallel...")
        review_task = asyncio.create_task(reviewer.run())
        improve_task = asyncio.create_task(improver.run())
        describe_task = asyncio.create_task(describer.run())
        
        # Wait for tasks with timeout
        done, pending = await asyncio.wait(
            [review_task, improve_task, describe_task], 
            timeout=600
        )
        
        if pending:
            await log("Warning: Some AI tasks timed out", "warning")
            for task in pending:
                task.cancel()

        await log("Processing AI results...")
        result = {
            "score": None,
            "effort": None,
            "security_concerns": None,
            "can_be_split": None,
            "suggestions": [],
            "description": None
        }
        
        # Extract metadata from reviewer
        if reviewer.prediction:
            try:
                review_data = load_yaml(reviewer.prediction.strip()).get('review', {})
                result["score"] = self._parse_int(review_data.get('score'))
                result["effort"] = self._parse_int(review_data.get('estimated_effort_to_review_[1-5]'))
                result["security_concerns"] = review_data.get('security_concerns')
                if result["security_concerns"] and result["security_concerns"].lower() == 'no':
                    result["security_concerns"] = None
                result["can_be_split"] = review_data.get('can_be_split')
            except Exception as e:
                import logging
                logging.getLogger(__name__).error(f"Error parsing reviewer output: {e}")
        
        # Extract detailed suggestions from improver
        if hasattr(improver, 'data') and improver.data:
            for suggestion_data in improver.data.get('code_suggestions', []):
                suggestion = self._convert_suggestion(suggestion_data)
                if suggestion:
                    result["suggestions"].append(suggestion)
        
        # Fallback to reviewer suggestions if improver found none
        if not result["suggestions"] and reviewer.prediction:
            result["suggestions"] = self._parse_review_output(reviewer.prediction, reviewer.git_provider)

        # Extract PR description from describer
        if hasattr(describer, 'prediction') and describer.prediction:
            result["description"] = describer.prediction
        
        return result

    async def chat_with_pr(self, pr_url: str, question: str) -> str:
        """
        Chat with a PR using pr-agent's PRQuestions tool.
        
        Args:
            pr_url: Full PR/MR URL
            question: The user's question about the PR
            
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
        
        # Run the chat tool
        await chat_tool.run()
        
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
            
            # Extract suggestion text
            suggestion_text = (
                suggestion_data.get('improved_code') or
                suggestion_data.get('suggestion') or 
                suggestion_data.get('suggestion_content', '')
            )
            
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
