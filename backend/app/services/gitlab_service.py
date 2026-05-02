import re
from datetime import datetime, timezone
from typing import List, Tuple
import gitlab
from ..config import get_settings
from .base_service import BasePRService, PRInfo, PRDiff, RecentPR


class GitLabService(BasePRService):
    """Service to interact with GitLab API and fetch MR data"""

    def __init__(self):
        settings = get_settings()
        self.gitlab_url = settings.gitlab_url
        # Keep requests bounded so one provider cannot stall /recent for too long.
        self.gl = gitlab.Gitlab(settings.gitlab_url, private_token=settings.gitlab_token, timeout=8)

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

    def list_recent_prs(self, limit: int = 20) -> List[RecentPR]:
        """
        Fetch recent merge requests visible to the authenticated user.
        """
        safe_limit = max(1, min(int(limit or 20), 100))
        mrs = self.gl.mergerequests.list(
            scope="all",
            state="opened",
            order_by="updated_at",
            sort="desc",
            per_page=safe_limit,
            page=1,
        )

        out: List[RecentPR] = []
        for mr in mrs or []:
            updated_raw = getattr(mr, "updated_at", None)
            updated = datetime.now(timezone.utc)
            if isinstance(updated_raw, str) and updated_raw:
                updated = datetime.fromisoformat(updated_raw.replace("Z", "+00:00"))
            out.append(
                RecentPR(
                    provider="gitlab",
                    project_name=str(getattr(mr, "references", {}).get("full", "") or getattr(mr, "project_id", "")),
                    pr_number=int(getattr(mr, "iid", 0) or 0),
                    title=getattr(mr, "title", "") or "",
                    author=(getattr(mr, "author", {}) or {}).get("username", "unknown"),
                    state=getattr(mr, "state", "opened") or "opened",
                    updated_at=updated,
                    web_url=getattr(mr, "web_url", "") or "",
                )
            )
        return out

    def list_recent_commits(self, limit: int = 20) -> List[RecentPR]:
        """
        Fetch recent commits from projects visible to the authenticated user.
        """
        safe_limit = max(1, min(int(limit or 20), 100))
        # Keep project scan bounded: we only need enough projects to produce `safe_limit` commits.
        project_scan_cap = min(8, max(3, safe_limit))
        projects = self.gl.projects.list(
            membership=True,
            order_by="updated_at",
            sort="desc",
            per_page=project_scan_cap,
            page=1,
        )

        out: List[RecentPR] = []
        for p in projects or []:
            if len(out) >= safe_limit:
                break
            try:
                # `projects.get(...)` for every project is expensive.
                # Use list payload first and only query commits directly.
                project_name = (
                    getattr(p, "path_with_namespace", None)
                    or getattr(p, "name", None)
                    or str(getattr(p, "id", ""))
                )

                ref_candidates = []
                default_branch = getattr(p, "default_branch", None)
                if default_branch:
                    ref_candidates.append(default_branch)
                ref_candidates.extend(["main", "master"])

                commits = []
                for ref_name in ref_candidates:
                    try:
                        commits = p.commits.list(ref_name=ref_name, per_page=3, page=1)
                        if commits:
                            break
                    except Exception:
                        continue
                for c in commits or []:
                    if len(out) >= safe_limit:
                        break
                    updated_raw = getattr(c, "committed_date", None) or getattr(c, "created_at", None)
                    updated = datetime.now(timezone.utc)
                    if isinstance(updated_raw, str) and updated_raw:
                        updated = datetime.fromisoformat(updated_raw.replace("Z", "+00:00"))
                    sha = (getattr(c, "id", "") or "")[:12]
                    title_line = (getattr(c, "title", "") or getattr(c, "message", "") or "").splitlines()[0]
                    out.append(
                        RecentPR(
                            provider="gitlab",
                            project_name=project_name,
                            pr_number=0,
                            title=f"{sha} {title_line}".strip() if sha else (title_line or "Commit"),
                            author=getattr(c, "author_name", None) or "unknown",
                            state="committed",
                            updated_at=updated,
                            web_url=getattr(c, "web_url", "") or "",
                        )
                    )
            except Exception:
                continue
        return out

    def parse_commit_url(self, url: str) -> Tuple[str, str]:
        """
        Parse a GitLab commit URL to extract project path and commit SHA.

        Supports formats:
        - https://gitlab.com/group/project/-/commit/<sha>
        - https://gitlab.com/group/subgroup/project/-/commit/<sha>
        """
        url = url.rstrip("/")
        pattern = r"^https?://[^/]+/(.+)/-/commit/([0-9a-fA-F]+)(?:/.*)?$"
        match = re.match(pattern, url)
        if not match:
            raise ValueError(f"Invalid GitLab commit URL format: {url}")
        return match.group(1), match.group(2)

    def get_commit_info(self, commit_url: str) -> PRInfo:
        """
        Fetch commit information and file patches from GitLab.
        Returns a PRInfo-compatible object for reuse in downstream review flows.
        """
        project_path, commit_sha = self.parse_commit_url(commit_url)
        project = self.gl.projects.get(project_path)
        commit = project.commits.get(commit_sha)
        commit_diff = project.commits.get(commit_sha).diff()

        diffs = []
        for change in commit_diff or []:
            old_path = change.get("old_path", "") or change.get("new_path", "")
            new_path = change.get("new_path", "") or old_path
            diff = PRDiff(
                filename=new_path,
                old_path=old_path,
                new_path=new_path,
                diff=change.get("diff", ""),
                new_file=change.get("new_file", False),
                deleted_file=change.get("deleted_file", False),
                renamed_file=change.get("renamed_file", False),
            )
            diffs.append(diff)

        short_sha = (commit.id or commit_sha)[:12]
        title_line = (commit.title or commit.message or "").splitlines()[0] if (commit.title or commit.message) else ""
        return PRInfo(
            project_name=project.name,
            pr_number=-1,
            title=f"Commit {short_sha}: {title_line}".strip(),
            author=commit.author_name or "unknown",
            source_branch="",
            target_branch="",
            description=commit.message or "",
            web_url=commit.web_url,
            diffs=diffs,
        )
