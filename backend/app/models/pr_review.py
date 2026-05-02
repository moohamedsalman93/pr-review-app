from datetime import datetime, timezone
from sqlalchemy import Column, Integer, String, Text, DateTime, ForeignKey, Enum, JSON
from sqlalchemy.orm import relationship
from ..database import Base
import enum
import json


class ReviewStatus(str, enum.Enum):
    PENDING = "pending"
    REVIEWING = "reviewing"
    COMPLETED = "completed"
    FAILED = "failed"


class SuggestionSeverity(str, enum.Enum):
    INFO = "info"
    WARNING = "warning"
    ERROR = "error"


class SuggestionCategory(str, enum.Enum):
    STYLE = "style"
    BUG = "bug"
    PERFORMANCE = "performance"
    SECURITY = "security"
    BEST_PRACTICE = "best_practice"


class ProviderType(str, enum.Enum):
    GITLAB = "gitlab"
    GITHUB = "github"


class PRReview(Base):
    __tablename__ = "pr_reviews"

    id = Column(Integer, primary_key=True, index=True)
    pr_url = Column(Text, nullable=False)  # Target URL (PR/MR or commit URL)
    target_type = Column(String(20), nullable=False, default="pr")  # pr | commit
    target_ref = Column(String(200), nullable=True)  # PR number or commit SHA
    target_base_ref = Column(String(200), nullable=True)  # Optional base branch/SHA for commit comparisons
    provider = Column(String(50), nullable=False)  # New field: 'gitlab' or 'github'
    project_name = Column(String(500))
    pr_number = Column(Integer)  # Renamed from mr_number
    pr_title = Column(String(500))  # Renamed from mr_title
    pr_author = Column(String(200))  # Renamed from mr_author
    source_branch = Column(String(200))
    target_branch = Column(String(200))
    status = Column(String(50), default=ReviewStatus.PENDING.value)
    current_stage = Column(String(100), nullable=True)
    processing_logs = Column(JSON, nullable=True)  # Array of log entries
    error_message = Column(Text, nullable=True)
    
    # New fields for advanced review details
    score = Column(Integer, nullable=True)
    effort = Column(Integer, nullable=True)
    security_concerns = Column(Text, nullable=True)
    can_be_split = Column(JSON, nullable=True)
    pr_description = Column(Text, nullable=True)
    
    # Rule set reference
    rule_set_id = Column(Integer, ForeignKey("review_rule_sets.id"), nullable=True)
    rule_set = relationship("ReviewRuleSet")
    
    created_at = Column(DateTime(timezone=True), default=lambda: datetime.now(timezone.utc))
    updated_at = Column(
        DateTime(timezone=True),
        default=lambda: datetime.now(timezone.utc),
        onupdate=lambda: datetime.now(timezone.utc),
    )
    
    def add_log(self, message: str, level: str = "info", db=None):
        """Add a log entry to processing_logs"""
        if self.processing_logs is None:
            self.processing_logs = []
        
        # Create a new list copy so SQLAlchemy detects the change to the JSON column
        updated_logs = list(self.processing_logs)
        log_entry = {
            "timestamp": datetime.now(timezone.utc).isoformat(),
            "level": level,
            "message": message
        }
        updated_logs.append(log_entry)
        self.processing_logs = updated_logs
        
        # Note: db.commit() should be called by the caller after add_log
        # We don't commit here to allow multiple logs to be added before committing

    suggestions = relationship("Suggestion", back_populates="review", cascade="all, delete-orphan")
    chat_messages = relationship(
        "PRChatMessage",
        back_populates="review",
        cascade="all, delete-orphan",
        order_by="PRChatMessage.created_at.asc()",
    )


class Suggestion(Base):
    __tablename__ = "suggestions"

    id = Column(Integer, primary_key=True, index=True)
    review_id = Column(Integer, ForeignKey("pr_reviews.id", ondelete="CASCADE"), nullable=False)
    file_path = Column(Text, nullable=False)
    line_start = Column(Integer, nullable=True)
    line_end = Column(Integer, nullable=True)
    severity = Column(String(50), default=SuggestionSeverity.INFO.value)
    category = Column(String(50), default=SuggestionCategory.STYLE.value)
    original_code = Column(Text, nullable=True)
    improved_code = Column(Text, nullable=True)
    suggestion = Column(Text, nullable=False)
    explanation = Column(Text, nullable=True)
    score = Column(Integer, nullable=True)
    score_why = Column(Text, nullable=True)
    created_at = Column(DateTime(timezone=True), default=lambda: datetime.now(timezone.utc))

    review = relationship("PRReview", back_populates="suggestions")


class ChatRole(str, enum.Enum):
    USER = "user"
    ASSISTANT = "assistant"


class PRChatMessage(Base):
    __tablename__ = "pr_chat_messages"

    id = Column(Integer, primary_key=True, index=True)
    review_id = Column(Integer, ForeignKey("pr_reviews.id", ondelete="CASCADE"), nullable=False, index=True)
    role = Column(String(20), nullable=False)  # "user" | "assistant"
    content = Column(Text, nullable=False)
    created_at = Column(DateTime(timezone=True), default=lambda: datetime.now(timezone.utc), index=True)

    review = relationship("PRReview", back_populates="chat_messages")
