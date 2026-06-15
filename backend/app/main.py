"""Mini Cursor backend application factory."""

from contextlib import asynccontextmanager
from typing import AsyncGenerator

from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware
from sqlalchemy import text

from app.core.config import settings
from app.core.database import engine, Base
from app.api import auth, projects, agent, github, execution, tickets, terminal, context
from app.middleware.audit import AuditMiddleware
from app.middleware.rate_limit import RateLimitMiddleware


@asynccontextmanager
async def lifespan(app: FastAPI) -> AsyncGenerator[None, None]:
    """Application lifespan — validate config and create tables on startup."""
    # ── Startup safety checks ───────────────────────────────────────────────
    _validate_settings()

    async with engine.begin() as conn:
        await conn.run_sync(Base.metadata.create_all)
        # Safe schema migrations — all idempotent
        await conn.execute(text(
            "ALTER TABLE projects ADD COLUMN IF NOT EXISTS github_repo TEXT"
        ))
        await conn.execute(text(
            "ALTER TABLE sessions ADD COLUMN IF NOT EXISTS title TEXT"
        ))
        await conn.execute(text(
            "ALTER TABLE sessions ALTER COLUMN project_id DROP NOT NULL"
        ))
        await conn.execute(text(
            "ALTER TABLE projects ADD COLUMN IF NOT EXISTS description TEXT"
        ))
        # Drop the FK on github_repos.user_id so we can store credentials
        # without requiring a full user account (auth is V2)
        await conn.execute(text(
            "ALTER TABLE github_repos DROP CONSTRAINT IF EXISTS github_repos_user_id_fkey"
        ))
        await conn.execute(text(
            "ALTER TABLE github_repos ALTER COLUMN user_id DROP NOT NULL"
        ))
    yield
    await engine.dispose()


def _validate_settings() -> None:
    """Refuse to start if security-critical settings are still at their defaults."""
    import sys

    errors: list[str] = []

    if settings.SECRET_KEY == "change-me-in-production":
        errors.append("SECRET_KEY is still set to the default 'change-me-in-production'.")
    if settings.JWT_SECRET == "change-me-in-production":
        errors.append("JWT_SECRET is still set to the default 'change-me-in-production'.")
    if settings.ENCRYPTION_KEY == "":
        errors.append("ENCRYPTION_KEY is empty — GitHub token encryption will fail.")
    if settings.ANTHROPIC_API_KEY == "":
        errors.append("ANTHROPIC_API_KEY is empty — agents will not work.")

    if errors:
        msg = "Configuration error(s):\n  - " + "\n  - ".join(errors)
        print(f"\n{'='*60}\nFATAL: {msg}\n{'='*60}\n", file=sys.stderr)
        raise RuntimeError(msg)


def create_app() -> FastAPI:
    app = FastAPI(
        title="Mini Cursor",
        version=settings.APP_VERSION,
        lifespan=lifespan,
    )

    # CORS — restrict in production
    app.add_middleware(
        CORSMiddleware,
        allow_origins=settings.CORS_ORIGINS,
        allow_credentials=True,
        allow_methods=["*"],
        allow_headers=["*"],
    )

    # Custom middleware (applied in reverse order — Audit runs last/outermost)
    app.add_middleware(RateLimitMiddleware)
    app.add_middleware(AuditMiddleware)

    # Routes
    app.include_router(auth.router, prefix="/auth", tags=["auth"])
    app.include_router(projects.router, prefix="/projects", tags=["projects"])
    app.include_router(agent.router, prefix="/agent", tags=["agent"])
    app.include_router(github.router, prefix="/github", tags=["github"])
    app.include_router(execution.router, prefix="/execution", tags=["execution"])
    app.include_router(tickets.router, prefix="/tickets", tags=["tickets"])
    app.include_router(terminal.router, prefix="/terminal", tags=["terminal"])
    app.include_router(context.router, prefix="/context", tags=["context"])

    @app.get("/health")
    async def health():
        return {"status": "ok", "version": settings.APP_VERSION}

    return app


app = create_app()
