"""Tests for the tool execution pipeline and tool registry."""

import json
from pathlib import Path
from unittest.mock import AsyncMock, patch

import pytest

from app.tools.base import Tool
from app.tools.file_tools import ReadFileTool, WriteFileTool, ListFilesTool, SearchFilesTool
from app.tools.registry import build_tool_registry


class TestToolBase:
    """The Tool ABC contract."""

    def test_tool_has_required_attributes(self):
        """Every tool must have name, description, input_schema, and execute."""

        class MyTool(Tool):
            name = "my_tool"
            description = "Does something"
            input_schema = {"type": "object", "properties": {}}

            async def execute(self, input):
                return {"success": True}

        tool = MyTool()
        assert tool.name == "my_tool"
        assert tool.description == "Does something"
        assert tool.input_schema == {"type": "object", "properties": {}}

    def test_tool_to_anthropic_format(self):
        class MyTool(Tool):
            name = "my_tool"
            description = "Does something"
            input_schema = {"type": "object", "properties": {"x": {"type": "string"}}}

            async def execute(self, input):
                return {"success": True}

        tool = MyTool()
        anthropic_def = tool.to_anthropic_tool()
        assert anthropic_def["name"] == "my_tool"
        assert anthropic_def["description"] == "Does something"
        assert anthropic_def["input_schema"]["properties"]["x"]["type"] == "string"


class TestToolRegistry:
    """Tool registry builds the correct set of tools."""

    def test_file_tools_always_available(self):
        tools = build_tool_registry("test-project")
        assert "read_file" in tools
        assert "write_file" in tools
        assert "list_files" in tools
        assert "search_files" in tools

    def test_execution_tools_always_available(self):
        tools = build_tool_registry("test-project")
        assert "run_python" in tools
        assert "run_bash" in tools
        assert "run_tests" in tools

    def test_github_tools_only_with_token(self):
        tools_without = build_tool_registry("test-project", github_token="")
        assert "create_branch" not in tools_without
        assert "create_pr" not in tools_without

        tools_with = build_tool_registry("test-project", github_token="fake-token")
        assert "create_branch" in tools_with
        assert "create_pr" in tools_with

    def test_devops_tools_always_available(self):
        tools = build_tool_registry("test-project")
        assert "get_cpu_usage" in tools
        assert "get_memory_usage" in tools
        assert "list_containers" in tools

    def test_ticket_tools_always_available(self):
        tools = build_tool_registry("test-project")
        assert "create_ticket" in tools
        assert "list_tickets" in tools

    def test_all_tools_are_tool_instances(self):
        tools = build_tool_registry("test-project")
        for name, tool in tools.items():
            assert isinstance(tool, Tool), f"{name} is not a Tool instance"


class TestWriteFileTool:
    """Write and read back to verify round-trip."""

    def test_write_and_read(self, tmp_path):
        # Create workspace inside tmp_path
        ws = tmp_path / "workspace"
        ws.mkdir()

        tool = WriteFileTool("test-proj")

        # Patch _resolve_workspace to use our tmp dir
        with patch("app.tools.file_tools._resolve_workspace", return_value=ws):
            import asyncio
            result = asyncio.run(tool.execute({"path": "hello.py", "content": "print('hello')"}))
            assert result["success"] is True
            assert result["path"] == "hello.py"
            assert result["size"] > 0

            # Verify file was written
            written = (ws / "hello.py").read_text()
            assert written == "print('hello')"

    def test_write_creates_nested_dirs(self, tmp_path):
        ws = tmp_path / "workspace"
        ws.mkdir()

        tool = WriteFileTool("test-proj")

        with patch("app.tools.file_tools._resolve_workspace", return_value=ws):
            import asyncio
            result = asyncio.run(
                tool.execute({"path": "deep/nested/file.txt", "content": "data"})
            )
            assert result["success"] is True
            assert (ws / "deep" / "nested" / "file.txt").exists()


class TestReadFileTool:
    def test_read_existing_file(self, tmp_path):
        ws = tmp_path / "workspace"
        ws.mkdir()
        (ws / "test.txt").write_text("Hello, world!")

        tool = ReadFileTool("test-proj")

        with patch("app.tools.file_tools._resolve_workspace", return_value=ws):
            import asyncio
            result = asyncio.run(tool.execute({"path": "test.txt"}))
            assert result["success"] is True
            assert result["content"] == "Hello, world!"
            assert result["path"] == "test.txt"

    def test_read_missing_file(self, tmp_path):
        ws = tmp_path / "workspace"
        ws.mkdir()

        tool = ReadFileTool("test-proj")

        with patch("app.tools.file_tools._resolve_workspace", return_value=ws):
            import asyncio
            result = asyncio.run(tool.execute({"path": "nonexistent.txt"}))
            assert result["success"] is False
            assert "not found" in result["error"]


class TestListFilesTool:
    def test_list_empty_directory(self, tmp_path):
        ws = tmp_path / "workspace"
        ws.mkdir()

        tool = ListFilesTool("test-proj")

        with patch("app.tools.file_tools._resolve_workspace", return_value=ws):
            import asyncio
            result = asyncio.run(tool.execute({"path": "."}))
            assert result["success"] is True
            assert result["entries"] == []

    def test_list_with_files_and_dirs(self, tmp_path):
        ws = tmp_path / "workspace"
        ws.mkdir()
        (ws / "a.py").write_text("a")
        (ws / "b.py").write_text("b")
        (ws / "subdir").mkdir()

        tool = ListFilesTool("test-proj")

        with patch("app.tools.file_tools._resolve_workspace", return_value=ws):
            import asyncio
            result = asyncio.run(tool.execute({"path": "."}))
            assert result["success"] is True
            names = {e["name"] for e in result["entries"]}
            assert names == {"a.py", "b.py", "subdir"}


class TestSearchFilesTool:
    def test_search_finds_matches(self, tmp_path):
        ws = tmp_path / "workspace"
        ws.mkdir()
        (ws / "a.py").write_text("def hello():\n    return 'world'\n")
        (ws / "b.py").write_text("def goodbye():\n    return 'moon'\n")

        tool = SearchFilesTool("test-proj")

        with patch("app.tools.file_tools._resolve_workspace", return_value=ws):
            import asyncio
            result = asyncio.run(tool.execute({"pattern": "def hello", "path": "."}))
            assert result["success"] is True
            assert len(result["matches"]) == 1
            assert result["matches"][0]["file"] == "a.py"

    def test_search_no_matches(self, tmp_path):
        ws = tmp_path / "workspace"
        ws.mkdir()
        (ws / "a.py").write_text("x = 1\n")

        tool = SearchFilesTool("test-proj")

        with patch("app.tools.file_tools._resolve_workspace", return_value=ws):
            import asyncio
            result = asyncio.run(tool.execute({"pattern": "nonexistent_pattern_xyz", "path": "."}))
            assert result["success"] is True
            assert len(result["matches"]) == 0

    def test_search_skips_hidden_dirs(self, tmp_path):
        ws = tmp_path / "workspace"
        ws.mkdir()
        (ws / ".git").mkdir()
        (ws / ".git" / "config").write_text("secret stuff")
        (ws / "visible.py").write_text("secret stuff")

        tool = SearchFilesTool("test-proj")

        with patch("app.tools.file_tools._resolve_workspace", return_value=ws):
            import asyncio
            result = asyncio.run(tool.execute({"pattern": "secret", "path": "."}))
            assert result["success"] is True
            # Should only find visible.py, not .git/config
            files = {m["file"] for m in result["matches"]}
            assert ".git/config" not in files
            assert "visible.py" in files
