"""Project management routes."""

import asyncio
import os
import shutil
from pathlib import Path

from fastapi import APIRouter, Depends, HTTPException, Body
from pydantic import BaseModel
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from app.core.database import get_db
from app.models.models import Project, GitHubRepo
from app.core.security import decrypt_token

router = APIRouter()

WORKSPACE_ROOT = "/tmp/mini-cursor-workspaces"


class CreateProjectRequest(BaseModel):
    name: str
    description: str | None = None
    user_id: str | None = "default"


class ProjectResponse(BaseModel):
    id: str
    name: str
    description: str | None = None
    github_repo: str | None = None
    created_at: str


class LinkGitHubRequest(BaseModel):
    repo_full_name: str   # "owner/repo"

class FileEntry(BaseModel):
    name: str
    type: str
    path: str
    size: int = 0

class FileContentResponse(BaseModel):
    path: str
    content: str

class WriteFileRequest(BaseModel):
    content: str


# ── Project CRUD ───────────────────────────────────────────────────────

def _project_response(p: Project) -> ProjectResponse:
    return ProjectResponse(
        id=p.id,
        name=p.name,
        description=p.description,
        github_repo=p.github_repo,
        created_at=p.created_at.isoformat() if p.created_at else "",
    )


@router.post("", response_model=ProjectResponse)
async def create_project(req: CreateProjectRequest, db: AsyncSession = Depends(get_db)):
    project = Project(name=req.name, description=req.description, user_id=req.user_id or "default")
    db.add(project)
    await db.flush()
    return _project_response(project)


@router.get("", response_model=list[ProjectResponse])
async def list_projects(db: AsyncSession = Depends(get_db)):
    result = await db.execute(select(Project).order_by(Project.created_at.desc()).limit(20))
    return [_project_response(p) for p in result.scalars().all()]


@router.delete("/{project_id}")
async def delete_project(project_id: str, db: AsyncSession = Depends(get_db)):
    result = await db.execute(select(Project).where(Project.id == project_id))
    project = result.scalar_one_or_none()
    if not project:
        raise HTTPException(status_code=404, detail="Project not found")
    await db.delete(project)
    return {"success": True}


@router.get("/{project_id}", response_model=ProjectResponse)
async def get_project(project_id: str, db: AsyncSession = Depends(get_db)):
    result = await db.execute(select(Project).where(Project.id == project_id))
    project = result.scalar_one_or_none()
    if not project:
        raise HTTPException(status_code=404, detail="Project not found")
    return _project_response(project)


class RenameProjectRequest(BaseModel):
    name: str


@router.patch("/{project_id}/name", response_model=ProjectResponse)
async def rename_project(project_id: str, req: RenameProjectRequest, db: AsyncSession = Depends(get_db)):
    result = await db.execute(select(Project).where(Project.id == project_id))
    project = result.scalar_one_or_none()
    if not project:
        raise HTTPException(status_code=404, detail="Project not found")
    project.name = req.name[:60]  # cap at 60 chars
    return _project_response(project)


# ── GitHub repo linking ────────────────────────────────────────────────────

@router.post("/{project_id}/github")
async def link_github_repo(
    project_id: str,
    req: LinkGitHubRequest,
    db: AsyncSession = Depends(get_db),
):
    """Link a GitHub repo to a project and clone it into the workspace."""
    # Load project
    result = await db.execute(select(Project).where(Project.id == project_id))
    project = result.scalar_one_or_none()
    if not project:
        raise HTTPException(status_code=404, detail="Project not found")

    # Load the user's GitHub token
    gh_result = await db.execute(select(GitHubRepo).where(GitHubRepo.user_id == "default"))
    gh_record = gh_result.scalar_one_or_none()
    if not gh_record:
        raise HTTPException(status_code=400, detail="No GitHub account connected. Go to Settings → GitHub.")

    token = decrypt_token(gh_record.access_token_encrypted)
    repo = req.repo_full_name  # "owner/repo"
    clone_url = f"https://{token}@github.com/{repo}.git"

    ws = Path(WORKSPACE_ROOT) / project_id / "workspace"

    # If workspace already has files from a previous clone, wipe it first
    if ws.exists() and any(ws.iterdir()):
        shutil.rmtree(ws)
    ws.mkdir(parents=True, exist_ok=True)

    # Clone (non-blocking, 120s timeout)
    proc = await asyncio.create_subprocess_exec(
        "git", "clone", "--depth=1", clone_url, str(ws),
        stdout=asyncio.subprocess.PIPE,
        stderr=asyncio.subprocess.PIPE,
    )
    try:
        _, stderr = await asyncio.wait_for(proc.communicate(), timeout=120)
    except asyncio.TimeoutError:
        proc.kill()
        raise HTTPException(status_code=504, detail="Clone timed out (120s). Try a smaller repo.")

    if proc.returncode != 0:
        error = stderr.decode(errors="replace").strip()
        raise HTTPException(status_code=400, detail=f"Clone failed: {error}")

    # Persist the link
    project.github_repo = repo
    project.name = repo.split("/")[-1]   # rename project to repo name

    return {
        "success": True,
        "repo": repo,
        "project_id": project_id,
        "message": f"Cloned {repo} into workspace",
    }


