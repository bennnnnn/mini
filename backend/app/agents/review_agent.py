"""ReviewAgent — security, quality, and performance review.

Reads code and returns a structured verdict. Never modifies files.
"""

import json
from typing import Any, Dict

from app.agents.base_agent import BaseAgent

SYSTEM = """You are the Review Agent for Mini Cursor — a strict, honest code reviewer.

## Core rule
Be honest. Do not say "pass" just to be polite. A false "pass" misleads the developer.

## Workflow
1. Call list_files — see the full project structure
2. Read EVERY source file (skip .git, node_modules, __pycache__)
3. For each file, check ALL categories below
4. Write your JSON review

## What to check

### Deprecated APIs / outdated patterns
- Deprecated function/method calls or config fields (check framework versions)
- Old import paths, renamed APIs, removed features
- Expo/React Native: deprecated fields in app.json, old navigation patterns
- Next.js: legacy API routes, removed features between versions

### Security
- SQL built with string interpolation (not parameterized queries)
- User input passed to shell commands without sanitization
- Hardcoded secrets, API keys, passwords in source
- Missing auth checks on routes
- Exposed stack traces in API responses

### Correctness
- Logic errors producing wrong output
- Unhandled promise rejections, missing await
- Missing null/undefined checks on values that can be absent
- Off-by-one errors, wrong conditions

### Code quality
- Functions over 50 lines doing multiple things
- Copy-pasted code that should be a function
- Dead code (functions/variables never used)
- Misleading variable names

## Output — return ONLY raw JSON, no markdown fences

{
  "verdict": "pass" | "fail",
  "issues": [
    {
      "severity": "critical" | "high" | "medium" | "low",
      "file": "path/to/file",
      "description": "Specific, actionable description of the problem"
    }
  ],
  "summary": "2-3 sentence honest assessment"
}

fail = any critical/high issue, or 3+ medium issues.
pass = clean code with at most minor low-severity style notes.
"""

_SEVERITY_ORDER = {"critical": 0, "high": 1, "medium": 2, "low": 3}


class ReviewAgent(BaseAgent):
    name = "review"
    system_prompt = SYSTEM
    ALLOWED_TOOLS = {"read_file", "list_files", "search_files"}

    async def run(self, task: str, tools: Dict[str, Any], context: str = "") -> dict:
        agent_tools = {k: v for k, v in tools.items() if k in self.ALLOWED_TOOLS}

        # Detect the file the user has open from the context string
        focused_file: str | None = None
        for line in context.splitlines():
            if "File currently open in the user's editor:" in line:
                focused_file = line.split(":", 1)[-1].strip()
                break

        if focused_file:
            # FAST PATH: read the file ourselves and inject the content directly.
            # The LLM gets the code inline — no tool calls needed, ~5s total.
            file_content: str | None = None
            read_tool = tools.get("read_file")
            if read_tool:
                try:
                    res = await read_tool.execute({"path": focused_file})
                    if res.get("success"):
                        file_content = res.get("content", "")
                except Exception:
                    pass

            if file_content is not None:
                injected = (
                    f"Review this file: `{focused_file}`\n\n"
                    f"```\n{file_content}\n```\n\n"
                    f"Write your JSON review now. Do NOT call any tools — "
                    f"the full file content is above."
                )
                # 2 turns is plenty: one LLM call generates the JSON, done.
                result = await self.run_agentic_loop(
                    task=injected,
                    tools={},     # no tools — content already injected
                    extra_context=context,
                    max_turns=2,
                )
            else:
                # File read failed, fall back to agent reading it
                result = await self.run_agentic_loop(
                    task=f"Read ONLY `{focused_file}` then review it. Do not read other files.",
                    tools=agent_tools,
                    extra_context=context,
                    max_turns=5,
                )
        else:
            # Full project review
            result = await self.run_agentic_loop(
                task=task,
                tools=agent_tools,
                extra_context=context,
                max_turns=20,
            )

        parsed = self._parse_json_output(result["text"])
        if not parsed:
            # Prose response — surface it as the summary
            parsed = {
                "verdict": "fail",
                "issues": [],
                "summary": result["text"] or "Review completed but output could not be parsed.",
            }

        # Sort issues by severity for consistent display
        issues = parsed.get("issues", [])
        issues.sort(key=lambda i: _SEVERITY_ORDER.get(i.get("severity", "low"), 3))

        verdict = parsed.get("verdict", "pass")

        return {
            # success=True means the agent completed its task (always True here).
            # Whether the CODE passed is in `verdict` — "pass" or "fail".
            "success": True,
            "verdict": verdict,
            "code_passed": verdict == "pass",
            "issues": issues,
            "summary": parsed.get("summary", ""),
            "tool_calls": result["tool_calls"],
            "usage": result["usage"],
        }

    @classmethod
    def format_chat(cls, result: dict) -> str:
        verdict = result.get("verdict", "pass")
        issues = result.get("issues", [])
        summary = result.get("summary", "")

        critical_or_high = [i for i in issues if i.get("severity") in ("critical", "high")]
        medium = [i for i in issues if i.get("severity") == "medium"]
        low = [i for i in issues if i.get("severity") == "low"]

        if verdict == "fail" or critical_or_high:
            header = f"**Code Review: ✗ FAIL** — {len(issues)} issue{'s' if len(issues) != 1 else ''} found"
        elif medium or len(low) >= 3:
            header = f"**Code Review: ⚠ PASS WITH NOTES** — {len(issues)} minor issue{'s' if len(issues) != 1 else ''}"
        elif low:
            header = f"**Code Review: ✓ PASS** — {len(low)} style note{'s' if len(low) != 1 else ''}"
        else:
            header = "**Code Review: ✓ PASS** — No issues found"

        lines = [header]
        if issues:
            lines.append("")
            for issue in issues:
                sev = issue.get("severity", "low").upper()
                file_ = issue.get("file", "")
                desc = issue.get("description", "")
                loc = f"`{file_}` — " if file_ else ""
                lines.append(f"• **[{sev}]** {loc}{desc}")
        if summary:
            lines.append(f"\n{summary}")

        return "\n".join(lines)
