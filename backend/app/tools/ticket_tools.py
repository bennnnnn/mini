"""Ticket tools — internal task tracking."""

from typing import Any, Dict

from app.tools.base import Tool


# In-memory ticket store for V1 (replace with DB-backed in V2)
_tickets: Dict[str, Dict[str, Any]] = {}


class CreateTicketTool(Tool):
    name = "create_ticket"
    description = "Create a new task ticket."
    input_schema = {
        "type": "object",
        "properties": {
            "title": {"type": "string", "description": "Ticket title"},
            "priority": {"type": "string", "description": "low | medium | high", "default": "medium"},
            "description": {"type": "string", "description": "Ticket description", "default": ""},
        },
        "required": ["title"],
    }

    async def execute(self, input: Dict[str, Any]) -> Dict[str, Any]:
        import uuid
        tid = str(uuid.uuid4())[:8]
        _tickets[tid] = {
            "id": tid,
            "title": input["title"],
            "status": "open",
            "priority": input.get("priority", "medium"),
            "description": input.get("description", ""),
        }
        return {"success": True, "ticket": _tickets[tid]}


class ListTicketsTool(Tool):
    name = "list_tickets"
    description = "List all tickets."
    input_schema = {"type": "object", "properties": {}}

    async def execute(self, input: Dict[str, Any]) -> Dict[str, Any]:
        return {"success": True, "tickets": list(_tickets.values())}


class UpdateTicketTool(Tool):
    name = "update_ticket"
    description = "Update a ticket's status."
    input_schema = {
        "type": "object",
        "properties": {
            "ticket_id": {"type": "string", "description": "Ticket ID"},
            "status": {"type": "string", "description": "open | in_progress | done"},
        },
        "required": ["ticket_id", "status"],
    }

    async def execute(self, input: Dict[str, Any]) -> Dict[str, Any]:
        ticket = _tickets.get(input["ticket_id"])
        if not ticket:
            return {"success": False, "error": f"Ticket {input['ticket_id']} not found"}
        ticket["status"] = input["status"]
        return {"success": True, "ticket": ticket}


class CloseTicketTool(Tool):
    name = "close_ticket"
    description = "Close a ticket."
    input_schema = {
        "type": "object",
        "properties": {
            "ticket_id": {"type": "string", "description": "Ticket ID"},
        },
        "required": ["ticket_id"],
    }

    async def execute(self, input: Dict[str, Any]) -> Dict[str, Any]:
        ticket = _tickets.get(input["ticket_id"])
        if not ticket:
            return {"success": False, "error": f"Ticket {input['ticket_id']} not found"}
        ticket["status"] = "done"
        return {"success": True, "ticket": ticket}
