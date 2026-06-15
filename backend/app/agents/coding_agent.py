"""CodingAgent — reads existing code and writes new files.

The Coding Agent is the only agent that writes files.
It always reads relevant existing files before writing — it never
generates code in a vacuum without understanding what's already there.
"""

from typing import Any, Dict, List

from app.agents.base_agent import BaseAgent

SYSTEM = """You are the Coding Agent for Mini Cursor — an AI software engineering platform.

Your job: write or modify files using the write_file tool.

## CRITICAL RULES — violating these means you have failed

1. NEVER describe what you're about to do without doing it. Just do it.
2. NEVER say "I'll delete X" — call delete_file("X") immediately.
3. NEVER say "I'll create X" — call write_file("X", content) immediately.
4. NEVER output code in your text response — call write_file instead.
5. NEVER say you can't delete files — use delete_file.
6. NEVER show <tool_call> XML in your response — use actual API tool calls.

## Tools — always call them, never describe them

- write_file(path, content) — create or overwrite. Provide COMPLETE file content.
- read_file(path) — read before modifying.
- delete_file(path) — delete permanently. Call this when user says delete/remove/get rid of.
- list_files() — see workspace contents.

## Workflow

DELETE request:
1. Identify the file to delete
2. Call delete_file(path) immediately
3. One-line confirmation in your response

WRITE/MODIFY request:
1. Read existing file if modifying
2. Call write_file with complete content
3. One-line summary of what changed
- Focus only on making the code correct and complete
"""


class CodingAgent(BaseAgent):
    name = "coding"
    system_prompt = SYSTEM

    # Tools available to coding agent
    ALLOWED_TOOLS = {
        "read_file", "write_file", "delete_file", "list_files", "search_files",
        "grep", "find", "rename_file", "make_dir", "sed_replace", "shell",
    }

    async def run(
        self,
        task: str,
        tools: Dict[str, Any],
        context: str = "",
    ) -> Dict[str, Any]:
        """Execute a coding step — read existing code, write new code."""
        agent_tools = {k: v for k, v in tools.items() if k in self.ALLOWED_TOOLS}

        result = await self.run_agentic_loop(
            task=task,
            tools=agent_tools,
            extra_context=context,
            max_turns=15,  # May need many turns to read + write multiple files
        )

        # Extract files written from tool calls
        files_written: List[Dict] = []
        for tc in result["tool_calls"]:
            if tc["tool"] == "write_file":
                import json as _json
                try:
                    out = _json.loads(tc["output"])
                    if out.get("success"):
                        files_written.append({
                            "path": out.get("path", tc["input"].get("path", "")),
                            "size": out.get("size", 0),
                        })
                except Exception:
                    pass

        return {
            "success": True,
            "summary": result["text"],
            "files_written": files_written,
            "tool_calls": result["tool_calls"],
            "usage": result["usage"],
        }

    @classmethod
    def format_chat(cls, result: dict) -> str:
        summary = result.get("summary", "")
        files = result.get("files_written", [])
        if not summary and not files:
            return ""
        # Only show the summary if it adds information beyond the file cards
        return summary if summary else ""
