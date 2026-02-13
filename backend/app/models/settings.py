from datetime import datetime
from sqlalchemy import Column, Integer, String, Text, DateTime
from ..database import Base


class AppSettings(Base):
    """Application settings stored in database"""
    __tablename__ = "app_settings"

    id = Column(Integer, primary_key=True, index=True)
    gitlab_url = Column(String(500), default="https://gitlab.com")
    gitlab_token = Column(Text, default="")
    github_token = Column(Text, default="")
    github_client_id = Column(String(200), default="")
    github_client_secret = Column(Text, default="")
    
    # AI settings
    ai_provider = Column(String(50), default="ollama") # ollama, openai, anthropic, gemini, etc.
    ai_model = Column(String(200), default="gemini-3-flash-preview:latest")
    ai_api_key = Column(Text, default="")
    ai_base_url = Column(String(500), default="http://localhost:11434")
    max_tokens = Column(Integer, default=128000)

    updated_at = Column(DateTime, default=datetime.utcnow, onupdate=datetime.utcnow)
