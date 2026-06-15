"""Tests for rate limiting middleware."""

import pytest
from fastapi import FastAPI
from fastapi.testclient import TestClient

from app.middleware.rate_limit import RateLimitMiddleware


@pytest.fixture
def rate_limit_app():
    """Create a minimal FastAPI app with the rate limiter installed."""
    app = FastAPI()

    @app.get("/health")
    async def health():
        return {"status": "ok"}

    @app.get("/agent/test")
    async def agent_endpoint():
        return {"result": "ok"}

    @app.get("/projects")
    async def projects():
        return {"projects": []}

    app.add_middleware(RateLimitMiddleware)
    return app


class TestRateLimitExemptPaths:
    """Health, projects, and auth endpoints should never be rate-limited."""

    def test_health_is_exempt(self, rate_limit_app):
        client = TestClient(rate_limit_app)
        for _ in range(200):  # Exceeds any limit
            resp = client.get("/health")
            assert resp.status_code == 200

    def test_projects_is_exempt(self, rate_limit_app):
        client = TestClient(rate_limit_app)
        for _ in range(200):
            resp = client.get("/projects")
            assert resp.status_code == 200

    def test_auth_is_exempt(self, rate_limit_app):
        client = TestClient(rate_limit_app)
        for _ in range(200):
            resp = client.get("/auth/test-nonexistent")
            assert resp.status_code != 429  # may 404 but not rate-limited


class TestRateLimitEnforcement:
    """Agent endpoints should be rate-limited."""

    def test_agent_endpoint_rate_limited(self, rate_limit_app):
        """After N requests, the rate limiter should return 429."""
        # Modify settings directly on the imported singleton
        from app.core.config import settings
        old_limit = settings.RATE_LIMIT_AGENT_DAILY
        old_debug = settings.DEBUG
        try:
            settings.RATE_LIMIT_AGENT_DAILY = 3
            settings.DEBUG = False

            client = TestClient(rate_limit_app)
            headers = {"Authorization": "Bearer test-token-ratelimit-enforcement"}

            # First 3 should pass
            for i in range(3):
                resp = client.get("/agent/test", headers=headers)
                assert resp.status_code == 200, f"Request {i+1} returned {resp.status_code}"

            # 4th should be rate limited
            resp = client.get("/agent/test", headers=headers)
            assert resp.status_code == 429, f"Expected 429, got {resp.status_code}"
            data = resp.json()
            assert data["error"] == "rate_limit_exceeded"
        finally:
            settings.RATE_LIMIT_AGENT_DAILY = old_limit
            settings.DEBUG = old_debug

    def test_unauthenticated_requests_not_limited(self, rate_limit_app):
        """Requests without an auth header are not rate-limited."""
        from app.core.config import settings
        old_limit = settings.RATE_LIMIT_AGENT_DAILY
        old_debug = settings.DEBUG
        try:
            settings.RATE_LIMIT_AGENT_DAILY = 3
            settings.DEBUG = False

            client = TestClient(rate_limit_app)

            for _ in range(10):
                resp = client.get("/agent/test")
                assert resp.status_code == 200
        finally:
            settings.RATE_LIMIT_AGENT_DAILY = old_limit
            settings.DEBUG = old_debug


class TestRateLimitStaleKeyCleanup:
    """Stale keys should be cleaned up to prevent memory leaks."""

    def test_cleanup_removes_stale_keys(self):
        """Directly test the cleanup method on the middleware."""
        app = FastAPI()
        middleware = RateLimitMiddleware(app)

        # Add a stale key
        old_time = 1_000_000_000  # ancient timestamp
        key = "stale-user:agent"
        middleware._windows[key] = [old_time]

        # Add a fresh key
        now = 1_700_000_000
        fresh_key = "fresh-user:agent"
        middleware._windows[fresh_key] = [now - 100]  # 100s ago

        # Set window to 200s — stale key is way older, fresh key is within window
        middleware._window_secs = 200

        # Trigger cleanup
        middleware._cleanup_stale_keys(now)

        # Stale key should be gone
        assert key not in middleware._windows
        # Fresh key should remain
        assert fresh_key in middleware._windows
