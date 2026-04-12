"""
OAuth2 authorization-code + PKCE for GitHub and GitLab.
Redirect URIs: http://127.0.0.1:47685/api/oauth/{provider}/callback
"""
from __future__ import annotations

import asyncio
import base64
import hashlib
import secrets
import time
from typing import Any, Literal, Optional
from urllib.parse import urlencode, urlparse

import httpx
from fastapi import APIRouter, Depends, HTTPException
from fastapi.responses import HTMLResponse
from sqlalchemy.orm import Session

from ..config import clear_settings_cache, get_env_settings
from ..database import get_db
from ..oauth_env import effective_github_oauth_credentials, effective_gitlab_oauth_credentials
from .settings import get_or_create_settings

router = APIRouter(prefix="/api/oauth", tags=["oauth"])

OAUTH_PUBLIC_BASE = "http://127.0.0.1:47685"
_PENDING_TTL_SEC = 600

Provider = Literal["github", "gitlab"]

_lock = asyncio.Lock()
_pending: dict[str, dict[str, Any]] = {}
_results: dict[str, dict[str, Any]] = {}


def _now() -> float:
    return time.monotonic()


def _cleanup_stale() -> None:
    cutoff = _now() - _PENDING_TTL_SEC
    stale_states = [s for s, v in _pending.items() if v.get("created", 0) < cutoff]
    for s in stale_states:
        _pending.pop(s, None)
        _results.pop(s, None)


def _pkce_pair() -> tuple[str, str]:
    verifier = secrets.token_urlsafe(32)
    digest = hashlib.sha256(verifier.encode("ascii")).digest()
    challenge = base64.urlsafe_b64encode(digest).rstrip(b"=").decode("ascii")
    return verifier, challenge


def _gitlab_token_base(gitlab_url: str) -> str:
    u = (gitlab_url or "").strip().rstrip("/")
    if not u:
        u = "https://gitlab.com"
    parsed = urlparse(u)
    if not parsed.scheme or not parsed.netloc:
        raise ValueError("Invalid GitLab URL")
    return f"{parsed.scheme}://{parsed.netloc}"


@router.post("/github/start")
async def github_oauth_start(db: Session = Depends(get_db)):
    bridge = (get_env_settings().pr_review_oauth_bridge_url or "").strip().rstrip("/")
    if bridge:
        try:
            async with httpx.AsyncClient() as client:
                r = await client.post(f"{bridge}/github/start", timeout=45.0)
            if r.status_code >= 400:
                try:
                    body = r.json()
                    detail = body.get("detail", r.text)
                except Exception:
                    detail = r.text or str(r.status_code)
                raise HTTPException(status_code=502, detail=f"OAuth bridge error: {detail}")
            return r.json()
        except HTTPException:
            raise
        except Exception as e:
            raise HTTPException(
                status_code=502,
                detail=f"OAuth bridge unreachable ({bridge}). Is it deployed and PUBLIC_BASE_URL correct? {e}",
            )

    settings = get_or_create_settings(db)
    client_id, client_secret = effective_github_oauth_credentials(settings)
    if not client_id or not client_secret:
        raise HTTPException(
            status_code=400,
            detail="GitHub OAuth is not configured. Use a PAT, set Client ID/Secret in Settings, set GITHUB_OAUTH_* on the backend, or set PR_REVIEW_OAUTH_BRIDGE_URL to a deployed oauth-bridge.",
        )
    state = secrets.token_urlsafe(32)
    verifier, challenge = _pkce_pair()
    redirect_uri = f"{OAUTH_PUBLIC_BASE}/api/oauth/github/callback"
    params = {
        "client_id": client_id,
        "redirect_uri": redirect_uri,
        "scope": "repo read:org",
        "state": state,
        "code_challenge": challenge,
        "code_challenge_method": "S256",
    }
    url = f"https://github.com/login/oauth/authorize?{urlencode(params)}"
    async with _lock:
        _cleanup_stale()
        _pending[state] = {
            "provider": "github",
            "code_verifier": verifier,
            "created": _now(),
        }
        _results[state] = {"status": "pending"}
    return {"authorize_url": url, "state": state}


