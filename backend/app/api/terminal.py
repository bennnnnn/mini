"""Terminal — command execution + WebSocket shell."""

import asyncio
import os
from pathlib import Path
from fastapi import APIRouter, WebSocket, WebSocketDisconnect
from pydantic import BaseModel

router = APIRouter()
WORKSPACE_ROOT = "/tmp/mini-cursor-workspaces"


class TerminalRequest(BaseModel):
    project_id: str
    command: str


@router.post("/exec")
async def exec_terminal(req: TerminalRequest):
    ws_dir = Path(WORKSPACE_ROOT) / req.project_id / "workspace"
    ws_dir.mkdir(parents=True, exist_ok=True)

    dangerous = ["rm -rf /", "mkfs", "shutdown", "reboot"]
    for d in dangerous:
        if d in req.command.lower():
            return {"output": f"Blocked: {d}", "exit_code": 1}

    try:
        proc = await asyncio.create_subprocess_shell(
            req.command,
            stdout=asyncio.subprocess.PIPE,
            stderr=asyncio.subprocess.PIPE,
            cwd=str(ws_dir),
        )
        stdout, stderr = await asyncio.wait_for(proc.communicate(), timeout=30)
        output = stdout.decode("utf-8", errors="replace")
        if stderr:
            output += "\n" + stderr.decode("utf-8", errors="replace")
        return {"output": output.strip() or "(no output)", "exit_code": proc.returncode or 0}
    except asyncio.TimeoutError:
        return {"output": "Command timed out (30s)", "exit_code": 124}
    except Exception as e:
        return {"output": str(e), "exit_code": 1}


@router.websocket("/ws/{project_id}")
async def terminal_websocket(ws: WebSocket, project_id: str):
    await ws.accept()
    ws_dir = Path(WORKSPACE_ROOT) / project_id / "workspace"
    ws_dir.mkdir(parents=True, exist_ok=True)

    proc = await asyncio.create_subprocess_shell(
        "/bin/bash --norc -i 2>&1",
        stdin=asyncio.subprocess.PIPE,
        stdout=asyncio.subprocess.PIPE,
        stderr=asyncio.subprocess.STDOUT,
        cwd=str(ws_dir),
        env={**os.environ, "TERM": "xterm-256color", "HOME": str(ws_dir)},
    )

    async def read_stdout():
        while proc.returncode is None:
            try:
                data = await proc.stdout.read(4096)
                if not data:
                    break
                await ws.send_bytes(data)
            except (WebSocketDisconnect, OSError):
                break

    async def write_stdin():
        try:
            while True:
                msg = await ws.receive()
                if msg["type"] == "websocket.receive":
                    data = msg.get("bytes") or msg.get("text", "").encode()
                    if data:
                        proc.stdin.write(data)
                        await proc.stdin.drain()
        except (WebSocketDisconnect, OSError, BrokenPipeError):
            pass

    read_task = asyncio.create_task(read_stdout())
    write_task = asyncio.create_task(write_stdin())

    try:
        await asyncio.gather(read_task, write_task)
    except Exception:
        pass
    finally:
        read_task.cancel()
        write_task.cancel()
        try:
            proc.kill()
            await proc.wait()
        except Exception:
            pass
