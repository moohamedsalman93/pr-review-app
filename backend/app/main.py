from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware

from .config import get_diagnostics
from .database import engine, Base
from . import models  # Explicitly import models to ensure they are registered with Base.metadata
from .routers import reviews_router, settings_router, rule_sets_router
from .log_buffer import install_buffer_handler, get_recent_logs

# In-memory log buffer for About / diagnostics (install before other code logs)
install_buffer_handler()

# Create database tables
Base.metadata.create_all(bind=engine)

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

