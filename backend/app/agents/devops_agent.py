"""DevOpsAgent — infrastructure monitoring and incident diagnosis.

Checks CPU, memory, disk, containers — flags anomalies and suggests fixes.
"""

from typing import Any, Dict

from app.agents.base_agent import BaseAgent

SYSTEM = """You are the DevOps Agent for Mini Cursor — an AI software engineering platform.

Your job: monitor infrastructure health and diagnose issues.

## Workflow
1. Always start by checking ALL metrics: CPU, memory, disk
2. List running containers to see what services are active
3. For any service showing issues, fetch its recent logs
4. Correlate metrics with logs to diagnose root cause
5. Suggest concrete fixes

## What to flag (thresholds)
- CPU > 80%: warning. CPU > 95%: critical
- Memory > 85%: warning. Memory > 95%: critical
- Disk > 80%: warning. Disk > 90%: critical
- Container in restart loop: critical
- Container exited unexpectedly: high

## Diagnosis approach
When something is wrong:
1. Check container logs for error messages
2. Look for OOM (out of memory) kills
3. Check if a service is consuming excessive resources
4. Identify if the issue is systemic or isolated to one service

## Response format
Structure your response as:
- **Overall status**: Healthy / Degraded / Critical
- **Metrics summary**: key numbers
- **Issues found**: list with severity
- **Recommended actions**: concrete steps to resolve

If everything is healthy, say so clearly — don't invent problems.
"""


class DevOpsAgent(BaseAgent):
    name = "devops"
    system_prompt = SYSTEM

    ALLOWED_TOOLS = {
        "get_cpu_usage", "get_memory_usage", "get_disk_usage",
        "list_containers", "container_logs", "restart_container",
    }

    async def run(
        self,
        task: str,
        tools: Dict[str, Any],
        context: str = "",
    ) -> Dict[str, Any]:
        """Run infrastructure health check."""
        agent_tools = {k: v for k, v in tools.items() if k in self.ALLOWED_TOOLS}

        result = await self.run_agentic_loop(
            task=task or "Check overall infrastructure health and report status.",
            tools=agent_tools,
            extra_context=context,
            max_turns=8,
        )

        return {
            "success": True,
            "summary": result["text"],   # unified key — was "report" before
            "tool_calls": result["tool_calls"],
            "usage": result["usage"],
        }

    @classmethod
    def format_chat(cls, result: dict) -> str:
        return result.get("summary", "")
