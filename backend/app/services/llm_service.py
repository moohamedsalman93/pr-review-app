from dataclasses import dataclass


@dataclass
class CodeSuggestion:
    """Represents a single code review suggestion"""
    file_path: str
    line_start: int | None
    line_end: int | None
    severity: str  # info, warning, error
    category: str  # style, bug, performance, security, best_practice
    original_code: str | None
    improved_code: str | None
    suggestion: str
    explanation: str | None
    score: int | None = None
    score_why: str | None = None