@router.get("/github/callback")
async def github_oauth_callback(
    code: Optional[str] = None,
    state: Optional[str] = None,
    error: Optional[str] = None,
    error_description: Optional[str] = None,
    db: Session = Depends(get_db),
):
    async def finish(html_title: str, body: str) -> HTMLResponse:
        return HTMLResponse(
            content=f"""<!DOCTYPE html><html><head><meta charset="utf-8"><title>{html_title}</title></head>
<body style="font-family:system-ui;padding:2rem;">{body}</body></html>"""
        )

    if error:
        msg = error_description or error
        async with _lock:
            if state and state in _results:
                _results[state] = {"status": "error", "message": msg}
        return await finish("OAuth error", f"<p>Authorization failed: {msg}</p><p>You can close this window.</p>")

    if not code or not state:
        return await finish("OAuth error", "<p>Missing code or state.</p>")

    async with _lock:
        row = _pending.pop(state, None)
        if not row or row.get("provider") != "github":
            _results[state] = {"status": "error", "message": "Invalid or expired state"}
            return await finish(
                "OAuth error",
                "<p>Invalid or expired session. Start again from the app.</p>",
            )
        verifier = row["code_verifier"]

    settings = get_or_create_settings(db)
    client_id, client_secret = effective_github_oauth_credentials(settings)
    redirect_uri = f"{OAUTH_PUBLIC_BASE}/api/oauth/github/callback"

    if not client_id or not client_secret:
        async with _lock:
            _results[state] = {"status": "error", "message": "OAuth client not configured"}
        return await finish("OAuth error", "<p>GitHub OAuth client is not configured.</p>")

    try:
        async with httpx.AsyncClient() as client:
            r = await client.post(
                "https://github.com/login/oauth/access_token",
                headers={"Accept": "application/json"},
                data={
                    "client_id": client_id,
                    "client_secret": client_secret,
                    "code": code,
                    "redirect_uri": redirect_uri,
                    "code_verifier": verifier,
                },
                timeout=30.0,
            )
            data = r.json()
    except Exception as e:
        async with _lock:
            _results[state] = {"status": "error", "message": str(e)}
        return await finish("OAuth error", f"<p>Token exchange failed: {e}</p>")

    if "error" in data:
        msg = data.get("error_description") or data.get("error", "unknown")
        async with _lock:
            _results[state] = {"status": "error", "message": msg}
        return await finish("OAuth error", f"<p>{msg}</p>")

    access = data.get("access_token")
    if not access:
        async with _lock:
            _results[state] = {"status": "error", "message": "No access_token in response"}
        return await finish("OAuth error", "<p>No access token received.</p>")

    refresh = data.get("refresh_token") or ""
    settings.github_token = access
    if refresh:
        settings.github_refresh_token = refresh
    db.commit()
    db.refresh(settings)
    clear_settings_cache()

    async with _lock:
        _results[state] = {"status": "success"}

    return await finish(
        "Connected",
        "<p>GitHub connected successfully. You can close this window and return to the app.</p>",
    )


@router.get("/github/poll")
async def github_oauth_poll(state: str, db: Session = Depends(get_db)):
    bridge = (get_env_settings().pr_review_oauth_bridge_url or "").strip().rstrip("/")
    if bridge:
        try:
            async with httpx.AsyncClient() as client:
                r = await client.get(f"{bridge}/github/poll", params={"state": state}, timeout=30.0)
        except Exception as e:
            raise HTTPException(status_code=502, detail=f"OAuth bridge poll failed: {e}")
        if r.status_code == 404:
            raise HTTPException(status_code=404, detail="Unknown state")
        try:
            data = r.json()
        except Exception:
            raise HTTPException(status_code=502, detail="Invalid response from OAuth bridge")
        if data.get("status") == "success" and data.get("access_token"):
            settings = get_or_create_settings(db)
            settings.github_token = data["access_token"]
            rt = (data.get("refresh_token") or "").strip()
            if rt:
                settings.github_refresh_token = rt
            db.commit()
            db.refresh(settings)
            clear_settings_cache()
            return {"status": "success"}
        if data.get("status") == "error":
            return {"status": "error", "message": data.get("message", "Authorization failed")}
        return {"status": "pending"}

    async with _lock:
        _cleanup_stale()
        row = _results.get(state)
        if not row:
            raise HTTPException(status_code=404, detail="Unknown state")
        return row


