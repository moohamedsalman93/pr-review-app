from datetime import datetime
from sqlalchemy import Column, Integer, String, Text, DateTime, Boolean
from ..database import Base


class ReviewRuleSet(Base):
    """Model for storing custom review rule sets"""
    __tablename__ = "review_rule_sets"
    
    id = Column(Integer, primary_key=True, index=True)
    name = Column(String(200), nullable=False, unique=True)  # e.g., "frontend-digiclass"
    description = Column(Text, nullable=True)  # Optional description
    instructions = Column(Text, nullable=False)  # The actual rules/instructions for pr-agent
    is_active = Column(Boolean, default=True)  # Soft delete support
    created_at = Column(DateTime, default=datetime.utcnow)
    updated_at = Column(DateTime, default=datetime.utcnow, onupdate=datetime.utcnow)
