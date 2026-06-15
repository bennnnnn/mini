"""Tests for BaseAgent JSON parsing — handles all LLM output formats."""

import pytest
from app.agents.base_agent import BaseAgent


# Dummy agent to access the static method
class _TestAgent(BaseAgent):
    name = "test"
    system_prompt = ""


class TestParseJsonOutput:
    """LLM JSON parsing must handle markdown fences, prose wrapping, etc."""

    def test_plain_json_object(self):
        result = _TestAgent._parse_json_output('{"key": "value"}')
        assert result == {"key": "value"}

    def test_json_with_markdown_fence(self):
        result = _TestAgent._parse_json_output(
            '```json\n{"type": "plan", "steps": []}\n```'
        )
        assert result == {"type": "plan", "steps": []}

    def test_json_with_generic_markdown_fence(self):
        result = _TestAgent._parse_json_output(
            '```\n{"verdict": "pass"}\n```'
        )
        assert result == {"verdict": "pass"}

    def test_json_with_prose_before(self):
        result = _TestAgent._parse_json_output(
            'Here is my plan:\n\n{"action": "create", "file": "main.py"}'
        )
        assert result == {"action": "create", "file": "main.py"}

    def test_json_with_prose_after(self):
        result = _TestAgent._parse_json_output(
            '{"action": "create", "file": "main.py"}\n\nLet me know if this works.'
        )
        assert result == {"action": "create", "file": "main.py"}

    def test_json_with_prose_both_sides(self):
        result = _TestAgent._parse_json_output(
            'Sure, here is the plan:\n\n{"steps": [1, 2, 3]}\n\nHope that helps!'
        )
        assert result == {"steps": [1, 2, 3]}

    def test_nested_json(self):
        result = _TestAgent._parse_json_output(
            '{"type": "plan", "steps": [{"agent": "coding", "action": "write"}]}'
        )
        assert result == {
            "type": "plan",
            "steps": [{"agent": "coding", "action": "write"}],
        }

    def test_empty_string(self):
        result = _TestAgent._parse_json_output("")
        assert result is None

    def test_none(self):
        result = _TestAgent._parse_json_output(None)
        assert result is None

    def test_no_json_brackets(self):
        result = _TestAgent._parse_json_output("This is just plain text, no JSON here.")
        assert result is None

    def test_invalid_json_between_braces(self):
        result = _TestAgent._parse_json_output("{not valid json}")
        assert result is None

    def test_array_instead_of_object(self):
        """We only parse objects, not arrays."""
        result = _TestAgent._parse_json_output("[1, 2, 3]")
        assert result is None  # start looks for {, finds nothing

    def test_review_output_format(self):
        """Realistic review agent output with markdown."""
        text = """```json
{
  "verdict": "pass",
  "issues": [],
  "summary": "Code looks clean, no issues found."
}
```"""
        result = _TestAgent._parse_json_output(text)
        assert result == {
            "verdict": "pass",
            "issues": [],
            "summary": "Code looks clean, no issues found.",
        }

    def test_plan_output_with_many_steps(self):
        """Realistic planner output."""
        text = """```json
{
  "type": "plan",
  "steps": [
    {
      "action": "create_files",
      "description": "Create the main application file",
      "agent": "coding"
    },
    {
      "action": "write_tests",
      "description": "Write unit tests for the new code",
      "agent": "testing"
    }
  ]
}
```"""
        result = _TestAgent._parse_json_output(text)
        assert result["type"] == "plan"
        assert len(result["steps"]) == 2
        assert result["steps"][0]["agent"] == "coding"


class TestFormatChat:
    def test_default_format_returns_summary(self):
        agent = _TestAgent(None)
        assert _TestAgent.format_chat({"summary": "Done!"}) == "Done!"
        assert _TestAgent.format_chat({}) == ""
