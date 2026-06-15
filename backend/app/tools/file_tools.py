"""File system tools — read, write, list, search within the agent workspace.

All paths are relative to the project workspace (/projects/{project_id}/workspace/).
Agents CANNOT access files outside their workspace.
"""

import os
from pathlib import Path
from typing import Any, Dict

from app.tools.base import Tool


WORKSPACE_ROOT = "/tmp/mini-cursor-workspaces"


def _resolve_workspace(project_id: str) -> Path:
    """Get the workspace root for a project. Create if missing."""
    ws = Path(WORKSPACE_ROOT) / project_id / "workspace"
    ws.mkdir(parents=True, exist_ok=True)
    return ws


def _safe_path(workspace: Path, user_path: str) -> Path:
    """Resolve a user-supplied path within the workspace. Raises on escape."""
    resolved = (workspace / user_path).resolve()
    if not str(resolved).startswith(str(workspace.resolve())):
        raise ValueError(f"Path escape attempt: {user_path}")
    return resolved


class ReadFileTool(Tool):
    name = "read_file"
    description = "Read the contents of a file in the project workspace."
    input_schema = {
        "type": "object",
        "properties": {
            "path": {"type": "string", "description": "File path relative to workspace root"},
        },
        "required": ["path"],
    }

    def __init__(self, project_id: str):
        self.project_id = project_id

    async def execute(self, input: Dict[str, Any]) -> Dict[str, Any]:
        ws = _resolve_workspace(self.project_id)
        file_path = _safe_path(ws, input["path"])
        if not file_path.exists():
            return {"success": False, "error": f"File not found: {input['path']}"}
        content = file_path.read_text(encoding="utf-8")
        return {"success": True, "content": content, "path": input["path"]}


class WriteFileTool(Tool):
    name = "write_file"
    description = "Write or overwrite a file in the project workspace."
    input_schema = {
        "type": "object",
        "properties": {
            "path": {"type": "string", "description": "File path relative to workspace root"},
            "content": {"type": "string", "description": "File contents"},
        },
        "required": ["path", "content"],
    }

    def __init__(self, project_id: str):
        self.project_id = project_id

    async def execute(self, input: Dict[str, Any]) -> Dict[str, Any]:
        ws = _resolve_workspace(self.project_id)
        file_path = _safe_path(ws, input["path"])
        file_path.parent.mkdir(parents=True, exist_ok=True)
        file_path.write_text(input["content"], encoding="utf-8")
        return {"success": True, "path": input["path"], "size": len(input["content"])}


class DeleteFileTool(Tool):
    name = "delete_file"
    description = "Delete a file from the project workspace. Use with care — this is permanent."
    input_schema = {
        "type": "object",
        "properties": {
            "path": {"type": "string", "description": "File path relative to workspace root"},
        },
        "required": ["path"],
    }

    def __init__(self, project_id: str):
        self.project_id = project_id

    async def execute(self, input: Dict[str, Any]) -> Dict[str, Any]:
        ws = _resolve_workspace(self.project_id)
        file_path = _safe_path(ws, input["path"])
        if not file_path.exists():
            return {"success": False, "error": f"File not found: {input['path']}"}
        if file_path.is_dir():
            return {"success": False, "error": f"Cannot delete directory: {input['path']}"}
        file_path.unlink()
        return {"success": True, "path": input["path"], "deleted": True}


class ListFilesTool(Tool):
    name = "list_files"
    description = "List files and directories in the workspace."
    input_schema = {
        "type": "object",
        "properties": {
            "path": {"type": "string", "description": "Directory path relative to workspace root", "default": "."},
        },
    }

    def __init__(self, project_id: str):
        self.project_id = project_id

    async def execute(self, input: Dict[str, Any]) -> Dict[str, Any]:
        ws = _resolve_workspace(self.project_id)
        dir_path = _safe_path(ws, input.get("path", "."))
        if not dir_path.exists():
            return {"success": False, "error": f"Directory not found: {input.get('path', '.')}"}

        entries = []
        for entry in sorted(dir_path.iterdir()):
            entries.append({
                "name": entry.name,
                "type": "directory" if entry.is_dir() else "file",
                "size": entry.stat().st_size if entry.is_file() else 0,
            })
        return {"success": True, "path": input.get("path", "."), "entries": entries}


class SearchFilesTool(Tool):
    name = "search_files"
    description = "Search for text within files in the workspace (grep)."
    input_schema = {
        "type": "object",
        "properties": {
            "pattern": {"type": "string", "description": "Text or regex to search for"},
            "path": {"type": "string", "description": "Directory to search in", "default": "."},
        },
        "required": ["pattern"],
    }

    def __init__(self, project_id: str):
        self.project_id = project_id

    async def execute(self, input: Dict[str, Any]) -> Dict[str, Any]:
        import re
        ws = _resolve_workspace(self.project_id)
        search_dir = _safe_path(ws, input.get("path", "."))
        pattern = input["pattern"]

        matches = []
        try:
            regex = re.compile(pattern)
        except re.error:
            # Treat as literal string
            regex = re.compile(re.escape(pattern))

        for root, dirs, files in os.walk(search_dir):
            # Skip hidden dirs
            dirs[:] = [d for d in dirs if not d.startswith(".")]
            for fname in files:
                if fname.startswith("."):
                    continue
                fpath = Path(root) / fname
                try:
                    for i, line in enumerate(fpath.read_text(encoding="utf-8").splitlines(), 1):
                        if regex.search(line):
                            rel = str(fpath.relative_to(ws))
                            matches.append({"file": rel, "line": i, "content": line.strip()})
                except (UnicodeDecodeError, PermissionError):
                    continue

        return {"success": True, "pattern": pattern, "matches": matches[:50]}
