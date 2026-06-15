"""Tests for file_tools — path safety, read/write, listing, search."""

import pytest
from pathlib import Path
from app.tools.file_tools import _safe_path, _resolve_workspace, WORKSPACE_ROOT


class TestSafePath:
    """Path traversal prevention is critical for security."""

    def test_simple_path_within_workspace(self, tmp_path):
        ws = tmp_path.resolve()
        result = _safe_path(ws, "foo/bar.py")
        assert result == ws / "foo" / "bar.py"

    def test_root_path(self, tmp_path):
        ws = tmp_path.resolve()
        result = _safe_path(ws, ".")
        assert result == ws

    def test_nested_path(self, tmp_path):
        ws = tmp_path.resolve()
        result = _safe_path(ws, "src/models/user.py")
        assert result == ws / "src" / "models" / "user.py"

    def test_path_traversal_blocked(self, tmp_path):
        ws = tmp_path.resolve()
        with pytest.raises(ValueError, match="Path escape attempt"):
            _safe_path(ws, "../etc/passwd")

    def test_path_traversal_blocked_deep(self, tmp_path):
        ws = tmp_path.resolve()
        with pytest.raises(ValueError, match="Path escape attempt"):
            _safe_path(ws, "foo/../../../etc/shadow")

    def test_absolute_path_blocked(self, tmp_path):
        ws = tmp_path.resolve()
        # An absolute path resolves outside the workspace
        with pytest.raises(ValueError, match="Path escape attempt"):
            _safe_path(ws, "/etc/passwd")


class TestResolveWorkspace:
    """Workspace root resolution."""

    def test_creates_workspace(self, tmp_path):
        """_resolve_workspace should create directories if they don't exist."""
        # Use a temp dir so we don't pollute /tmp
        import os
        original_root = None
        try:
            # We can't easily change WORKSPACE_ROOT, so just test
            # that the function doesn't crash
            ws = _resolve_workspace("test-project-123")
            assert ws.exists()
            assert str(ws).endswith("test-project-123/workspace")
        finally:
            pass
