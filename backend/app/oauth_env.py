"""
Bundled OAuth credentials from environment (publisher / distribution).
DB settings override when non-empty. GitLab env creds apply only when
GitLab URL matches GITLAB_OAUTH_INSTANCE_URL (default https://gitlab.com).
"""
from __future__ import annotations

from urllib.parse import urlparse

from .config import get_env_settings
from .models import AppSettings


def _normalize_origin(url: str) -> str:
    u = (url or "").strip().rstrip("/")
    if not u:
        return ""
    if "://" not in u:
        u = f"https://{u}"
    p = urlparse(u)
    if not p.scheme or not p.netloc:
        return ""
    return f"{p.scheme}://{p.netloc}".rstrip("/").lower()


def effective_github_oauth_credentials(settings: AppSettings) -> tuple[str, str]:
    env = get_env_settings()
    cid = (settings.github_client_id or "").strip() or (env.github_oauth_client_id or "").strip()
    sec = (settings.github_client_secret or "").strip() or (env.github_oauth_client_secret or "").strip()
    return cid, sec


def effective_gitlab_oauth_credentials(settings: AppSettings) -> tuple[str, str]:
    env = get_env_settings()
    db_cid = (settings.gitlab_client_id or "").strip()
    db_sec = (settings.gitlab_client_secret or "").strip()
    user_base = _normalize_origin(settings.gitlab_url or "https://gitlab.com")
    bundled_base = _normalize_origin(env.gitlab_oauth_instance_url or "https://gitlab.com")
    env_cid = (env.gitlab_oauth_client_id or "").strip()
    env_sec = (env.gitlab_oauth_client_secret or "").strip()
    if user_base == bundled_base and env_cid and env_sec:
        return db_cid or env_cid, db_sec or env_sec
    return db_cid, db_sec


def github_oauth_ready(settings: AppSettings) -> bool:
    env = get_env_settings()
    if (getattr(env, "pr_review_oauth_bridge_url", None) or "").strip():
        return True
    cid, sec = effective_github_oauth_credentials(settings)
    return bool(cid and sec)


def gitlab_oauth_ready(settings: AppSettings) -> bool:
    cid, sec = effective_gitlab_oauth_credentials(settings)
    return bool(cid and sec)


def github_publisher_oauth_configured() -> bool:
    env = get_env_settings()
    if (getattr(env, "pr_review_oauth_bridge_url", None) or "").strip():
        return True
    return bool(
        (env.github_oauth_client_id or "").strip() and (env.github_oauth_client_secret or "").strip()
    )


def gitlab_publisher_oauth_configured(settings: AppSettings) -> bool:
    env = get_env_settings()
    if not (env.gitlab_oauth_client_id or "").strip() or not (env.gitlab_oauth_client_secret or "").strip():
        return False
    user_base = _normalize_origin(settings.gitlab_url or "https://gitlab.com")
    bundled_base = _normalize_origin(env.gitlab_oauth_instance_url or "https://gitlab.com")
    return user_base == bundled_base
