from typing import Optional
from urllib.parse import urlparse
from .base_service import BasePRService
from .gitlab_service import GitLabService
from .github_service import GitHubService


class ProviderType:
    """Provider type constants"""
    GITLAB = "gitlab"
    GITHUB = "github"


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
