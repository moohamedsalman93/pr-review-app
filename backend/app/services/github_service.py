import re
from datetime import datetime, timezone
from typing import List, Tuple
from github import Github
from ..config import get_settings
from .base_service import BasePRService, PRInfo, PRDiff, RecentPR


class GitHubService(BasePRService):
    """Service to interact with GitHub API and fetch PR data"""

    def __init__(self, token: str = None):
        settings = get_settings()
        self.token = token or settings.github_token
        if not self.token:
            raise ValueError("GitHub token is required. Please configure it in Settings.")
        # Keep provider calls responsive for aggregate endpoints like /recent.
        self.github = Github(self.token, timeout=8, per_page=30)

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

    def list_recent_prs(self, limit: int = 20) -> List[RecentPR]:
        """
        Fetch recent pull requests visible to the authenticated user.
        """
        safe_limit = max(1, min(int(limit or 20), 100))
        query = "is:pr archived:false sort:updated-desc involves:@me"
        issues = self.github.search_issues(query=query, sort="updated", order="desc")

        out: List[RecentPR] = []
        for issue in issues:
            if len(out) >= safe_limit:
                break
            if not getattr(issue, "pull_request", None):
                continue

            repo_name = ""
            if getattr(issue, "repository", None):
                repo_name = issue.repository.full_name or issue.repository.name or ""
            updated = issue.updated_at or datetime.now(timezone.utc)
            out.append(
                RecentPR(
                    provider="github",
                    project_name=repo_name,
                    pr_number=int(issue.number or 0),
                    title=issue.title or "",
                    author=issue.user.login if getattr(issue, "user", None) else "unknown",
                    state=issue.state or "open",
                    updated_at=updated,
                    web_url=issue.html_url or "",
                )
            )
        return out

    def list_recent_commits(self, limit: int = 20) -> List[RecentPR]:
        """
        Fetch recent commits visible to the authenticated user.
        """
        safe_limit = max(1, min(int(limit or 20), 100))
        out: List[RecentPR] = []
        seen: set[str] = set()

        # Fast path: authenticated user events are usually much cheaper than commit search.
        try:
            user = self.github.get_user()
            for event in user.get_events():
                if len(out) >= safe_limit:
                    break
                if getattr(event, "type", "") != "PushEvent":
                    continue
                payload = getattr(event, "payload", {}) or {}
                commits = payload.get("commits", []) or []
                repo_name = (getattr(event, "repo", None) and getattr(event.repo, "name", "")) or ""
                for commit_meta in commits:
                    if len(out) >= safe_limit:
                        break
                    sha = (commit_meta.get("sha", "") or "").strip()
                    if not sha:
                        continue
                    key = f"{repo_name}:{sha}"
                    if key in seen:
                        continue
                    seen.add(key)
                    short_sha = sha[:12]
                    message = str(commit_meta.get("message", "") or "").splitlines()[0]
                    url = f"https://github.com/{repo_name}/commit/{sha}" if repo_name else ""
                    out.append(
                        RecentPR(
                            provider="github",
                            project_name=repo_name,
                            pr_number=0,
                            title=f"{short_sha} {message}".strip() if short_sha else (message or "Commit"),
                            author=getattr(user, "login", None) or "unknown",
                            state="committed",
                            updated_at=getattr(event, "created_at", None) or datetime.now(timezone.utc),
                            web_url=url,
                        )
                    )
        except Exception:
            # Fallback path below handles provider limitations or event API failures.
            pass

        # Skip global commit search fallback to keep /recent responsive.
        return out[:safe_limit]

    def parse_commit_url(self, url: str) -> Tuple[str, str, str]:
        """
        Parse a GitHub commit URL to extract owner, repo, and commit SHA.

        Supports formats:
        - https://github.com/owner/repo/commit/<sha>
        - https://github.com/owner/repo/commit/<sha>/
        """
        url = url.rstrip("/")
        pattern = r"^https?://github\.com/([^/]+)/([^/]+)/commit/([0-9a-fA-F]+)(?:/.*)?$"
        match = re.match(pattern, url)
        if not match:
            raise ValueError(f"Invalid GitHub commit URL format: {url}")
        return match.group(1), match.group(2), match.group(3)

    def get_commit_info(self, commit_url: str) -> PRInfo:
        """
        Fetch commit information and file patches from GitHub.
        Returns a PRInfo-compatible object for reuse in downstream review flows.
        """
        owner, repo_name, commit_sha = self.parse_commit_url(commit_url)
        repo = self.github.get_repo(f"{owner}/{repo_name}")
        commit = repo.get_commit(commit_sha)

        diffs = []
        for file in getattr(commit, "files", []) or []:
            status = (file.status or "").lower()
            diff = PRDiff(
                filename=file.filename,
                old_path=file.previous_filename or file.filename,
                new_path=file.filename,
                diff=file.patch or "",
                new_file=status == "added",
                deleted_file=status == "removed",
                renamed_file=status == "renamed",
            )
            diffs.append(diff)

        source_branch = ""
        target_branch = ""
        for branch in repo.get_branches():
            if branch.commit.sha == commit.sha:
                source_branch = branch.name
                break

        short_sha = (commit.sha or commit_sha)[:12]
        return PRInfo(
            project_name=repo.name,
            pr_number=-1,
            title=f"Commit {short_sha}: {commit.commit.message.splitlines()[0] if commit.commit and commit.commit.message else ''}".strip(),
            author=commit.author.login if getattr(commit, "author", None) else (commit.commit.author.name if commit.commit and commit.commit.author else "unknown"),
            source_branch=source_branch,
            target_branch=target_branch,
            description=commit.commit.message if commit.commit else "",
            web_url=commit.html_url,
            diffs=diffs,
        )
