"""BaseAgent — all specialized agents extend this.

The core value here is run_agentic_loop(): the LLM calls tools,
we execute them and feed results back, and it continues until done.
This is the difference between a one-shot prompt and a real agent.
"""

import json
import re
from contextlib import asynccontextmanager
from typing import Any, Callable, Dict, List, Optional

from app.agents.llm_provider import LLMProvider


class BaseAgent:
    """Abstract base. Subclasses declare their name, system prompt, and allowed tools."""

    name: str = "base"
    system_prompt: str = ""

    # Tools that require user approval before executing
    _DESTRUCTIVE_TOOLS = {"delete_file", "shell"}  # shell can run arbitrary commands

    def __init__(self, llm: LLMProvider):
        self.llm = llm
        self._on_tool_call: Optional[Callable[[str, Dict], None]] = None
        self._on_tool_result: Optional[Callable[[str, Dict, str], None]] = None
        # Injected by the streaming endpoint so the agent can request approval
        # for destructive actions and await the user's response.
        self._request_confirm: Optional[Callable[[str, str, Dict], "Awaitable[bool]"]] = None

    # ── JSON parsing ──────────────────────────────────────────────────────────

    @staticmethod
    def _parse_json_output(text: str) -> Optional[Dict]:
        """
        Extract a JSON object from LLM output that may contain prose or markdown.
        Returns None if no valid JSON found.
        """
        if not text:
            return None
        # Strip markdown code fences
        if "```json" in text:
            m = re.search(r"```json\s*([\s\S]*?)```", text)
            if m:
                text = m.group(1)
        elif "```" in text:
            m = re.search(r"```\s*([\s\S]*?)```", text)
            if m:
                text = m.group(1)

        # Find the outermost { } block
        start = text.find("{")
        end = text.rfind("}") + 1
        if start == -1 or end <= start:
            return None
        try:
            return json.loads(text[start:end])
        except json.JSONDecodeError:
            return None

    # ── Callback context manager ───────────────────────────────────────────────

    @asynccontextmanager
    async def callbacks(self, on_tool_call=None, on_tool_result=None, request_confirm=None):
        """Set live-streaming callbacks for the duration of a run, then clear."""
        self._on_tool_call = on_tool_call
        self._on_tool_result = on_tool_result
        self._request_confirm = request_confirm
        try:
            yield self
        finally:
            self._on_tool_call = None
            self._on_tool_result = None
            self._request_confirm = None

    # ── Result formatter ───────────────────────────────────────────────────────

    @classmethod
    def format_chat(cls, result: dict) -> str:
        """
        Format an agent result as a chat message to show the user.
        Override in subclasses for agent-specific formatting.
        """
        return result.get("summary", "")

    # ── Tool helpers ───────────────────────────────────────────────────────────

    def _format_tools(self, tools: Dict[str, Any]) -> List[Dict]:
        """Convert tool dict → Anthropic tool definition list."""
        return [
            {
                "name": n,
                "description": t.description,
                "input_schema": t.input_schema,
            }
            for n, t in tools.items()
        ]

    async def _call_tool(self, name: str, input_data: Dict, tools: Dict[str, Any]) -> str:
        """Execute one tool call and return a JSON string result."""
        tool = tools.get(name)
        if not tool:
            return json.dumps({"error": f"Tool '{name}' not available to {self.name} agent"})

        # Require approval for destructive actions before executing
        if name in self._DESTRUCTIVE_TOOLS and self._request_confirm:
            approved = await self._request_confirm(name, self.name, input_data)
            if not approved:
                return json.dumps({
                    "success": False,
                    "error": "Action rejected by user.",
                    "cancelled": True,
                })

        try:
            result = await tool.execute(input_data)
            return json.dumps(result, default=str)
        except Exception as e:
            return json.dumps({"error": str(e)})

    # ── Agentic loop ───────────────────────────────────────────────────────────

    async def run_agentic_loop(
        self,
        task: str,
        tools: Dict[str, Any],
        system: Optional[str] = None,
        max_turns: int = 12,
        extra_context: str = "",
        prior_messages: Optional[List[Dict]] = None,
    ) -> Dict[str, Any]:
        """
        Full agentic loop:
          1. LLM receives task + available tools
          2. LLM calls tools (read files, write code, run tests…)
          3. We execute each tool and return the result
          4. LLM processes results and either calls more tools or finishes
          5. Repeat until the LLM stops calling tools

        This allows: read a file → understand it → write based on it → verify.
        """
        prompt = f"{extra_context}\n\n{task}".strip() if extra_context else task

        # Seed the conversation with prior turns so the LLM has real context,
        # then append the current task as the latest user message.
        messages: List[Dict] = list(prior_messages or [])
        messages.append({"role": "user", "content": prompt})
        tool_defs = self._format_tools(tools)
        last_response: Optional[Dict] = None
        all_tool_calls: List[Dict] = []  # track what was called for reporting

        for _turn in range(max_turns):
            response = await self.llm.call(
                messages=messages,
                system=system or self.system_prompt,
                tools=tool_defs or None,
            )
            last_response = response

            # Check stop reason
            stop = response.get("stop_reason")
            if stop == "end_turn" or stop == "stop_sequence":
                break  # LLM is done — no more tool calls

            tool_calls = self.llm.get_tool_calls(response)
            if not tool_calls:
                break  # No tool use blocks — done

            # Append assistant turn (contains tool_use blocks)
            messages.append({"role": "assistant", "content": response["content"]})

            # Execute all tools in this turn (may be parallel calls)
            results = []
            for tc in tool_calls:
                # Fire the live-action callback before executing so the SSE
                # stream can show "Reading package.json..." in real time.
                if self._on_tool_call:
                    self._on_tool_call(tc["name"], tc["input"])

                output = await self._call_tool(tc["name"], tc["input"], tools)

                if self._on_tool_result:
                    self._on_tool_result(tc["name"], tc["input"], output)
                all_tool_calls.append({"tool": tc["name"], "input": tc["input"], "output": output})
                results.append({
                    "type": "tool_result",
                    "tool_use_id": tc["id"],
                    "content": output,
                })

            # Feed tool results back as a user turn
            messages.append({"role": "user", "content": results})

        return {
            "text": self.llm.get_text_content(last_response) if last_response else "",
            "tool_calls": all_tool_calls,
            "usage": self.llm.get_usage(last_response) if last_response else {},
            "raw": last_response,
        }
