"""Rate limiting middleware — enforces free-tier limits.

Skipped entirely when DEBUG=True (local development).
Read-only polling endpoints (GET /projects/*/files, GET /projects/*/sessions)
are also excluded — they are cheap DB/filesystem reads and would be
exhausted instantly by the 2-second file-explorer poller.
"""

import time
from collections import defaultdict
from typing import Callable

from fastapi import Request, Response
from starlette.middleware.base import BaseHTTPMiddleware
from starlette.responses import JSONResponse

from app.core.config import settings

# Paths that are polled frequently by the frontend — exempt from rate limiting.
_EXEMPT_PREFIXES = (
    "/health",
    "/projects",   # file tree + sessions polling
    "/auth",       # login flow
)


class RateLimitMiddleware(BaseHTTPMiddleware):
    """In-memory rate limiter. Per-user, per-endpoint-type.

    Stale keys (users who haven't made a request in 24h) are cleaned up
    periodically to prevent unbounded memory growth.
    """

    def __init__(self, app):
        super().__init__(app)
        self._windows: dict[str, list[float]] = defaultdict(list)
        self._window_secs = 86400  # 24-hour rolling window
        self._last_cleanup = time.time()

    async def dispatch(self, request: Request, call_next: Callable) -> Response:
        # In debug/dev mode skip all rate limiting
        if settings.DEBUG:
            return await call_next(request)

        # Periodic cleanup of stale keys (every ~10 minutes)
        now = time.time()
        if now - self._last_cleanup > 600:
            self._cleanup_stale_keys(now)
            self._last_cleanup = now

        # Exempt cheap read/auth paths
        path = request.url.path
        if any(path.startswith(p) for p in _EXEMPT_PREFIXES):
            return await call_next(request)

        user_id = self._get_user_id(request)
        if not user_id:
            return await call_next(request)

        limit = self._get_limit(path)
        key = f"{user_id}:{self._bucket(path)}"
        now = time.time()

        # Prune expired entries
        self._windows[key] = [t for t in self._windows[key] if now - t < self._window_secs]

        if len(self._windows[key]) >= limit:
            return JSONResponse(
                status_code=429,
                content={
                    "error": "rate_limit_exceeded",
                    "message": f"Daily limit of {limit} reached. Try again later.",
                    "retry_after": int(self._window_secs - (now - self._windows[key][0])),
                },
            )

        self._windows[key].append(now)

        response = await call_next(request)
        response.headers["X-RateLimit-Limit"] = str(limit)
        response.headers["X-RateLimit-Remaining"] = str(limit - len(self._windows[key]))
        return response

    def _cleanup_stale_keys(self, now: float) -> None:
        """Remove keys whose last request timestamp is older than the window.

        Without this, the defaultdict accumulates a key for every user that
        ever made a request, growing unbounded over weeks/months.
        """
        stale = [
            key for key, timestamps in self._windows.items()
            if not timestamps or now - max(timestamps) > self._window_secs
        ]
        for key in stale:
            del self._windows[key]

    def _get_user_id(self, request: Request) -> str | None:
        auth = request.headers.get("Authorization", "")
        if auth.startswith("Bearer "):
            return auth[7:][:36]  # JWT prefix as a per-user key
        return None  # Unauthenticated requests are not rate-limited (no account to track)

    def _get_limit(self, path: str) -> int:
        if path.startswith("/agent/"):
            return settings.RATE_LIMIT_AGENT_DAILY
        if path.startswith("/execution/"):
            return settings.RATE_LIMIT_EXECUTION_DAILY
        if path.startswith("/github/") and "pr" in path.lower():
            return settings.RATE_LIMIT_PR_DAILY
        return settings.RATE_LIMIT_API_DAILY

    def _bucket(self, path: str) -> str:
        if path.startswith("/agent/"):
            return "agent"
        if path.startswith("/execution/"):
            return "execution"
        if "pr" in path.lower():
            return "pr"
        return "api"