# ── File management ────────────────────────────────────────────────────

def _workspace(project_id: str) -> Path:
    ws = Path(WORKSPACE_ROOT) / project_id / "workspace"
    ws.mkdir(parents=True, exist_ok=True)
    return ws

def _safe_path(ws: Path, path: str) -> Path:
    resolved = (ws / path).resolve()
    if not str(resolved).startswith(str(ws.resolve())):
        raise HTTPException(status_code=403, detail="Path escape")
    return resolved

_SKIP_DIRS = {".git", "__pycache__", "node_modules", ".next", ".venv", "venv", "dist", "build"}

def _scan_dir(dir_path: Path, base: Path) -> list[dict]:
    entries = []
    try:
        for entry in sorted(dir_path.iterdir()):
            if entry.name in _SKIP_DIRS or entry.name.startswith("."):
                continue
            rel = str(entry.relative_to(base))
            if entry.is_dir():
                entries.append({"name": entry.name, "type": "directory", "path": rel, "size": 0})
                entries.extend(_scan_dir(entry, base))
            else:
                entries.append({
                    "name": entry.name,
                    "type": "file",
                    "path": rel,
                    "size": entry.stat().st_size,
                })
    except PermissionError:
        pass
    return entries


@router.get("/{project_id}/files", response_model=list[FileEntry])
async def list_files(project_id: str):
    ws = _workspace(project_id)
    return _scan_dir(ws, ws)


@router.get("/{project_id}/files/{file_path:path}", response_model=FileContentResponse)
async def read_file(project_id: str, file_path: str):
    ws = _workspace(project_id)
    fp = _safe_path(ws, file_path)
    if not fp.exists():
        raise HTTPException(status_code=404, detail="File not found")
    return FileContentResponse(path=file_path, content=fp.read_text(encoding="utf-8"))


@router.put("/{project_id}/files/{file_path:path}", response_model=FileContentResponse)
async def write_file(project_id: str, file_path: str, req: WriteFileRequest):
    ws = _workspace(project_id)
    fp = _safe_path(ws, file_path)
    fp.parent.mkdir(parents=True, exist_ok=True)
    fp.write_text(req.content, encoding="utf-8")
    return FileContentResponse(path=file_path, content=req.content)


# ── Sessions ───────────────────────────────────────────────────────────

@router.get("/{project_id}/sessions")
async def list_sessions(project_id: str, db: AsyncSession = Depends(get_db)):
    from app.models.models import Session as DBSession, Message
    result = await db.execute(
        select(DBSession).where(DBSession.project_id == project_id).order_by(DBSession.created_at.desc()).limit(20)
    )
    sessions = result.scalars().all()
    out = []
    for s in sessions:
        # Get first user message to use as title fallback
        msg_result = await db.execute(
            select(Message)
            .where(Message.session_id == s.id, Message.role == "user")
            .order_by(Message.timestamp)
            .limit(1)
        )
        first_msg = msg_result.scalar_one_or_none()
        title = s.title or (first_msg.content[:60] if first_msg else "New chat")
        out.append({
            "id": s.id,
            "title": title,
            "created_at": s.created_at.isoformat() if s.created_at else "",
        })
    return out


@router.post("/{project_id}/sessions")
async def create_session(project_id: str, db: AsyncSession = Depends(get_db)):
    """Create a new empty chat session for a project."""
    from app.models.models import Session as DBSession
    session = DBSession(project_id=project_id)
    db.add(session)
    await db.flush()
    return {"id": session.id, "title": "New chat", "created_at": session.created_at.isoformat()}
