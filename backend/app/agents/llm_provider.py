"""Anthropic LLM provider — uses the official SDK.

Replaces the previous raw-httpx implementation.
The SDK gives us: built-in retries, proper streaming, type-safe responses,
and prompt caching headers automatically handled.
"""

from typing import Any, Dict, List, Optional

import anthropic

from app.core.config import settings


class LLMProvider:
    """Thin wrapper around the official Anthropic Python SDK."""

    def __init__(self, model: Optional[str] = None):
        self.model = model or settings.AGENT_MODEL
        self._client = anthropic.AsyncAnthropic(api_key=settings.ANTHROPIC_API_KEY)

    async def stream_text(
        self,
        messages: List[Dict[str, Any]],
        system: Optional[str] = None,
        max_tokens: Optional[int] = None,
    ):
        """Async generator that yields text chunks as they stream from the API."""
        kwargs: Dict[str, Any] = {
            "model": self.model,
            "messages": messages,
            "max_tokens": max_tokens or settings.AGENT_MAX_TOKENS,
        }
        if system:
            kwargs["system"] = system
        async with self._client.messages.stream(**kwargs) as stream:
            async for text in stream.text_stream:
                yield text

    async def call(
        self,
        messages: List[Dict[str, Any]],
        tools: Optional[List[Dict[str, Any]]] = None,
        system: Optional[str] = None,
        temperature: Optional[float] = None,
        max_tokens: Optional[int] = None,
    ) -> Dict[str, Any]:
        """Send a request to Anthropic and return a plain dict response."""
        kwargs: Dict[str, Any] = {
            "model": self.model,
            "messages": messages,
            "max_tokens": max_tokens or settings.AGENT_MAX_TOKENS,
        }

        if system:
            kwargs["system"] = system

        if tools:
            kwargs["tools"] = tools

        # temperature is removed on Opus 4.7+ — only pass on older models
        if temperature is not None and "haiku" in self.model:
            kwargs["temperature"] = temperature

        response = await self._client.messages.create(**kwargs)

        # Convert SDK response to the plain-dict shape the rest of the code expects
        return _to_dict(response)

    def get_text_content(self, response: Dict[str, Any]) -> str:
        for block in response.get("content", []):
            if block.get("type") == "text":
                return block["text"]
        return ""

    def get_tool_calls(self, response: Dict[str, Any]) -> List[Dict[str, Any]]:
        calls = []
        for block in response.get("content", []):
            if block.get("type") == "tool_use":
                calls.append({
                    "id": block["id"],
                    "name": block["name"],
                    "input": block["input"],
                })
        return calls

    def get_usage(self, response: Dict[str, Any]) -> Dict[str, int]:
        usage = response.get("usage", {})
        return {
            "input_tokens": usage.get("input_tokens", 0),
            "output_tokens": usage.get("output_tokens", 0),
        }


# ── Helpers ────────────────────────────────────────────────────────────────────

def _to_dict(response: anthropic.types.Message) -> Dict[str, Any]:
    """Convert an SDK Message object to the plain dict shape the agents expect."""
    content = []
    for block in response.content:
        if hasattr(block, "type"):
            if block.type == "text":
                content.append({"type": "text", "text": block.text})
            elif block.type == "tool_use":
                content.append({
                    "type": "tool_use",
                    "id": block.id,
                    "name": block.name,
                    "input": block.input,
                })
            # thinking, tool_result, etc.
            else:
                content.append({"type": block.type})

    usage = {}
    if response.usage:
        usage = {
            "input_tokens": response.usage.input_tokens,
            "output_tokens": response.usage.output_tokens,
        }

    return {
        "id": response.id,
        "type": "message",
        "role": response.role,
        "content": content,
        "model": response.model,
        "stop_reason": response.stop_reason,
        "usage": usage,
    }


def fast_llm() -> LLMProvider:
    """Return a provider using the fast/cheap model (Haiku) for planning etc."""
    return LLMProvider(model=settings.AGENT_MODEL_FAST)
