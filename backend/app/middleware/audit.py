"""Audit logging middleware — logs all API requests with structured logging.

Uses structlog for machine-readable JSON output. Falls back to the standard
logging module if structlog isn't configured (e.g., in dev).
"""

import logging
import time
from typing import Callable

from fastapi import Request, Response
from starlette.middleware.base import BaseHTTPMiddleware

logger = logging.getLogger("mini-cursor.audit")

# Try to use structlog for structured output; fall back to stdlib logging.
try:
    import structlog
    _audit_log = structlog.get_logger("mini-cursor.audit")
    _use_structlog = True
except ImportError:
    _audit_log = logger  # type: ignore[assignment]
    _use_structlog = False


class AuditMiddleware(BaseHTTPMiddleware):
    """Logs every API request with structured metadata.

    Output is JSON-formatted (via structlog) or plain text (stdlib fallback).
    In production, ship these logs to your aggregator (Datadog, CloudWatch, etc.).
    """

    _AUDIT_SKIP_PREFIXES = ("/health", "/favicon.ico")

    async def dispatch(self, request: Request, call_next: Callable) -> Response:
        start = time.monotonic()
        response = await call_next(request)
        duration_ms = (time.monotonic() - start) * 1000

        path = request.url.path
        if any(path.startswith(p) for p in self._AUDIT_SKIP_PREFIXES):
            return response

        # Extract user identity from the Authorization header
        user_id = None
        auth = request.headers.get("Authorization", "")
        if auth.startswith("Bearer "):
            user_id = auth[7:][:36]  # JWT prefix as a per-user key

        client_ip = request.headers.get("X-Forwarded-For", request.client.host if request.client else "unknown")

        if _use_structlog:
            _audit_log.info(  # type: ignore[union-attr]
                "request",
                user_id=user_id,
                method=request.method,
                path=path,
                status_code=response.status_code,
                duration_ms=round(duration_ms, 2),
                client_ip=client_ip,
            )
        else:
            logger.info(
                "method=%s path=%s status=%d duration=%.2fms user=%s ip=%s",
                request.method,
                path,
                response.status_code,
                duration_ms,
                user_id or "-",
                client_ip,
            )

        return response
