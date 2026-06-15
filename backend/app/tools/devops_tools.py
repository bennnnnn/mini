"""DevOps and ticket tools.

DevOps: VPS monitoring via Docker stats.
Tickets: internal task tracking (separate from GitHub issues).
"""

import asyncio
from typing import Any, Dict

import docker
from docker.errors import DockerException

from app.tools.base import Tool


def _docker_client():
    try:
        return docker.from_env()
    except DockerException:
        return None


# ── DevOps Tools ───────────────────────────────────────────────────────

class GetCPUUsageTool(Tool):
    name = "get_cpu_usage"
    description = "Get CPU usage percentage for all running containers."
    input_schema = {"type": "object", "properties": {}}

    async def execute(self, input: Dict[str, Any]) -> Dict[str, Any]:
        client = _docker_client()
        if not client:
            return {"success": False, "error": "Docker unavailable"}

        results = []
        for c in client.containers.list():
            stats = c.stats(stream=False)
            cpu_delta = stats["cpu_stats"]["cpu_usage"]["total_usage"] - stats["precpu_stats"]["cpu_usage"]["total_usage"]
            system_delta = stats["cpu_stats"]["system_cpu_usage"] - stats["precpu_stats"]["system_cpu_usage"]
            cpu_pct = (cpu_delta / system_delta) * 100 if system_delta > 0 else 0
            results.append({"container": c.name, "cpu_percent": round(cpu_pct, 2)})

        return {"success": True, "containers": results}


class GetMemoryUsageTool(Tool):
    name = "get_memory_usage"
    description = "Get memory usage for all running containers."
    input_schema = {"type": "object", "properties": {}}

    async def execute(self, input: Dict[str, Any]) -> Dict[str, Any]:
        client = _docker_client()
        if not client:
            return {"success": False, "error": "Docker unavailable"}

        results = []
        for c in client.containers.list():
            stats = c.stats(stream=False)
            mem_usage = stats["memory_stats"].get("usage", 0)
            mem_limit = stats["memory_stats"].get("limit", 1)
            mem_pct = (mem_usage / mem_limit) * 100 if mem_limit > 0 else 0
            results.append({
                "container": c.name,
                "memory_mb": round(mem_usage / 1024 / 1024, 2),
                "memory_percent": round(mem_pct, 2),
            })

        return {"success": True, "containers": results}


class GetDiskUsageTool(Tool):
    name = "get_disk_usage"
    description = "Get disk usage for the VPS."
    input_schema = {"type": "object", "properties": {}}

    async def execute(self, input: Dict[str, Any]) -> Dict[str, Any]:
        import shutil
        usage = shutil.disk_usage("/")
        return {
            "success": True,
            "total_gb": round(usage.total / 1024**3, 2),
            "used_gb": round(usage.used / 1024**3, 2),
            "free_gb": round(usage.free / 1024**3, 2),
            "percent": round((usage.used / usage.total) * 100, 2),
        }


class ListContainersTool(Tool):
    name = "list_containers"
    description = "List all Docker containers and their status."
    input_schema = {"type": "object", "properties": {}}

    async def execute(self, input: Dict[str, Any]) -> Dict[str, Any]:
        client = _docker_client()
        if not client:
            return {"success": False, "error": "Docker unavailable"}

        results = []
        for c in client.containers.list(all=True):
            results.append({
                "name": c.name,
                "status": c.status,
                "image": c.image.tags[0] if c.image.tags else "unknown",
                "created": c.attrs.get("Created", ""),
            })

        return {"success": True, "containers": results}


class ContainerLogsTool(Tool):
    name = "container_logs"
    description = "Get logs from a specific container."
    input_schema = {
        "type": "object",
        "properties": {
            "container": {"type": "string", "description": "Container name"},
            "tail": {"type": "integer", "description": "Number of lines to fetch", "default": 100},
        },
        "required": ["container"],
    }

    async def execute(self, input: Dict[str, Any]) -> Dict[str, Any]:
        client = _docker_client()
        if not client:
            return {"success": False, "error": "Docker unavailable"}

        try:
            c = client.containers.get(input["container"])
            logs = c.logs(tail=input.get("tail", 100)).decode("utf-8", errors="replace")
            return {"success": True, "container": input["container"], "logs": logs}
        except Exception as e:
            return {"success": False, "error": str(e)}


class RestartContainerTool(Tool):
    name = "restart_container"
    description = "Restart a Docker container."
    input_schema = {
        "type": "object",
        "properties": {
            "container": {"type": "string", "description": "Container name"},
        },
        "required": ["container"],
    }

    async def execute(self, input: Dict[str, Any]) -> Dict[str, Any]:
        client = _docker_client()
        if not client:
            return {"success": False, "error": "Docker unavailable"}

        try:
            c = client.containers.get(input["container"])
            c.restart()
            return {"success": True, "container": input["container"], "status": "restarted"}
        except Exception as e:
            return {"success": False, "error": str(e)}
