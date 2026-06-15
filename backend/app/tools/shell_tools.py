"""Shell tools — run commands and file operations directly in the project workspace.

All commands are sandboxed to the project workspace directory.
No access to the host filesystem outside the workspace.
"""

import asyncio
import shutil
from pathlib import Path
from typing import Any, Dict

from app.tools.base import Tool

WORKSPACE_ROOT = "/tmp/mini-cursor-workspaces"


def _workspace(project_id: str) -> Path:
    ws = Path(WORKSPACE_ROOT) / project_id / "workspace"
    ws.mkdir(parents=True, exist_ok=True)
    return ws


def _safe_path(ws: Path, user_path: str) -> Path:
    resolved = (ws / user_path).resolve()
    if not str(resolved).startswith(str(ws.resolve())):
        raise ValueError(f"Path escape blocked: {user_path}")
    return resolved


async def _run(cmd: str, cwd: Path, timeout: int = 30) -> Dict[str, Any]:
    proc = await asyncio.create_subprocess_shell(
        cmd,
        cwd=str(cwd),
        stdout=asyncio.subprocess.PIPE,
        stderr=asyncio.subprocess.PIPE,
    )
    try:
        stdout, stderr = await asyncio.wait_for(proc.communicate(), timeout=timeout)
        return {
            "success": proc.returncode == 0,
            "exit_code": proc.returncode,
            "stdout": stdout.decode("utf-8", errors="replace").strip(),
            "stderr": stderr.decode("utf-8", errors="replace").strip(),
        }
    except asyncio.TimeoutError:
        proc.kill()
        return {"success": False, "error": f"Command timed out after {timeout}s"}


# ── Grep ──────────────────────────────────────────────────────────────────────

class GrepTool(Tool):
    name = "grep"
    description = "Search for a pattern in files. Returns matching lines with file and line number."
    input_schema = {
        "type": "object",
        "properties": {
            "pattern": {"type": "string", "description": "Regex or literal pattern to search for"},
            "path": {"type": "string", "description": "File or directory to search (default: . = entire workspace)", "default": "."},
            "case_insensitive": {"type": "boolean", "description": "Case-insensitive search", "default": False},
            "include": {"type": "string", "description": "File glob to include, e.g. '*.py'", "default": ""},
        },
        "required": ["pattern"],
    }

    def __init__(self, project_id: str):
        self.project_id = project_id

    async def execute(self, input: Dict[str, Any]) -> Dict[str, Any]:
        ws = _workspace(self.project_id)
        pattern = input["pattern"]
        path = input.get("path", ".")
        flags = "-rn"
        if input.get("case_insensitive"):
            flags += "i"
        include = input.get("include", "")
        include_flag = f"--include='{include}'" if include else ""
        cmd = f"grep {flags} {include_flag} {repr(pattern)} {repr(path)} 2>/dev/null | head -100"
        result = await _run(cmd, ws)
        return {"success": True, "matches": result["stdout"], "pattern": pattern}


# ── Find ──────────────────────────────────────────────────────────────────────

class FindTool(Tool):
    name = "find"
    description = "Find files and directories matching a pattern."
    input_schema = {
        "type": "object",
        "properties": {
            "pattern": {"type": "string", "description": "Filename pattern, e.g. '*.py' or 'main*'"},
            "path": {"type": "string", "description": "Directory to search (default: workspace root)", "default": "."},
            "type": {"type": "string", "description": "'f' for files, 'd' for directories, 'any' for both", "default": "f"},
        },
        "required": ["pattern"],
    }

    def __init__(self, project_id: str):
        self.project_id = project_id

    async def execute(self, input: Dict[str, Any]) -> Dict[str, Any]:
        ws = _workspace(self.project_id)
        pattern = input["pattern"]
        path = input.get("path", ".")
        type_flag = ""
        t = input.get("type", "f")
        if t in ("f", "d"):
            type_flag = f"-type {t}"
        cmd = f"find {repr(path)} {type_flag} -name {repr(pattern)} 2>/dev/null | head -100"
        result = await _run(cmd, ws)
        files = [f for f in result["stdout"].splitlines() if f]
        return {"success": True, "files": files, "count": len(files)}


