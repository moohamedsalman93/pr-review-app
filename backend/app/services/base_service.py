from abc import ABC, abstractmethod
from dataclasses import dataclass
from typing import List, Tuple


@dataclass
class PRDiff:
    """Represents a file diff in a pull/merge request"""
    filename: str
    old_path: str
    new_path: str
    diff: str
    new_file: bool
    deleted_file: bool
    renamed_file: bool


@dataclass
class PRInfo:
    """Pull/Merge request information"""
    project_name: str
    pr_number: int
    title: str
    author: str
    source_branch: str
    target_branch: str
    description: str
    web_url: str
    diffs: List[PRDiff]


class BasePRService(ABC):
    """Abstract base class for PR/MR provider services"""

    @abstractmethod
    def parse_pr_url(self, url: str) -> Tuple[str, ...]:
        """
        Parse a PR/MR URL to extract provider-specific identifiers.
        
        Returns:
            Tuple of identifiers needed to fetch the PR (e.g., owner, repo, pr_number for GitHub)
        """
        pass

    @abstractmethod
    def get_pr_info(self, pr_url: str) -> PRInfo:
        """
        Fetch pull/merge request information and diffs.
        
        Args:
            pr_url: Full PR/MR URL
            
        Returns:
            PRInfo object containing PR details and file diffs
        """
        pass

