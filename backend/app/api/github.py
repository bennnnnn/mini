"""GitHub integration routes."""

import asyncio
import shutil
from pathlib import Path

import httpx
from fastapi import APIRouter, Depends, HTTPException
from pydantic import BaseModel
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from app.core.database import get_db
from app.core.security import encrypt_token, decrypt_token, get_optional_user
from app.models.models import GitHubRepo, Project

router = APIRouter()

GITHUB_API = "https://api.github.com"
WORKSPACE_ROOT = "/tmp/mini-cursor-workspaces"

# In-memory store for active device flow sessions (device_code lives ~15 min)
_device_sessions: dict[str, str] = {}  # session_id → device_code


# ── Helpers ────────────────────────────────────────────────────────────────

async def _call_github(method: str, path: str, plain_token: str, json_body=None) -> dict:
    """Call GitHub API with a PLAIN (not encrypted) token."""
    headers = {
        "Authorization": f"Bearer {plain_token}",
        "Accept": "application/vnd.github+json",
        "X-GitHub-Api-Version": "2022-11-28",
    }
    async with httpx.AsyncClient(timeout=30) as client:
        if method == "GET":
            resp = await client.get(f"{GITHUB_API}{path}", headers=headers)
        elif method == "POST":
            resp = await client.post(f"{GITHUB_API}{path}", headers=headers, json=json_body)
        else:
            return {"success": False, "error": f"Unsupported: {method}"}

    if resp.status_code >= 400:
        return {"success": False, "status": resp.status_code, "error": resp.text[:300]}
    return {"success": True, "data": resp.json() if resp.text else {}}


async def _get_plain_token(db: AsyncSession, user_id: str = "default") -> str:
    """Load and decrypt the stored GitHub token for a user."""
    result = await db.execute(select(GitHubRepo).where(GitHubRepo.user_id == user_id))
    record = result.scalar_one_or_none()
    if not record:
        raise HTTPException(status_code=400, detail="No GitHub account connected.")
    return decrypt_token(record.access_token_encrypted)


def _resolve_user_id(current_user: dict | None) -> str:
    """Resolve user_id from auth context, falling back to 'default' for V1."""
    if current_user and current_user.get("user_id"):
        return current_user["user_id"]
    return "default"


# ── Schemas ────────────────────────────────────────────────────────────────

class ConnectGitHubRequest(BaseModel):
    access_token: str


class ConnectRepoRequest(BaseModel):
    repo_full_name: str  # "owner/repo"


class RepoResponse(BaseModel):
    name: str
    full_name: str
    url: str
    private: bool = False
    description: str | None = None


# ── GitHub Device Flow ─────────────────────────────────────────────────────

@router.post("/device/start")
async def device_flow_start():
    """
    Start the GitHub Device Flow — returns a user_code the user enters at
    github.com/login/device. No callback URL or client secret needed.
    Requires GITHUB_CLIENT_ID to be set in .env.
    """
    from app.core.config import settings
    import uuid

    client_id = settings.GITHUB_CLIENT_ID
    if not client_id:
        raise HTTPException(
            status_code=501,
            detail="GITHUB_CLIENT_ID not configured. Add it to backend/.env to enable one-click GitHub auth.",
        )

    async with httpx.AsyncClient(timeout=15) as client:
        resp = await client.post(
            "https://github.com/login/device/code",
            data={"client_id": client_id, "scope": "repo read:user"},
            headers={"Accept": "application/json"},
        )

    if resp.status_code != 200:
        raise HTTPException(502, f"GitHub error: {resp.text[:200]}")

    data = resp.json()
    session_id = str(uuid.uuid4())
    _device_sessions[session_id] = data["device_code"]

    return {
        "session_id": session_id,
        "user_code": data["user_code"],
        "verification_uri": data.get("verification_uri", "https://github.com/login/device"),
        "expires_in": data.get("expires_in", 900),
        "interval": data.get("interval", 5),
    }


@router.post("/device/poll")
async def device_flow_poll(
    session_id: str,
    db: AsyncSession = Depends(get_db),
    current_user: dict | None = Depends(get_optional_user),
):
    """
    Poll GitHub to see if the user has authorized the device.
    Returns status: pending | authorized | expired | denied
    """
    from app.core.config import settings

    device_code = _device_sessions.get(session_id)
    if not device_code:
        raise HTTPException(404, "Unknown session — may have expired")

    async with httpx.AsyncClient(timeout=15) as client:
        resp = await client.post(
            "https://github.com/login/oauth/access_token",
            data={
                "client_id": settings.GITHUB_CLIENT_ID,
                "device_code": device_code,
                "grant_type": "urn:ietf:params:oauth:grant-type:device_code",
            },
            headers={"Accept": "application/json"},
        )

    data = resp.json()
    error = data.get("error")

    if error == "authorization_pending" or error == "slow_down":
        return {"status": "pending"}
    if error in ("expired_token", "access_denied"):
        _device_sessions.pop(session_id, None)
        return {"status": error}
    if error:
        return {"status": "error", "detail": error}

    # Authorized — we have an access token
    access_token = data.get("access_token")
    if not access_token:
        return {"status": "error", "detail": "No token in response"}

    _device_sessions.pop(session_id, None)

    # Fetch GitHub username to confirm and store
    user_resp = await _call_github("GET", "/user", access_token)
    if not user_resp["success"]:
        return {"status": "error", "detail": "Could not fetch GitHub user info"}

    github_login = user_resp["data"].get("login", "unknown")
    encrypted = encrypt_token(access_token)
    user_id = _resolve_user_id(current_user)

    existing = await db.execute(select(GitHubRepo).where(GitHubRepo.user_id == user_id))
    record = existing.scalar_one_or_none()
    if record:
        record.access_token_encrypted = encrypted
        record.repo_name = github_login
    else:
        db.add(GitHubRepo(
            user_id=user_id,
            repo_name=github_login,
            repo_url=f"https://github.com/{github_login}",
            access_token_encrypted=encrypted,
        ))

    return {"status": "authorized", "github_user": github_login}


