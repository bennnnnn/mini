"""Ticket management API routes."""

from fastapi import APIRouter, Depends, HTTPException
from pydantic import BaseModel
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from app.core.database import get_db
from app.models.models import Ticket

router = APIRouter()


class CreateTicketRequest(BaseModel):
    title: str
    priority: str = "medium"
    project_id: str | None = None


class UpdateTicketRequest(BaseModel):
    status: str | None = None
    priority: str | None = None


@router.get("")
async def list_tickets(db: AsyncSession = Depends(get_db)):
    result = await db.execute(select(Ticket).order_by(Ticket.created_at.desc()).limit(50))
    tickets = result.scalars().all()
    return [
        {
            "id": t.id,
            "title": t.title,
            "status": t.status,
            "priority": t.priority,
            "created_at": t.created_at.isoformat() if t.created_at else "",
        }
        for t in tickets
    ]


@router.post("")
async def create_ticket(req: CreateTicketRequest, db: AsyncSession = Depends(get_db)):
    ticket = Ticket(
        title=req.title,
        priority=req.priority,
        project_id=req.project_id or "default",
    )
    db.add(ticket)
    await db.flush()
    return {
        "id": ticket.id,
        "title": ticket.title,
        "status": ticket.status,
        "priority": ticket.priority,
        "created_at": ticket.created_at.isoformat() if ticket.created_at else "",
    }


@router.patch("/{ticket_id}")
async def update_ticket(ticket_id: str, req: UpdateTicketRequest, db: AsyncSession = Depends(get_db)):
    result = await db.execute(select(Ticket).where(Ticket.id == ticket_id))
    ticket = result.scalar_one_or_none()
    if not ticket:
        raise HTTPException(status_code=404, detail="Ticket not found")
    if req.status:
        ticket.status = req.status
    if req.priority:
        ticket.priority = req.priority
    await db.flush()
    return {"id": ticket.id, "status": ticket.status, "priority": ticket.priority}
