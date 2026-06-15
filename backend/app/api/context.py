"""User context API — store and retrieve dynamic user/project preferences."""

from fastapi import APIRouter, Depends
from pydantic import BaseModel
from sqlalchemy import select, delete
from sqlalchemy.ext.asyncio import AsyncSession

from app.core.database import get_db
from app.models.models import UserContext

router = APIRouter()


class SetContextRequest(BaseModel):
    key: str
    value: str
    project_id: str | None = None   # None = global preference


class ContextItem(BaseModel):
    key: str
    value: str
    scope: str


@router.get("")
async def get_context(project_id: str | None = None, db: AsyncSession = Depends(get_db)):
    """Get all context entries: global + project-specific (if project_id given)."""
    q = select(UserContext).where(UserContext.user_id == "default")
    if project_id:
        q = q.where(
            (UserContext.scope == "global") |
            ((UserContext.scope == "project") & (UserContext.project_id == project_id))
        )
    else:
        q = q.where(UserContext.scope == "global")
    result = await db.execute(q)
    items = result.scalars().all()
    return [{"key": i.key, "value": i.value, "scope": i.scope} for i in items]


@router.put("")
async def set_context(req: SetContextRequest, db: AsyncSession = Depends(get_db)):
    """Upsert a context entry."""
    scope = "project" if req.project_id else "global"

    # Find existing
    q = select(UserContext).where(
        UserContext.user_id == "default",
        UserContext.key == req.key,
        UserContext.scope == scope,
    )
    if req.project_id:
        q = q.where(UserContext.project_id == req.project_id)
    result = await db.execute(q)
    existing = result.scalar_one_or_none()

    if existing:
        existing.value = req.value
    else:
        db.add(UserContext(
            user_id="default",
            key=req.key,
            value=req.value,
            scope=scope,
            project_id=req.project_id,
        ))

    return {"success": True, "key": req.key, "scope": scope}


@router.delete("/{key}")
async def delete_context(key: str, project_id: str | None = None, db: AsyncSession = Depends(get_db)):
    """Delete a context entry."""
    q = delete(UserContext).where(UserContext.user_id == "default", UserContext.key == key)
    if project_id:
        q = q.where(UserContext.project_id == project_id)
    await db.execute(q)
    return {"success": True}
