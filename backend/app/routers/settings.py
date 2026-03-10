from fastapi import APIRouter, Depends, HTTPException
from sqlalchemy.orm import Session
from typing import Optional
from ..database import get_db
from ..models import AppSettings
from ..schemas.settings import SettingsResponse, SettingsUpdate
from ..config import clear_settings_cache

router = APIRouter(prefix="/api/settings", tags=["settings"])

OLLAMA_LOCAL_DEFAULT_BASE_URL = "http://localhost:11434"
OLLAMA_CLOUD_DEFAULT_BASE_URL = "https://ollama.com"


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
    # Base URL depends on provider; also fix up legacy empty/incorrect values.
    current_base = (settings.ai_base_url or "").strip()
    if settings.ai_provider == "ollama_cloud":
        desired = OLLAMA_CLOUD_DEFAULT_BASE_URL
        if not current_base or current_base == OLLAMA_LOCAL_DEFAULT_BASE_URL:
            settings.ai_base_url = desired
            updated = True
    else:
        desired = OLLAMA_LOCAL_DEFAULT_BASE_URL if settings.ai_provider == "ollama" else current_base
        if not current_base and settings.ai_provider == "ollama":
            settings.ai_base_url = desired
            updated = True
    if settings.max_tokens is None:
        settings.max_tokens = 128000
        updated = True
    if getattr(settings, "review_runs", None) is None:
        settings.review_runs = 1
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


@router.get("/models")
async def get_available_models(
    provider: str,
    base_url: Optional[str] = None,
    api_key: Optional[str] = None
):
    """Fetch available models from the specified AI provider"""
    import httpx
    
    try:
        if provider in ["ollama", "ollama_cloud"]:
            # Local Ollama lists models from the local daemon; Cloud always lists from ollama.com.
            if provider == "ollama_cloud":
                resolved_base = OLLAMA_CLOUD_DEFAULT_BASE_URL
            else:
                resolved_base = (base_url or OLLAMA_LOCAL_DEFAULT_BASE_URL).rstrip("/")
            url = f"{resolved_base}/api/tags"

            headers = {}
            # Cloud requires a key; local usually doesn't (but keep header support).
            if api_key:
                headers["Authorization"] = f"Bearer {api_key}"

            async with httpx.AsyncClient() as client:
                response = await client.get(url, headers=headers, timeout=10.0)
                if response.status_code != 200:
                    return []

                data = response.json()
                models = [m.get("name") for m in data.get("models", []) if m.get("name")]
                return models
                
        elif provider == "openai":
            url = base_url or "https://api.openai.com/v1"
            if not url.endswith("/models"):
                url = f"{url.rstrip('/')}/models"
                
            headers = {}
            if api_key:
                headers["Authorization"] = f"Bearer {api_key}"
            
            async with httpx.AsyncClient() as client:
                response = await client.get(url, headers=headers, timeout=10.0)
                if response.status_code != 200:
                    return []
                
                data = response.json()
                models = [m["id"] for m in data.get("data", [])]
                # Filter for chat models to keep the list clean
                chat_models = [m for m in models if any(x in m.lower() for x in ["gpt-4", "gpt-3.5", "o1", "o3"])]
                return chat_models or models
                
        return []
    except Exception as e:
        print(f"Error fetching models: {e}")
        return []


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
    # Normalize base URL defaults for Ollama variants.
    incoming_base = (settings_data.ai_base_url or "").strip()
    if settings_data.ai_provider == "ollama_cloud":
        # Cloud endpoint is fixed; do not allow overriding via API.
        settings.ai_base_url = OLLAMA_CLOUD_DEFAULT_BASE_URL
    elif settings_data.ai_provider == "ollama":
        settings.ai_base_url = incoming_base or OLLAMA_LOCAL_DEFAULT_BASE_URL
    else:
        settings.ai_base_url = incoming_base
    settings.max_tokens = settings_data.max_tokens
    settings.review_runs = settings_data.review_runs

    
    db.commit()
    db.refresh(settings)
    
    # Clear cache so services pick up new settings
    clear_settings_cache()
    
    return settings
