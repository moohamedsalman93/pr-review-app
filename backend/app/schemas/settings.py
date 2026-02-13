from pydantic import BaseModel
from typing import Optional
from datetime import datetime


class SettingsBase(BaseModel):
    gitlab_url: str = "https://gitlab.com"
    gitlab_token: str = ""
    github_token: str = ""
    github_client_id: str = ""
    github_client_secret: str = ""
    
    # AI settings
    ai_provider: str = "ollama"
    ai_model: str = "qwen3:8b"
    ai_api_key: str = ""
    ai_base_url: str = "http://localhost:11434"
    max_tokens: int = 128000



class SettingsResponse(SettingsBase):
    id: int
    updated_at: Optional[datetime] = None

    class Config:
        from_attributes = True


class SettingsUpdate(SettingsBase):
    pass
