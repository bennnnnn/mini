# Docker executor sandbox image
# Python 3.12 with common dev deps pre-installed.
# Network is disabled at runtime — all deps must be pre-baked.

FROM python:3.12-slim

WORKDIR /workspace

# Pre-install common Python packages (add more as needed)
RUN pip install --no-cache-dir \
    pytest \
    pytest-cov \
    pytest-asyncio \
    httpx \
    fastapi \
    uvicorn \
    sqlalchemy \
    pydantic

# Create non-root user for execution
RUN useradd -m -s /bin/bash sandbox
USER sandbox

# Default: do nothing (containers are run ephemerally with command override)
CMD ["echo", "Executor sandbox ready"]
