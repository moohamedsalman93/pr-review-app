from pydantic import BaseModel
from typing import Optional
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

    class Config:
        from_attributes = True


class SettingsUpdate(SettingsBase):
    pass
