from fastapi import APIRouter, Depends, HTTPException
from sqlalchemy.orm import Session
from ..database import get_db
from ..models import AppSettings
from ..schemas.settings import SettingsResponse, SettingsUpdate
from ..config import clear_settings_cache

router = APIRouter(prefix="/api/settings", tags=["settings"])


def get_or_create_settings(db: Session) -> AppSettings:
    """Get settings or create default if none exists"""
    settings = db.query(AppSettings).first()
    if not settings:
        settings = AppSettings()
        db.add(settings)
        db.commit()
        db.refresh(settings)
    
    # Ensure new fields have defaults if they are NULL in existing record
    updated = False
    if settings.ai_provider is None:
        settings.ai_provider = "ollama"
        updated = True
    if settings.ai_model is None or settings.ai_model == "qwen3:8b":
        settings.ai_model = "gemini-3-flash-preview:latest"
        updated = True
    if settings.ai_api_key is None:
        settings.ai_api_key = ""
        updated = True
    if settings.ai_base_url is None:
        settings.ai_base_url = "http://localhost:11434"
        updated = True
    if settings.max_tokens is None:
        settings.max_tokens = 128000
        updated = True
        
    if updated:
        db.commit()
        db.refresh(settings)
        
    return settings


@router.get("", response_model=SettingsResponse)
def get_app_settings(db: Session = Depends(get_db)):
    """Get current application settings"""
    settings = get_or_create_settings(db)
    return settings


@router.put("", response_model=SettingsResponse)
def update_settings(
    settings_data: SettingsUpdate,
    db: Session = Depends(get_db)
):
    """Update application settings"""
    settings = get_or_create_settings(db)
    
    # Update all fields
    settings.gitlab_url = settings_data.gitlab_url
    settings.gitlab_token = settings_data.gitlab_token
    settings.github_token = settings_data.github_token
    settings.github_client_id = settings_data.github_client_id
    settings.github_client_secret = settings_data.github_client_secret
    
    # Update AI settings
    settings.ai_provider = settings_data.ai_provider
    settings.ai_model = settings_data.ai_model
    settings.ai_api_key = settings_data.ai_api_key
    settings.ai_base_url = settings_data.ai_base_url
    settings.max_tokens = settings_data.max_tokens

    
    db.commit()
    db.refresh(settings)
    
    # Clear cache so services pick up new settings
    clear_settings_cache()
    
    return settings
