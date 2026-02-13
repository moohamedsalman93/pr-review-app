from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware

from .database import engine, Base
from . import models  # Explicitly import models to ensure they are registered with Base.metadata
from .routers import reviews_router, settings_router, rule_sets_router

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

