"""Tool registry — maps tool names to tool instances for a given project."""

from typing import Dict

from app.tools.base import Tool
from app.tools.file_tools import ReadFileTool, WriteFileTool, ListFilesTool, SearchFilesTool, DeleteFileTool
from app.tools.shell_tools import GrepTool, FindTool, RenameFileTool, MakeDirTool, SedTool, ShellTool
from app.tools.execution_tools import RunPythonTool, RunBashTool, RunTestsTool
from app.tools.github_tools import (
    CreateBranchTool,
    CommitChangesTool,
    CreatePRTool,
    ListPRsTool,
    MergePRTool,
)
from app.tools.devops_tools import (
    GetCPUUsageTool,
    GetMemoryUsageTool,
    GetDiskUsageTool,
    ListContainersTool,
    ContainerLogsTool,
    RestartContainerTool,
)
from app.tools.ticket_tools import (
    CreateTicketTool,
    ListTicketsTool,
    UpdateTicketTool,
    CloseTicketTool,
)


def build_tool_registry(
    project_id: str | None,
    github_token: str = "",
) -> Dict[str, Tool]:
    """Build the full tool registry for a project.

    File/execution tools are scoped to project_id.
    GitHub tools use the user's encrypted token.
    DevOps tools are global (no project needed).
    """
    tools: Dict[str, Tool] = {}

    # File + shell tools only available when a project workspace exists
    if project_id:
        for cls in [ReadFileTool, WriteFileTool, DeleteFileTool, ListFilesTool, SearchFilesTool]:
            instance = cls(project_id)
            tools[instance.name] = instance

    if project_id:
        for cls in [GrepTool, FindTool, RenameFileTool, MakeDirTool, SedTool, ShellTool]:
            instance = cls(project_id)
        tools[instance.name] = instance

    # Execution tools (per-project sandbox)
    for cls in [RunPythonTool, RunBashTool, RunTestsTool]:
        instance = cls(project_id)
        tools[instance.name] = instance

    # GitHub tools (require token)
    if github_token:
        for cls in [CreateBranchTool, CommitChangesTool, CreatePRTool, ListPRsTool, MergePRTool]:
            instance = cls(github_token)
            tools[instance.name] = instance

    # DevOps tools (global, always available)
    for cls in [
        GetCPUUsageTool,
        GetMemoryUsageTool,
        GetDiskUsageTool,
        ListContainersTool,
        ContainerLogsTool,
        RestartContainerTool,
    ]:
        instance = cls()
        tools[instance.name] = instance

    # Ticket tools
    for cls in [CreateTicketTool, ListTicketsTool, UpdateTicketTool, CloseTicketTool]:
        instance = cls()
        tools[instance.name] = instance

    return tools