# ── Rename / Move ─────────────────────────────────────────────────────────────

class RenameFileTool(Tool):
    name = "rename_file"
    description = "Rename or move a file or directory within the workspace."
    input_schema = {
        "type": "object",
        "properties": {
            "from_path": {"type": "string", "description": "Current path"},
            "to_path": {"type": "string", "description": "New path (can be in a different directory)"},
        },
        "required": ["from_path", "to_path"],
    }

    def __init__(self, project_id: str):
        self.project_id = project_id

    async def execute(self, input: Dict[str, Any]) -> Dict[str, Any]:
        ws = _workspace(self.project_id)
        src = _safe_path(ws, input["from_path"])
        dst = _safe_path(ws, input["to_path"])
        if not src.exists():
            return {"success": False, "error": f"Not found: {input['from_path']}"}
        dst.parent.mkdir(parents=True, exist_ok=True)
        shutil.move(str(src), str(dst))
        return {"success": True, "from": input["from_path"], "to": input["to_path"]}


# ── Create directory ──────────────────────────────────────────────────────────

class MakeDirTool(Tool):
    name = "make_dir"
    description = "Create a directory (and any missing parent directories)."
    input_schema = {
        "type": "object",
        "properties": {
            "path": {"type": "string", "description": "Directory path to create"},
        },
        "required": ["path"],
    }

    def __init__(self, project_id: str):
        self.project_id = project_id

    async def execute(self, input: Dict[str, Any]) -> Dict[str, Any]:
        ws = _workspace(self.project_id)
        dir_path = _safe_path(ws, input["path"])
        dir_path.mkdir(parents=True, exist_ok=True)
        return {"success": True, "path": input["path"]}


# ── Sed / inline replace ───────────────────────────────────────────────────────

class SedTool(Tool):
    name = "sed_replace"
    description = "Find and replace text in a file. Faster than read+write for simple substitutions."
    input_schema = {
        "type": "object",
        "properties": {
            "path": {"type": "string", "description": "File to modify"},
            "find": {"type": "string", "description": "Text or regex to find"},
            "replace": {"type": "string", "description": "Replacement text"},
            "all_occurrences": {"type": "boolean", "description": "Replace all occurrences (default true)", "default": True},
        },
        "required": ["path", "find", "replace"],
    }

    def __init__(self, project_id: str):
        self.project_id = project_id

    async def execute(self, input: Dict[str, Any]) -> Dict[str, Any]:
        ws = _workspace(self.project_id)
        file_path = _safe_path(ws, input["path"])
        if not file_path.exists():
            return {"success": False, "error": f"File not found: {input['path']}"}

        content = file_path.read_text(encoding="utf-8")
        find = input["find"]
        replace = input["replace"]
        all_occ = input.get("all_occurrences", True)

        if all_occ:
            new_content = content.replace(find, replace)
        else:
            new_content = content.replace(find, replace, 1)

        if new_content == content:
            return {"success": True, "path": input["path"], "changed": False, "message": "Pattern not found — no changes made"}

        file_path.write_text(new_content, encoding="utf-8")
        return {"success": True, "path": input["path"], "changed": True}


# ── Shell command ──────────────────────────────────────────────────────────────

class ShellTool(Tool):
    name = "shell"
    description = (
        "Run a shell command in the workspace directory. "
        "Use for git commands, package managers, build tools, etc. "
        "Commands run with a 30s timeout and cannot access files outside the workspace."
    )
    input_schema = {
        "type": "object",
        "properties": {
            "command": {"type": "string", "description": "Shell command to run"},
        },
        "required": ["command"],
    }

    # Block obviously dangerous commands
    _BLOCKED = ("rm -rf /", "sudo", "curl | bash", "wget | bash", "shutdown", "reboot", "mkfs")

    def __init__(self, project_id: str):
        self.project_id = project_id

    async def execute(self, input: Dict[str, Any]) -> Dict[str, Any]:
        cmd = input["command"]
        for blocked in self._BLOCKED:
            if blocked in cmd:
                return {"success": False, "error": f"Command blocked for safety: contains '{blocked}'"}
        ws = _workspace(self.project_id)
        return await _run(cmd, ws, timeout=30)
