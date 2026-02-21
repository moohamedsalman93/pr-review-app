from pydantic_settings import BaseSettings
from functools import lru_cache
from sqlalchemy.orm import Session
from typing import TYPE_CHECKING

if TYPE_CHECKING:
    from .models import AppSettings


class EnvSettings(BaseSettings):
    """Environment settings - only DATABASE_URL is required from env"""
    database_url: str = "sqlite:///./pr_review.db"
    pr_review_app_data_dir: str | None = None  # App data directory from Tauri

    class Config:
        env_file = ".env"
        env_file_encoding = "utf-8"
        extra = "ignore"  # Ignore extra fields from .env file (they're now in database)


@lru_cache()
def get_env_settings() -> EnvSettings:
    """Get environment settings (only DATABASE_URL)"""
    return EnvSettings()


class DatabaseSettings:
    """Settings loaded from database"""
    def __init__(self, db_settings: "AppSettings"):
        self.gitlab_url = db_settings.gitlab_url or "https://gitlab.com"
        self.gitlab_token = db_settings.gitlab_token or ""
        self.github_token = db_settings.github_token or ""
        self.github_client_id = db_settings.github_client_id or ""
        self.github_client_secret = db_settings.github_client_secret or ""
        self.ai_provider = db_settings.ai_provider or "ollama"
        self.ai_model = db_settings.ai_model or "gemini-3-flash-preview:latest"
        self.ai_api_key = db_settings.ai_api_key or ""
        self.ai_base_url = db_settings.ai_base_url or "http://localhost:11434"
        self.max_tokens = db_settings.max_tokens or 128000



def get_db_settings() -> DatabaseSettings:
    """Get settings from database, creating defaults if none exist"""
    # Import here to avoid circular dependency
    from .database import SessionLocal
    from .models import AppSettings
    
    db: Session = SessionLocal()
    try:
        settings = db.query(AppSettings).first()
        if not settings:
            # Create default settings
            settings = AppSettings()
            db.add(settings)
            db.commit()
            db.refresh(settings)
        return DatabaseSettings(settings)
    finally:
        db.close()


# Cache settings but allow clearing cache when updated
_settings_cache = None

def get_settings() -> DatabaseSettings:
    """Get application settings from database (cached)"""
    global _settings_cache
    if _settings_cache is None:
        _settings_cache = get_db_settings()
    return _settings_cache


def get_database_url() -> str:
    """Get database URL from environment (required for DB connection)"""
    env_settings = get_env_settings()
    
    # If app data directory is provided (from Tauri), use it for the database
    if env_settings.pr_review_app_data_dir:
        import os
        db_path = os.path.join(env_settings.pr_review_app_data_dir, "pr_review.db")
        # Ensure directory exists
        os.makedirs(env_settings.pr_review_app_data_dir, exist_ok=True)
        # Convert to absolute path and normalize separators for SQLite URL
        db_path = os.path.abspath(db_path).replace("\\", "/")
        return f"sqlite:///{db_path}"
    
    # Otherwise use the default relative path
    return env_settings.database_url


def clear_settings_cache():
    """Clear settings cache - call after updating settings"""
    global _settings_cache
    _settings_cache = None
