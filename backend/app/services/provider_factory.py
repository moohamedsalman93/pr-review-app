from typing import Optional
from urllib.parse import urlparse
import re
from .base_service import BasePRService
from .gitlab_service import GitLabService
from .github_service import GitHubService


class ProviderType:
    """Provider type constants"""
    GITLAB = "gitlab"
    GITHUB = "github"

class ReviewTargetType:
    PR = "pr"
    COMMIT = "commit"


def detect_provider(url: str) -> str:
    """
    Detect the provider type from a PR/MR URL.
    
    Args:
        url: PR or MR URL
        
    Returns:
        Provider type string ('gitlab' or 'github')
        
    Raises:
        ValueError: If URL doesn't match any known provider pattern
    """
    parsed = urlparse(url)
    hostname = parsed.hostname.lower() if parsed.hostname else ""
    
    if "github.com" in hostname:
        return ProviderType.GITHUB
    elif "gitlab.com" in hostname or "gitlab" in hostname:
        return ProviderType.GITLAB
    else:
        # Default to GitLab for custom instances
        # Could be enhanced to check API endpoints
        return ProviderType.GITLAB


def detect_target_type(url: str) -> str:
    """
    Detect whether URL targets a PR/MR or a commit.
    """
    path = (urlparse(url).path or "").lower()
    if "/commit/" in path:
        return ReviewTargetType.COMMIT
    return ReviewTargetType.PR


def extract_target_ref(url: str, target_type: str) -> str | None:
    """
    Extract primary target ref from URL:
    - PR: pull/merge_request number
    - Commit: commit SHA
    """
    path = urlparse(url).path or ""
    if target_type == ReviewTargetType.COMMIT:
        match = re.search(r"/commit/([0-9a-fA-F]+)", path)
        return match.group(1) if match else None
    match = re.search(r"/pull/(\d+)|/merge_requests/(\d+)", path)
    if not match:
        return None
    return match.group(1) or match.group(2)


def get_provider_service(url: str, github_token: Optional[str] = None) -> BasePRService:
    """
    Factory function to get the appropriate provider service based on URL.
    
    Args:
        url: PR or MR URL
        github_token: Optional GitHub token (if not provided, uses config)
        
    Returns:
        Instance of appropriate service (GitLabService or GitHubService)
        
    Raises:
        ValueError: If provider cannot be determined or service cannot be initialized
    """
    provider = detect_provider(url)
    
    if provider == ProviderType.GITHUB:
        return GitHubService(token=github_token)
    elif provider == ProviderType.GITLAB:
        return GitLabService()
    else:
        raise ValueError(f"Unsupported provider: {provider}")