@router.post("/gitlab/start")
async def gitlab_oauth_start(db: Session = Depends(get_db)):
    settings = get_or_create_settings(db)
    client_id, client_secret = effective_gitlab_oauth_credentials(settings)
    if not client_id or not client_secret:
        raise HTTPException(
            status_code=400,
            detail="GitLab OAuth is not configured. Use a PAT, add Application ID/Secret in Settings, or set GITLAB_OAUTH_* env vars for the matching GitLab instance.",
        )
    try:
        base = _gitlab_token_base(settings.gitlab_url or "")
    except ValueError:
        raise HTTPException(status_code=400, detail="Invalid GitLab URL in Settings.")

    state = secrets.token_urlsafe(32)
    verifier, challenge = _pkce_pair()
    redirect_uri = f"{OAUTH_PUBLIC_BASE}/api/oauth/gitlab/callback"
    params = {
        "client_id": client_id,
        "redirect_uri": redirect_uri,
        "response_type": "code",
        "state": state,
        "scope": "read_api",
        "code_challenge": challenge,
        "code_challenge_method": "S256",
    }
    url = f"{base}/oauth/authorize?{urlencode(params)}"
    async with _lock:
        _cleanup_stale()
        _pending[state] = {
            "provider": "gitlab",
            "code_verifier": verifier,
            "created": _now(),
        }
        _results[state] = {"status": "pending"}
    return {"authorize_url": url, "state": state}


@router.get("/gitlab/callback")
async def gitlab_oauth_callback(
    code: Optional[str] = None,
    state: Optional[str] = None,
    error: Optional[str] = None,
    error_description: Optional[str] = None,
    db: Session = Depends(get_db),
):
    async def finish(html_title: str, body: str) -> HTMLResponse:
        return HTMLResponse(
            content=f"""<!DOCTYPE html><html><head><meta charset="utf-8"><title>{html_title}</title></head>
<body style="font-family:system-ui;padding:2rem;">{body}</body></html>"""
        )

    if error:
        msg = error_description or error
        async with _lock:
            if state and state in _results:
                _results[state] = {"status": "error", "message": msg}
        return await finish("OAuth error", f"<p>Authorization failed: {msg}</p><p>You can close this window.</p>")

    if not code or not state:
        return await finish("OAuth error", "<p>Missing code or state.</p>")

    async with _lock:
        row = _pending.pop(state, None)
        if not row or row.get("provider") != "gitlab":
            _results[state] = {"status": "error", "message": "Invalid or expired state"}
            return await finish(
                "OAuth error",
                "<p>Invalid or expired session. Start again from the app.</p>",
            )
        verifier = row["code_verifier"]

    settings = get_or_create_settings(db)
    client_id, client_secret = effective_gitlab_oauth_credentials(settings)
    redirect_uri = f"{OAUTH_PUBLIC_BASE}/api/oauth/gitlab/callback"
    try:
        base = _gitlab_token_base(settings.gitlab_url or "")
    except ValueError:
        async with _lock:
            _results[state] = {"status": "error", "message": "Invalid GitLab URL"}
        return await finish("OAuth error", "<p>Invalid GitLab URL in settings.</p>")

    if not client_id or not client_secret:
        async with _lock:
            _results[state] = {"status": "error", "message": "OAuth client not configured"}
        return await finish("OAuth error", "<p>GitLab OAuth client is not configured.</p>")

    token_url = f"{base}/oauth/token"
    try:
        async with httpx.AsyncClient() as client:
            r = await client.post(
                token_url,
                data={
                    "client_id": client_id,
                    "client_secret": client_secret,
                    "code": code,
                    "grant_type": "authorization_code",
                    "redirect_uri": redirect_uri,
                    "code_verifier": verifier,
                },
                timeout=30.0,
            )
            data = r.json()
    except Exception as e:
        async with _lock:
            _results[state] = {"status": "error", "message": str(e)}
        return await finish("OAuth error", f"<p>Token exchange failed: {e}</p>")

    if "error" in data:
        msg = data.get("error_description") or data.get("error", "unknown")
        async with _lock:
            _results[state] = {"status": "error", "message": msg}
        return await finish("OAuth error", f"<p>{msg}</p>")

    access = data.get("access_token")
    if not access:
        async with _lock:
            _results[state] = {"status": "error", "message": "No access_token in response"}
        return await finish("OAuth error", "<p>No access token received.</p>")

    refresh = data.get("refresh_token") or ""
    settings.gitlab_token = access
    if refresh:
        settings.gitlab_refresh_token = refresh
    db.commit()
    db.refresh(settings)
    clear_settings_cache()

    async with _lock:
        _results[state] = {"status": "success"}

    return await finish(
        "Connected",
        "<p>GitLab connected successfully. You can close this window and return to the app.</p>",
    )


@router.get("/gitlab/poll")
async def gitlab_oauth_poll(state: str):
    async with _lock:
        _cleanup_stale()
        row = _results.get(state)
        if not row:
            raise HTTPException(status_code=404, detail="Unknown state")
        return row
