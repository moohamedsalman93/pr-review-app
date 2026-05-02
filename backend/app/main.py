from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware

from .config import get_diagnostics
from .database import engine, Base
from . import models  # Explicitly import models to ensure they are registered with Base.metadata
from .routers import reviews_router, settings_router, rule_sets_router, oauth_router
from .log_buffer import install_buffer_handler, get_recent_logs
from sqlalchemy import text

# In-memory log buffer for About / diagnostics (install before other code logs)
install_buffer_handler()

# Lightweight migration helper (SQLite): add missing columns.
def _sqlite_ensure_column(table_name: str, column_name: str, column_ddl: str) -> None:
    if engine.dialect.name != "sqlite":
        return
    with engine.begin() as conn:
        cols = [row[1] for row in conn.execute(text(f"PRAGMA table_info({table_name})")).fetchall()]
        if column_name not in cols:
            conn.execute(text(f"ALTER TABLE {table_name} ADD COLUMN {column_ddl}"))

# Create database tables
Base.metadata.create_all(bind=engine)

# Ensure newly-added settings columns exist for existing DBs.
_sqlite_ensure_column("app_settings", "review_runs", "review_runs INTEGER DEFAULT 1")
_sqlite_ensure_column("app_settings", "github_refresh_token", "github_refresh_token TEXT DEFAULT ''")
_sqlite_ensure_column("app_settings", "gitlab_client_id", "gitlab_client_id VARCHAR(200) DEFAULT ''")
_sqlite_ensure_column("app_settings", "gitlab_client_secret", "gitlab_client_secret TEXT DEFAULT ''")
_sqlite_ensure_column("app_settings", "gitlab_refresh_token", "gitlab_refresh_token TEXT DEFAULT ''")
_sqlite_ensure_column("app_settings", "llm_provider_configs", "llm_provider_configs TEXT DEFAULT '{}'")
_sqlite_ensure_column("pr_reviews", "target_type", "target_type VARCHAR(20) DEFAULT 'pr'")
_sqlite_ensure_column("pr_reviews", "target_ref", "target_ref VARCHAR(200)")
_sqlite_ensure_column("pr_reviews", "target_base_ref", "target_base_ref VARCHAR(200)")

app = FastAPI(
    title="PR Review API",
    description="API for reviewing GitLab Merge Requests using local LLM",
    version="1.0.0"
)

# CORS middleware for React frontend
app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"], # Relax for desktop app
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

# Include routers
app.include_router(reviews_router)
app.include_router(settings_router)
app.include_router(rule_sets_router)
app.include_router(oauth_router)


@app.get("/api/health")
def health_check():
    """Health check endpoint"""
    return {"status": "healthy", "service": "pr-review-api"}


@app.get("/api/info")
def get_info():
    """Diagnostics for About: database path, app data dir, cwd (no secrets)."""
    return {"version": "1.0.0", **get_diagnostics()}


@app.get("/api/logs")
def get_logs(limit: int = 200):
    """Recent in-memory log entries for display in About."""
    return {"logs": get_recent_logs(limit=min(max(1, limit), 500))}

