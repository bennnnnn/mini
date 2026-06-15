"""CoordinatorAgent — routes between conversation and code execution.

Philosophy: trust the LLM with context rather than hard-coding routing rules.
The only fast-paths are for things that are truly trivial (pure greetings).
Everything else goes through a single smart decision call that sees:
  - The user's message
  - Full conversation history
  - Project context (files, tech stack, active file)
  - User preferences
"""

import json
import re
from contextlib import asynccontextmanager
from typing import Any, Dict, List, Optional

from app.agents.base_agent import BaseAgent
from app.agents.coding_agent import CodingAgent
from app.agents.devops_agent import DevOpsAgent
from app.agents.execution_state import ExecutionState, PlanStep
from app.agents.git_agent import GitAgent
from app.agents.llm_provider import LLMProvider, fast_llm
from app.agents.planner_agent import PlannerAgent
from app.agents.review_agent import ReviewAgent
from app.agents.testing_agent import TestingAgent


# ── Identity ───────────────────────────────────────────────────────────────────

_IDENTITY = (
    "I'm Mini Cursor — an AI software engineering assistant built by the Mini Cursor team. "
    "Powered by Claude under the hood. I can write code, review it, run tests, create PRs, "
    "and help with any software engineering task."
)

_GREETINGS = {"hi","hey","hello","hiya","yo","sup","heya","hiya"}

_IDENTITY_TRIGGERS = {
    "who are you","who are u","who r u","what are you","who made you",
    "who created you","who built you","what is mini cursor",
    "tell me about yourself","introduce yourself",
}


# ── Decision system prompt ─────────────────────────────────────────────────────

_DECISION_SYSTEM = """You are Mini Cursor, an AI assistant that can both chat naturally AND do software engineering tasks.

The user owns their conversation. They can talk about anything — life, ideas, questions — AND ask you to code, review, or build things. You handle both naturally in the same chat.

If the user mentions a project name (like "africana", "roomly") while asking to code something, include it in the plan so the right files are used.

Given a user message + conversation history + project context, you decide:
1. Is this a CHAT message (general conversation, questions, jokes, small talk)?
2. Is this a CODING task (write/edit/review/test/delete files, run commands, create PRs)?

For CHAT — respond naturally and helpfully. Format your response in clean markdown:
- Use ## for headings, - for bullets, 1. for numbered lists
- Each bullet/numbered item on its OWN line with a blank line between sections
- Be concise but complete. Never truncate lists.

For CODING — output a JSON plan:
{"type":"plan","steps":[
  {"action":"create_files|modify_files|delete_files|review_code|run_tests|create_pr",
   "description":"exact what to do — file names, what logic",
   "agent":"coding|review|testing|git|devops"}
]}

CHAT examples:
- "hi", "how are you", "what's the capital of France" → chat reply
- "what time is it", "tell me a joke", "explain recursion" → chat reply
- "how smart are you", "do you know Kenya" → chat reply

CODING examples:
- "create a hello world in python" → plan with coding step
- "review this file" → plan with review step
- "delete hello_world.py" → plan with delete step
- "fix the bug in auth.py" → plan with modify step

CONTEXT IS KEY:
- If user says "tell me about it" / "what's in it" / "explain it" with a file open → review that file
- If user says "do it" / "continue" / "more" → look at conversation and continue
- If user says "in java" / "in rust" after creating something → create the same thing in that language
- Short follow-ups ("really?", "wow", "ok") in a conversation → chat reply, continue naturally
- NEVER ask for clarification if the intent is clear from context
- NEVER create code that ports/replicates existing project files for a simple request like "hello world"

Keep coding plans to 1-3 steps. Be decisive."""


