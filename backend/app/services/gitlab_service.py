import re
from typing import Tuple
import gitlab
from ..config import get_settings
from .base_service import BasePRService, PRInfo, PRDiff


class GitLabService(BasePRService):
    """Service to interact with GitLab API and fetch MR data"""

    def __init__(self):
        settings = get_settings()
        self.gitlab_url = settings.gitlab_url
        self.gl = gitlab.Gitlab(settings.gitlab_url, private_token=settings.gitlab_token)

    def parse_pr_url(self, url: str) -> Tuple[str, int]:
        """
        Parse a GitLab MR URL to extract project path and MR number.
        
        Supports formats:
        - https://gitlab.com/group/project/-/merge_requests/123
        - https://gitlab.com/group/subgroup/project/-/merge_requests/123
        """
        # Remove trailing slashes
        url = url.rstrip('/')
        
        # Pattern for GitLab MR URLs
        pattern = r'^https?://[^/]+/(.+)/-/merge_requests/(\d+)(?:/.*)?$'
        match = re.match(pattern, url)
        
        if not match:
            raise ValueError(f"Invalid GitLab MR URL format: {url}")
        
        project_path = match.group(1)
        mr_number = int(match.group(2))
        
        return project_path, mr_number

    def get_pr_info(self, pr_url: str) -> PRInfo:
        """
        Fetch merge request information and diffs from GitLab.
        
        Args:
            pr_url: Full GitLab merge request URL
            
        Returns:
            PRInfo object containing MR details and file diffs
        """
        project_path, mr_number = self.parse_pr_url(pr_url)
        
        # Get project
        project = self.gl.projects.get(project_path)
        
        # Get merge request
        mr = project.mergerequests.get(mr_number)
        
        # Get diffs
        changes = mr.changes()
        diffs = []
        
        for change in changes.get('changes', []):
            diff = PRDiff(
                filename=change.get('new_path', change.get('old_path', '')),
                old_path=change.get('old_path', ''),
                new_path=change.get('new_path', ''),
                diff=change.get('diff', ''),
                new_file=change.get('new_file', False),
                deleted_file=change.get('deleted_file', False),
                renamed_file=change.get('renamed_file', False)
            )
            diffs.append(diff)
        
        return PRInfo(
            project_name=project.name,
            pr_number=mr_number,
            title=mr.title,
            author=mr.author.get('username', 'unknown') if mr.author else 'unknown',
            source_branch=mr.source_branch,
            target_branch=mr.target_branch,
            description=mr.description or '',
            web_url=mr.web_url,
            diffs=diffs
        )
