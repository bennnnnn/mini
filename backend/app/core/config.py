"""Application configuration via pydantic-settings."""

from typing import List
from pydantic_settings import BaseSettings


class Settings(BaseSettings):
    # App
    APP_NAME: str = "Mini Cursor"
    APP_VERSION: str = "1.0.0"
    DEBUG: bool = False
    SECRET_KEY: str = "change-me-in-production"
    CORS_ORIGINS: List[str] = ["http://localhost:3000"]

    # Database
    DATABASE_URL: str = (
        "postgresql+asyncpg://binalfewmecuriaw@localhost:5432/mini_cursor"
    )

    # Google OAuth
    GOOGLE_CLIENT_ID: str = ""
    GOOGLE_CLIENT_SECRET: str = ""
    GOOGLE_REDIRECT_URI: str = "http://localhost:3000/auth/callback"

    # GitHub OAuth
    GITHUB_CLIENT_ID: str = ""
    GITHUB_CLIENT_SECRET: str = ""
    GITHUB_REDIRECT_URI: str = "http://localhost:3000/github/callback"

    # Anthropic
    ANTHROPIC_API_KEY: str = ""

    # Authentication (JWT)
    JWT_SECRET: str = "change-me-in-production"
    JWT_TOKEN_EXPIRY: int = 2592000  # 30 days
    JWT_ALGORITHM: str = "HS256"

    # Encryption (for GitHub tokens)
    ENCRYPTION_KEY: str = ""  # 32-byte hex string

    # Docker executor
    DOCKER_EXECUTOR_IMAGE: str = "mini-cursor-executor:latest"
    DOCKER_EXECUTOR_TIMEOUT: int = 120
    DOCKER_EXECUTOR_MEMORY_LIMIT: str = "512m"
    DOCKER_EXECUTOR_CPU_LIMIT: str = "1"

    # Rate limits (free tier)
    RATE_LIMIT_API_DAILY: int = 100
    RATE_LIMIT_AGENT_DAILY: int = 20
    RATE_LIMIT_EXECUTION_DAILY: int = 20
    RATE_LIMIT_PR_DAILY: int = 10

    # Agent limits
    AGENT_MAX_STEPS: int = 25
    AGENT_MAX_RETRIES_PER_STEP: int = 3
    AGENT_MAX_AGENT_RETRIES: int = 5
    AGENT_MAX_RUNTIME_SECONDS: int = 600
    AGENT_MODEL: str = "claude-sonnet-4-6"       # main coding/review agent
    AGENT_MODEL_FAST: str = "claude-haiku-4-5"   # planner, git, devops (fast + cheap)
    AGENT_TEMPERATURE: float = 0.2
    AGENT_MAX_TOKENS: int = 4096

    # LLM pricing — USD per 1M tokens (input, output)
    LLM_PRICE_INPUT_PER_1M: float = 3.0    # Sonnet
    LLM_PRICE_OUTPUT_PER_1M: float = 15.0  # Sonnet
    LLM_PRICE_FAST_INPUT_PER_1M: float = 0.80   # Haiku
    LLM_PRICE_FAST_OUTPUT_PER_1M: float = 4.00  # Haiku

    model_config = {"env_file": ".env", "env_file_encoding": "utf-8"}


settings = Settings()