class CoordinatorAgent:
    """Routes tasks and orchestrates specialized agents."""

    def __init__(self, llm: LLMProvider):
        self.llm = llm
        _fast = fast_llm()
        self.planner = PlannerAgent(llm)   # uses Sonnet for quality
        self.coder = CodingAgent(llm)
        self.tester = TestingAgent(llm)
        self.reviewer = ReviewAgent(llm)
        self.git = GitAgent(_fast)
        self.devops = DevOpsAgent(_fast)
        self._chat_reply: Optional[str] = None
        self._stream_was_coding: bool = False

    # ── Context building ───────────────────────────────────────────────────────

    async def build_project_context(
        self,
        tools: Dict[str, Any],
        github_repo: Optional[str] = None,
        project_name: Optional[str] = None,
        project_description: Optional[str] = None,
        active_file: Optional[str] = None,
        user_context: Optional[List[Dict]] = None,
    ) -> str:
        lines: List[str] = []
        if project_name:
            lines.append(f"Project: {project_name}")
        if project_description:
            lines.append(f"Description: {project_description}")
        if github_repo:
            lines.append(f"GitHub: {github_repo}")

        list_tool = tools.get("list_files")
        if list_tool:
            try:
                result = await list_tool.execute({"path": "."})
                if result.get("success") and result.get("entries"):
                    entries = result["entries"]
                    names = [
                        f"{e['name']}/" if e["type"] == "directory" else e["name"]
                        for e in entries[:40]
                    ]
                    if names:
                        lines.append(f"Files: {', '.join(names)}")
                    stack = _detect_stack({e["name"] for e in entries})
                    if stack:
                        lines.append(f"Tech stack: {stack}")
            except Exception:
                pass

        if active_file:
            lines.append(f"File open in editor: {active_file}")

        if user_context:
            global_prefs = [c for c in user_context if c.get("scope") == "global"]
            project_notes = [c for c in user_context if c.get("scope") == "project"]
            if global_prefs:
                prefs = ", ".join(f"{c['key']}: {c['value']}" for c in global_prefs)
                lines.append(f"User preferences: {prefs}")
            if project_notes:
                notes = "; ".join(f"{c['key']}: {c['value']}" for c in project_notes)
                lines.append(f"Project notes: {notes}")

        return ("## Project context\n" + "\n".join(lines) + "\n") if lines else ""

    # ── Decision: chat or plan? ────────────────────────────────────────────────

    async def plan(
        self,
        user_request: str,
        tools: Dict[str, Any],
        github_repo: Optional[str] = None,
        project_name: Optional[str] = None,
        project_description: Optional[str] = None,
        active_file: Optional[str] = None,
        on_tool_call=None,
        prior_messages: Optional[List[Dict]] = None,
        user_context: Optional[List[Dict]] = None,
        on_token=None,  # callback(str) for streaming chat replies
    ) -> Optional[List[PlanStep]]:
        self._chat_reply = None

        normalized = re.sub(r'[!.,?/\\]+$', '', user_request.strip().lower()).strip()

        # ── Instant fast-paths (no LLM cost) ──────────────────────────────────
        if normalized in _GREETINGS:
            self._chat_reply = "Hey! What would you like to build or work on?"
            if on_token:
                on_token(self._chat_reply)
            return None

        if normalized in _IDENTITY_TRIGGERS:
            self._chat_reply = _IDENTITY
            if on_token:
                on_token(self._chat_reply)
            return None

        # ── Single smart LLM decision call ────────────────────────────────────
        # Build context block for the LLM
        context = await self.build_project_context(
            tools, github_repo, project_name, project_description,
            active_file, user_context
        )

        # Format recent conversation for the LLM
        history_lines = []
        for m in (prior_messages or [])[-8:]:
            role = "Assistant" if m.get("role") == "assistant" else "User"
            content = m.get("content", "")[:400]
            history_lines.append(f"{role}: {content}")
        history_str = "\n".join(history_lines)

        full_context = ""
        if context:
            full_context += context + "\n"
        if history_str:
            full_context += f"## Recent conversation\n{history_str}\n"

        system_prompt = _DECISION_SYSTEM + (f"\n\n{full_context}" if full_context else "")
        messages = [{"role": "user", "content": user_request}]

        try:
            # Stream tokens in real-time so the user sees text appearing live.
            # We call on_token for every chunk as it arrives.
            # If it turns out to be a coding plan (JSON detected), the caller
            # must send a 'stream_discard' event to wipe the streamed text.
            chunks: List[str] = []
            async for chunk in self.llm.stream_text(
                messages=messages,
                system=system_prompt,
                max_tokens=1500,
            ):
                chunks.append(chunk)
                if on_token:
                    on_token(chunk)
            text = "".join(chunks).strip()
        except Exception:
            self._chat_reply = "I'm having trouble right now — please try again."
            return None

        plan = self._extract_plan(text)
        if plan is not None:
            # Coding task — chunks were already streamed but should be discarded.
            # Signal this via a special flag so agent.py can send stream_discard.
            self._stream_was_coding = True
            return plan

        self._stream_was_coding = False
        self._chat_reply = text
        return None

    def _extract_plan(self, text: str) -> Optional[List[PlanStep]]:
        """Extract a JSON plan from the LLM response, or return None for chat."""
        # Look for JSON with "type":"plan"
        json_match = re.search(r'\{[\s\S]*?"type"\s*:\s*"plan"[\s\S]*?\}', text)
        if not json_match:
            return None
        try:
            parsed = json.loads(json_match.group())
        except json.JSONDecodeError:
            # Try to find any JSON array of steps
            arr_match = re.search(r'"steps"\s*:\s*(\[[\s\S]*?\])', text)
            if not arr_match:
                return None
            try:
                steps_raw = json.loads(arr_match.group(1))
            except json.JSONDecodeError:
                return None
            parsed = {"steps": steps_raw}

        steps_raw = parsed.get("steps", [])
        if not isinstance(steps_raw, list) or not steps_raw:
            return None

        return [
            PlanStep(
                action=s.get("action", "create_files"),
                description=s.get("description", ""),
                agent=s.get("agent", "coding"),
                params={},
            )
            for s in steps_raw
            if isinstance(s, dict)
        ]

    # ── Step execution ─────────────────────────────────────────────────────────

    @property
    def _agent_map(self) -> Dict[str, BaseAgent]:
        return {
            "coding": self.coder,
            "testing": self.tester,
            "review": self.reviewer,
            "git": self.git,
            "devops": self.devops,
        }

    def format_step_result(self, agent_name: str, result: dict) -> str:
        agent = self._agent_map.get(agent_name.lower(), self.coder)
        return type(agent).format_chat(result)

    async def execute_step(
        self,
        step: PlanStep,
        tools: Dict[str, Any],
        context: str = "",
        user_request: str = "",
        on_tool_call=None,
        on_tool_result=None,
        request_confirm=None,
    ) -> Dict[str, Any]:
        agent = self._agent_map.get(step.agent.lower(), self.coder)

        full_context = context
        if user_request:
            full_context = f"## Original user request\n{user_request}\n\n{context}" if context else f"## Original user request\n{user_request}"

        async with agent.callbacks(on_tool_call, on_tool_result, request_confirm):
            result = await agent.run(step.description, tools, full_context)

        return result

    async def verify(self, artifacts: Dict[str, Any]) -> bool:
        if artifacts.get("test_results"):
            return artifacts["test_results"].get("success", False)
        if artifacts.get("review"):
            return artifacts["review"].get("verdict", "pass") == "pass"
        return True

    async def repair(self, step: PlanStep, error: str) -> None:
        pass


# ── Utilities ──────────────────────────────────────────────────────────────────

def _detect_stack(filenames: set) -> str:
    hints = []
    if "package.json" in filenames:
        hints.append("Node.js")
        if any(f in filenames for f in ("next.config.js", "next.config.ts")):
            hints.append("Next.js")
        if "tsconfig.json" in filenames:
            hints.append("TypeScript")
    if "requirements.txt" in filenames or "pyproject.toml" in filenames:
        hints.append("Python")
    if "Cargo.toml" in filenames:
        hints.append("Rust")
    if "go.mod" in filenames:
        hints.append("Go")
    if "pom.xml" in filenames or "build.gradle" in filenames:
        hints.append("Java")
    if "Gemfile" in filenames:
        hints.append("Ruby")
    if "docker-compose.yml" in filenames or "Dockerfile" in filenames:
        hints.append("Docker")
    return ", ".join(hints)
