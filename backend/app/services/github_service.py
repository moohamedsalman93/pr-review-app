import re
from typing import Tuple
from github import Github
from ..config import get_settings
from .base_service import BasePRService, PRInfo, PRDiff


class GitHubService(BasePRService):
    """Service to interact with GitHub API and fetch PR data"""

    def __init__(self, token: str = None):
        settings = get_settings()
        self.token = token or settings.github_token
        if not self.token:
            raise ValueError("GitHub token is required. Please configure it in Settings.")
        self.github = Github(self.token)

    def parse_pr_url(self, url: str) -> Tuple[str, str, int]:
        """
        Parse a GitHub PR URL to extract owner, repo, and PR number.
        
        Supports formats:
        - https://github.com/owner/repo/pull/123
        - https://github.com/owner/repo/pull/123/
        - https://github.com/owner/repo/pull/123/files
        """
        # Remove trailing slashes
        url = url.rstrip('/')
        
        # Pattern for GitHub PR URLs
        pattern = r'^https?://github\.com/([^/]+)/([^/]+)/pull/(\d+)(?:/.*)?$'
        match = re.match(pattern, url)
        
        if not match:
            raise ValueError(f"Invalid GitHub PR URL format: {url}")
        
        owner = match.group(1)
        repo = match.group(2)
        pr_number = int(match.group(3))
        
        return owner, repo, pr_number

    def get_pr_info(self, pr_url: str) -> PRInfo:
        """
        Fetch pull request information and diffs from GitHub.
        
        Args:
            pr_url: Full GitHub pull request URL
            
        Returns:
            PRInfo object containing PR details and file diffs
        """
        owner, repo_name, pr_number = self.parse_pr_url(pr_url)
        
        # Get repository
        repo = self.github.get_repo(f"{owner}/{repo_name}")
        
        # Get pull request
        pr = repo.get_pull(pr_number)
        
        # Get files changed
        files = pr.get_files()
        diffs = []
        
        for file in files:
            # Determine file status
            status = file.status
            new_file = status == "added"
            deleted_file = status == "removed"
            renamed_file = status == "renamed"
            
            # Get patch content (diff)
            patch = file.patch or ""
            
            diff = PRDiff(
                filename=file.filename,
                old_path=file.previous_filename or file.filename,
                new_path=file.filename,
                diff=patch,
                new_file=new_file,
                deleted_file=deleted_file,
                renamed_file=renamed_file
            )
            diffs.append(diff)
        
        return PRInfo(
            project_name=repo.name,
            pr_number=pr_number,
            title=pr.title,
            author=pr.user.login if pr.user else 'unknown',
            source_branch=pr.head.ref,
            target_branch=pr.base.ref,
            description=pr.body or '',
            web_url=pr.html_url,
            diffs=diffs
        )
