from datetime import datetime
from typing import List, Optional, Dict, Any
from pydantic import BaseModel


class SuggestionBase(BaseModel):
    file_path: str
    line_start: Optional[int] = None
    line_end: Optional[int] = None
    severity: str = "info"
    category: str = "style"
    original_code: Optional[str] = None
    improved_code: Optional[str] = None
    suggestion: str
    explanation: Optional[str] = None
    score: Optional[int] = None
    score_why: Optional[str] = None


class SuggestionCreate(SuggestionBase):
    pass


class SuggestionResponse(SuggestionBase):
    id: int
    review_id: int
    created_at: datetime

    class Config:
        from_attributes = True


class PRReviewBase(BaseModel):
    pr_url: str


class PRReviewCreate(PRReviewBase):
    rule_set_id: Optional[int] = None


class PRReviewResponse(PRReviewBase):
    id: int
    provider: str
    project_name: Optional[str] = None
    pr_number: Optional[int] = None
    pr_title: Optional[str] = None
    pr_author: Optional[str] = None
    source_branch: Optional[str] = None
    target_branch: Optional[str] = None
    status: str
    current_stage: Optional[str] = None
    processing_logs: Optional[List[Dict[str, Any]]] = None
    error_message: Optional[str] = None
    
    # New fields
    score: Optional[int] = None
    effort: Optional[int] = None
    security_concerns: Optional[str] = None
    can_be_split: Optional[List[Dict[str, Any]]] = None
    pr_description: Optional[str] = None
    
    created_at: datetime
    updated_at: datetime

    class Config:
        from_attributes = True


class PRReviewDetailResponse(PRReviewResponse):
    suggestions: List[SuggestionResponse] = []

    class Config:
        from_attributes = True


class PRReviewListResponse(BaseModel):
    items: List[PRReviewResponse]
    total: int
    page: int
    per_page: int


class ChatRequest(BaseModel):
    question: str
    review_id: int


class ChatResponse(BaseModel):
    answer: str
