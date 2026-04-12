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

    # Optional bundled OAuth (publisher sets these so users only click Connect).
    # Env names: GITHUB_OAUTH_CLIENT_ID, GITHUB_OAUTH_CLIENT_SECRET, etc.
    github_oauth_client_id: str = ""
    github_oauth_client_secret: str = ""
    gitlab_oauth_client_id: str = ""
    gitlab_oauth_client_secret: str = ""
    # GitLab bundled OAuth applies when Settings GitLab URL matches this origin.
    gitlab_oauth_instance_url: str = "https://gitlab.com"

    # Optional hosted GitHub OAuth bridge (secret stays on server). See /oauth-bridge in repo.
    pr_review_oauth_bridge_url: str = ""

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
        self.github_refresh_token = getattr(db_settings, "github_refresh_token", None) or ""
        self.gitlab_client_id = getattr(db_settings, "gitlab_client_id", None) or ""
        self.gitlab_client_secret = getattr(db_settings, "gitlab_client_secret", None) or ""
        self.gitlab_refresh_token = getattr(db_settings, "gitlab_refresh_token", None) or ""
        self.ai_provider = db_settings.ai_provider or "ollama"
        self.ai_model = db_settings.ai_model or "gemini-3-flash-preview:latest"
        self.ai_api_key = db_settings.ai_api_key or ""
        # Treat NULL/blank as "use provider default" (cloud != local)
        base_url = (db_settings.ai_base_url or "").strip()
        if not base_url:
            if self.ai_provider == "ollama_cloud":
                base_url = "https://ollama.com"
            else:
                base_url = "http://localhost:11434"
        self.ai_base_url = base_url
        self.max_tokens = db_settings.max_tokens or 128000
        self.review_runs = db_settings.review_runs or 1



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


def get_diagnostics() -> dict:
    """Return paths and env info for display in About / logs (no secrets)."""
    import os
    env_settings = get_env_settings()
    db_url = get_database_url()
    # Extract display path from sqlite URL
    if db_url.startswith("sqlite:///"):
        database_path = db_url.replace("sqlite:///", "").replace("/", os.sep)
    else:
        database_path = db_url
    from .log_buffer import get_log_file_path
    gh_pub = bool(
        (env_settings.github_oauth_client_id or "").strip()
        and (env_settings.github_oauth_client_secret or "").strip()
    )
    gl_pub = bool(
        (env_settings.gitlab_oauth_client_id or "").strip()
        and (env_settings.gitlab_oauth_client_secret or "").strip()
    )
    bridge_url = (env_settings.pr_review_oauth_bridge_url or "").strip().rstrip("/")
    bridge = bool(bridge_url)
    return {
        "database_path": database_path,
        "app_data_dir": env_settings.pr_review_app_data_dir or "(default / current directory)",
        "log_file_path": os.path.abspath(get_log_file_path()),
        "cwd": os.getcwd(),
        "bundled_github_oauth_configured": gh_pub,
        "bundled_gitlab_oauth_configured": gl_pub,
        "oauth_bridge_url_configured": bridge,
        "oauth_bridge_base_url": bridge_url,
    }


def clear_settings_cache():
    """Clear settings cache - call after updating settings"""
    global _settings_cache
    _settings_cache = None
