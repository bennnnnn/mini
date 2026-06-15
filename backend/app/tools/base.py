"""Base tool contract and all tool implementations.

All tools follow the same interface: Tool(name, description, input_schema, execute).
Agents NEVER execute anything directly — they emit tool calls that the backend runs.
"""

from abc import ABC, abstractmethod
from typing import Any, Dict


class Tool(ABC):
    """All Mini Cursor tools implement this contract."""

    name: str
    description: str
    input_schema: Dict[str, Any]

    @abstractmethod
    async def execute(self, input: Dict[str, Any]) -> Dict[str, Any]:
        """Execute the tool with the given input. Returns a result dict."""
        ...

    def to_anthropic_tool(self) -> Dict[str, Any]:
        """Convert to Anthropic tool-use format."""
        return {
            "name": self.name,
            "description": self.description,
            "input_schema": self.input_schema,
        }
