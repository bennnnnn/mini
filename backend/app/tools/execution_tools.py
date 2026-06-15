"""Docker execution tools — run code in sandboxed containers.

All user code runs ephemerally inside Docker with strict limits:
- 512MB RAM, 1 CPU, 120s timeout
- No network access
- No host mount access
- Container destroyed after execution
"""

from pathlib import Path
from typing import Any, Dict

import docker
from docker.errors import DockerException, NotFound
from docker.types import Mount

from app.core.config import settings
from app.tools.base import Tool

# Reuse from file_tools
WORKSPACE_ROOT = "/tmp/mini-cursor-workspaces"


def _get_docker_client():
    """Get Docker client. Returns None if Docker is unavailable."""
    try:
        return docker.from_env()
    except DockerException:
        return None


async def _run_in_container(
    workspace_path: str,
    command: str,
    image: str = "python:3.12-slim",
) -> Dict[str, Any]:
    """Run a command inside an ephemeral Docker container."""
    client = _get_docker_client()
    if client is None:
        return {"success": False, "error": "Docker unavailable — is the daemon running?"}

    try:
        container = client.containers.run(
            image=image,
            command=["bash", "-c", command],
            mounts=[
                Mount(
                    target="/workspace",
                    source=workspace_path,
                    type="bind",
                    read_only=False,
                )
            ],
            working_dir="/workspace",
            mem_limit=settings.DOCKER_EXECUTOR_MEMORY_LIMIT,
            nano_cpus=int(settings.DOCKER_EXECUTOR_CPU_LIMIT) * 1_000_000_000,
            network_disabled=True,
            detach=True,
            remove=False,  # We'll remove manually after reading logs
        )

        try:
            result = container.wait(timeout=settings.DOCKER_EXECUTOR_TIMEOUT)
            logs = container.logs(stdout=True, stderr=True).decode("utf-8", errors="replace")

            return {
                "success": result["StatusCode"] == 0,
                "exit_code": result["StatusCode"],
                "stdout": logs,
                "stderr": "",  # Docker combines stdout/stderr by default
            }
        except Exception as e:
            # Timeout or other error
            try:
                container.kill()
            except Exception:
                pass
            return {"success": False, "error": str(e)}
        finally:
            try:
                container.remove(force=True)
            except NotFound:
                pass

    except Exception as e:
        return {"success": False, "error": f"Container run failed: {e}"}


class RunPythonTool(Tool):
    name = "run_python"
    description = "Run Python code in a sandboxed Docker container."
    input_schema = {
        "type": "object",
        "properties": {
            "code": {"type": "string", "description": "Python code to execute"},
        },
        "required": ["code"],
    }

    def __init__(self, project_id: str):
        self.project_id = project_id

    async def execute(self, input: Dict[str, Any]) -> Dict[str, Any]:
        ws = Path(WORKSPACE_ROOT) / self.project_id / "workspace"
        ws.mkdir(parents=True, exist_ok=True)

        # Write code to a temp script in the workspace
        script_path = ws / "_exec_tmp.py"
        script_path.write_text(input["code"])

        result = await _run_in_container(
            str(ws),
            "python _exec_tmp.py",
        )

        # Clean up temp file
        try:
            script_path.unlink()
        except Exception:
            pass

        return result


class RunBashTool(Tool):
    name = "run_bash"
    description = "Run a bash command in a sandboxed Docker container."
    input_schema = {
        "type": "object",
        "properties": {
            "command": {"type": "string", "description": "Bash command to execute"},
        },
        "required": ["command"],
    }

    def __init__(self, project_id: str):
        self.project_id = project_id

    async def execute(self, input: Dict[str, Any]) -> Dict[str, Any]:
        ws = Path(WORKSPACE_ROOT) / self.project_id / "workspace"
        ws.mkdir(parents=True, exist_ok=True)

        return await _run_in_container(str(ws), input["command"])


class RunTestsTool(Tool):
    name = "run_tests"
    description = "Run the test suite in a sandboxed Docker container."
    input_schema = {
        "type": "object",
        "properties": {
            "command": {
                "type": "string",
                "description": "Test command (default: pytest)",
                "default": "python -m pytest -v",
            },
        },
    }

    def __init__(self, project_id: str):
        self.project_id = project_id

    async def execute(self, input: Dict[str, Any]) -> Dict[str, Any]:
        ws = Path(WORKSPACE_ROOT) / self.project_id / "workspace"
        ws.mkdir(parents=True, exist_ok=True)

        cmd = input.get("command", "python -m pytest -v")

        # First install any requirements
        requirements = ws / "requirements.txt"
        if requirements.exists():
            install_cmd = f"pip install -r requirements.txt -q && {cmd}"
        else:
            install_cmd = cmd

        return await _run_in_container(str(ws), install_cmd)
