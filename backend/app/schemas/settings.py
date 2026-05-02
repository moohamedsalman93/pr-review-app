from pydantic import BaseModel, Field
from typing import Optional, Dict
from datetime import datetime


class SettingsBase(BaseModel):
    gitlab_url: str = "https://gitlab.com"
    gitlab_token: str = ""
    github_token: str = ""
    github_client_id: str = ""
    github_client_secret: str = ""
    gitlab_client_id: str = ""
    gitlab_client_secret: str = ""
    
    # AI settings
    ai_provider: str = "ollama"
    ai_model: str = "qwen3:8b"
    ai_api_key: str = ""
    ai_base_url: str = "http://localhost:11434"
    llm_provider_configs: Dict[str, Dict[str, str]] = Field(default_factory=dict)
    max_tokens: int = 128000
    review_runs: int = 1



class SettingsResponse(SettingsBase):
    id: int
    updated_at: Optional[datetime] = None
    github_token_configured: bool = False
    gitlab_token_configured: bool = False
    github_client_secret_set: bool = False
    gitlab_client_secret_set: bool = False
    github_oauth_ready: bool = False
    gitlab_oauth_ready: bool = False
    github_publisher_oauth: bool = False
    gitlab_publisher_oauth: bool = False
    github_user_login: Optional[str] = None
    github_user_name: Optional[str] = None
    github_user_email: Optional[str] = None
    github_user_id: Optional[int] = None
    github_user_avatar_url: Optional[str] = None
    github_user_type: Optional[str] = None
    gitlab_user_username: Optional[str] = None
    gitlab_user_name: Optional[str] = None
    gitlab_user_email: Optional[str] = None
    gitlab_user_id: Optional[int] = None
    gitlab_user_avatar_url: Optional[str] = None
    gitlab_user_web_url: Optional[str] = None

    class Config:
        from_attributes = True


class SettingsUpdate(SettingsBase):
    """PUT body: set disconnect_* to clear stored tokens (OAuth or PAT)."""

    disconnect_github: bool = False
    disconnect_gitlab: bool = False