# ── Connect / disconnect ───────────────────────────────────────────────────

@router.post("/connect")
async def connect_github(
    req: ConnectGitHubRequest,
    db: AsyncSession = Depends(get_db),
    current_user: dict | None = Depends(get_optional_user),
):
    """Validate and store an encrypted GitHub token."""
    # Validate with plain token FIRST (before any encryption/decryption)
    result = await _call_github("GET", "/user", req.access_token)
    if not result["success"]:
        raise HTTPException(
            status_code=401,
            detail=f"Invalid GitHub token — GitHub returned: {result.get('error', 'unknown error')}",
        )

    github_user = result["data"]
    login = github_user.get("login", "unknown")

    # Encrypt before storing
    encrypted = encrypt_token(req.access_token)
    user_id = _resolve_user_id(current_user)

    existing = await db.execute(select(GitHubRepo).where(GitHubRepo.user_id == user_id))
    record = existing.scalar_one_or_none()

    if record:
        record.access_token_encrypted = encrypted
        record.repo_name = login
    else:
        db.add(GitHubRepo(
            user_id=user_id,
            repo_name=login,
            repo_url=f"https://github.com/{login}",
            access_token_encrypted=encrypted,
        ))

    return {"success": True, "github_user": login}


@router.delete("/connect")
async def disconnect_github(
    db: AsyncSession = Depends(get_db),
    current_user: dict | None = Depends(get_optional_user),
):
    """Remove stored GitHub credentials."""
    user_id = _resolve_user_id(current_user)
    result = await db.execute(select(GitHubRepo).where(GitHubRepo.user_id == user_id))
    record = result.scalar_one_or_none()
    if record:
        await db.delete(record)
    return {"success": True}


@router.get("/status")
async def github_status(
    db: AsyncSession = Depends(get_db),
    current_user: dict | None = Depends(get_optional_user),
):
    """Return whether GitHub is connected and who is logged in."""
    user_id = _resolve_user_id(current_user)
    result = await db.execute(select(GitHubRepo).where(GitHubRepo.user_id == user_id))
    record = result.scalar_one_or_none()
    if not record:
        return {"connected": False}
    return {"connected": True, "github_user": record.repo_name}


# ── Repo listing ───────────────────────────────────────────────────────────

@router.get("/repos", response_model=list[RepoResponse])
async def list_repos(
    db: AsyncSession = Depends(get_db),
    current_user: dict | None = Depends(get_optional_user),
):
    """List the authenticated user's repos (sorted by last push)."""
    user_id = _resolve_user_id(current_user)
    try:
        token = await _get_plain_token(db, user_id)
    except HTTPException:
        return []

    result = await _call_github("GET", "/user/repos?per_page=100&sort=pushed&affiliation=owner,collaborator", token)
    if not result["success"]:
        return []

    return [
        RepoResponse(
            name=r.get("name", ""),
            full_name=r.get("full_name", ""),
            url=r.get("html_url", ""),
            private=r.get("private", False),
            description=r.get("description"),
        )
        for r in result["data"]
    ]


# ── Connect repo to project (clone) ───────────────────────────────────────

@router.post("/projects/{project_id}/connect")
async def connect_repo_to_project(
    project_id: str,
    req: ConnectRepoRequest,
    db: AsyncSession = Depends(get_db),
    current_user: dict | None = Depends(get_optional_user),
):
    """Clone a GitHub repo into a project workspace."""
    user_id = _resolve_user_id(current_user)

    # Load project
    proj_result = await db.execute(select(Project).where(Project.id == project_id))
    project = proj_result.scalar_one_or_none()
    if not project:
        raise HTTPException(status_code=404, detail="Project not found")

    # Load GitHub token
    token = await _get_plain_token(db, user_id)
    clone_url = f"https://{token}@github.com/{req.repo_full_name}.git"

    ws = Path(WORKSPACE_ROOT) / project_id / "workspace"

    # Wipe existing workspace so clone starts clean
    if ws.exists():
        shutil.rmtree(ws)
    ws.mkdir(parents=True, exist_ok=True)

    # Find git binary
    git = shutil.which("git") or "git"

    # Shallow clone (fast, only latest snapshot)
    proc = await asyncio.create_subprocess_exec(
        git, "clone", "--depth=1", clone_url, str(ws),
        stdout=asyncio.subprocess.PIPE,
        stderr=asyncio.subprocess.PIPE,
    )
    try:
        _, stderr = await asyncio.wait_for(proc.communicate(), timeout=120)
    except asyncio.TimeoutError:
        proc.kill()
        raise HTTPException(status_code=504, detail="Clone timed out (120 s). Try a smaller repo.")

    if proc.returncode != 0:
        msg = stderr.decode(errors="replace").strip()
        # Hide the token from any error message
        msg = msg.replace(token, "***")
        raise HTTPException(status_code=400, detail=f"Clone failed: {msg}")

    # Persist the link — rename project to repo name
    project.github_repo = req.repo_full_name
    project.name = req.repo_full_name.split("/")[-1]

    return {
        "success": True,
        "repo": req.repo_full_name,
        "project_id": project_id,
    }


@router.post("/sync")
async def sync_repo(repo_name: str):
    """Sync stub — full embeddings in V2."""
    return {"success": True, "message": f"Sync of {repo_name} queued"}
