"""Execution routes — trigger and check Docker sandbox execution."""

from fastapi import APIRouter, Depends, HTTPException
from pydantic import BaseModel

from app.tools.execution_tools import RunPythonTool, RunBashTool, RunTestsTool

router = APIRouter()


class ExecutionRequest(BaseModel):
    project_id: str
    type: str  # python | bash | tests
    content: str  # code or command
    command: str = "python -m pytest -v"  # for tests type


@router.post("/run")
async def run_execution(req: ExecutionRequest):
    """Run code in the Docker sandbox."""
    tool_map = {
        "python": RunPythonTool,
        "bash": RunBashTool,
        "tests": RunTestsTool,
    }

    tool_cls = tool_map.get(req.type)
    if not tool_cls:
        raise HTTPException(status_code=400, detail=f"Unknown execution type: {req.type}")

    tool = tool_cls(req.project_id)

    tool_input = {}
    if req.type in ("python", "bash"):
        tool_input = {("code" if req.type == "python" else "command"): req.content}
    else:
        tool_input = {"command": req.command}

    result = await tool.execute(tool_input)
    return result


@router.get("/status/{execution_id}")
async def get_execution_status(execution_id: str):
    """Get the status of an execution. V1 returns completed since executions are synchronous."""
    return {
        "execution_id": execution_id,
        "status": "completed",
        "message": "Executions are synchronous in V1",
    }
