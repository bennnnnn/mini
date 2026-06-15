"""Deterministic agent execution state machine.

This is the core of Mini Cursor — the Coordinator iterates through
this state machine, executing steps, verifying results, and
retrying on failure. No free-form agent chaos.
"""

import time
from dataclasses import dataclass, field
from enum import Enum
from typing import Any, Dict, List, Literal, Optional

from app.core.config import settings


class ExecutionStatus(str, Enum):
    PLANNING = "planning"
    EXECUTING = "executing"
    VERIFYING = "verifying"
    FAILED = "failed"
    DONE = "done"


@dataclass
class PlanStep:
    """A single step in an execution plan."""

    action: str  # e.g. "create_files", "write_models", "run_tests"
    description: str
    agent: str  # planner | coding | testing | review
    params: Dict[str, Any] = field(default_factory=dict)


@dataclass
class ExecutionState:
    """Mutable state tracked throughout an agent run."""

    task_id: str
    status: ExecutionStatus = ExecutionStatus.PLANNING
    current_step: int = 0
    max_steps: int = settings.AGENT_MAX_STEPS
    retry_count: int = 0
    step_retries: int = 0
    total_agent_retries: int = 0

    # Execution plan
    plan: List[PlanStep] = field(default_factory=list)

    # Artifacts produced during execution
    artifacts: Dict[str, Any] = field(default_factory=dict)

    # Timing
    started_at: float = field(default_factory=time.monotonic)
    last_step_at: float = field(default_factory=time.monotonic)

    # Errors
    last_error: Optional[str] = None

    @property
    def elapsed_seconds(self) -> float:
        return time.monotonic() - self.started_at

    @property
    def is_timed_out(self) -> bool:
        return self.elapsed_seconds > settings.AGENT_MAX_RUNTIME_SECONDS

    @property
    def current_plan_step(self) -> Optional[PlanStep]:
        if 0 <= self.current_step < len(self.plan):
            return self.plan[self.current_step]
        return None

    @property
    def is_complete(self) -> bool:
        return self.current_step >= len(self.plan)

    def advance(self) -> None:
        """Move to the next step, reset step-level retries."""
        self.current_step += 1
        self.step_retries = 0
        self.last_step_at = time.monotonic()

    def record_retry(self, error: str) -> None:
        """Record a retry at the current step."""
        self.step_retries += 1
        self.total_agent_retries += 1
        self.last_error = error

    def should_retry_step(self) -> bool:
        """Check if we can retry the current step."""
        return self.step_retries < settings.AGENT_MAX_RETRIES_PER_STEP

    def should_continue(self) -> bool:
        """Global continue check — all stop conditions."""
        if self.is_timed_out:
            self.status = ExecutionStatus.FAILED
            self.last_error = f"Timed out after {self.elapsed_seconds:.0f}s"
            return False

        if self.total_agent_retries >= settings.AGENT_MAX_AGENT_RETRIES:
            self.status = ExecutionStatus.FAILED
            self.last_error = f"Exceeded max agent retries ({settings.AGENT_MAX_AGENT_RETRIES})"
            return False

        if self.current_step >= settings.AGENT_MAX_STEPS:
            self.status = ExecutionStatus.FAILED
            self.last_error = f"Exceeded max steps ({settings.AGENT_MAX_STEPS})"
            return False

        return True


class AgentLoop:
    """The main execution loop — drives the state machine.

    Two modes:
    - `run()` — blocking, returns final state (used by sync /agent/run)
    - `run_stream()` — async generator yielding events (used by SSE endpoint)

    Usage:
        state = ExecutionState(task_id="abc")
        loop = AgentLoop(state, coordinator, tools)
        result = await loop.run(user_request)
    """

    def __init__(self, state: ExecutionState, coordinator, tools: Dict[str, Any]):
        self.state = state
        self.coordinator = coordinator
        self.tools = tools
        self._on_tool_call = None
        self._on_tool_result = None

    # ── Blocking run ────────────────────────────────────────────────────────────

    async def run(self, user_request: str) -> ExecutionState:
        """Execute the full agent loop synchronously (blocks until done)."""
        async for _ in self.run_stream(user_request):
            pass
        return self.state

    # ── Streaming run ───────────────────────────────────────────────────────────

    async def run_stream(
        self,
        user_request: str,
        context: str = "",
        prior_messages=None,
        github_repo: str | None = None,
        project_name: str | None = None,
        active_file: str | None = None,
    ):
        """Execute the full agent loop, yielding events as they happen.

        Yields dicts with keys like:
          {"event": "plan", "plan": [...]}
          {"event": "step_start", "step": ...}
          {"event": "step_done", "step": ..., "result": ...}
          {"event": "step_retry", "step": ..., "error": ...}
          {"event": "verify", "verified": bool}
          {"event": "done", "state": ...}
          {"event": "error", "message": ...}
        """
        # Phase 1: Planning
        self.state.status = ExecutionStatus.PLANNING
        plan = await self.coordinator.plan(
            user_request,
            self.tools,
            github_repo=github_repo,
            project_name=project_name,
            active_file=active_file,
            on_tool_call=self._on_tool_call,
            prior_messages=prior_messages,
        )
        self.state.plan = plan

        if plan is None:
            reply = getattr(self.coordinator, "_chat_reply", None)
            yield {"event": "chat", "reply": reply or "How can I help?"}
            return

        self.state.status = ExecutionStatus.EXECUTING
        yield {"event": "plan", "plan": [{
            "action": s.action,
            "description": s.description,
            "agent": s.agent,
        } for s in plan]}

        # Phase 2: Execute steps
        while self.state.status == ExecutionStatus.EXECUTING:
            if not self.state.should_continue():
                yield {"event": "error", "message": self.state.last_error or "Unknown error"}
                return

            step = self.state.current_plan_step
            if step is None:
                break

            result = await self._execute_step(step, context)

            if result.get("success"):
                self.state.advance()
                # Collect artifacts
                if "files_written" in result:
                    self.state.artifacts.setdefault("files", []).extend(result["files_written"])
                if "test_output" in result:
                    self.state.artifacts["test_results"] = result
                if "verdict" in result:
                    self.state.artifacts["review"] = result

                yield {
                    "event": "step_done",
                    "step": step.action,
                    "agent": step.agent,
                    "result": result,
                    "progress": f"{self.state.current_step}/{len(self.state.plan)}",
                }
            else:
                error = result.get("error", "Unknown error")
                if self.state.should_retry_step():
                    self.state.record_retry(error)
                    yield {
                        "event": "step_retry",
                        "step": step.action,
                        "agent": step.agent,
                        "error": error,
                        "retry": self.state.step_retries,
                    }
                    await self._repair_step(step, error)
                else:
                    self.state.status = ExecutionStatus.FAILED
                    self.state.last_error = (
                        f"Step '{step.action}' failed after "
                        f"{self.state.step_retries} retries: {error}"
                    )
                    yield {"event": "error", "message": self.state.last_error}
                    return

            if self.state.is_complete:
                self.state.status = ExecutionStatus.VERIFYING
                break

        # Phase 3: Verify
        if self.state.status == ExecutionStatus.VERIFYING:
            verified = await self.coordinator.verify(self.state.artifacts)
            yield {"event": "verify", "verified": verified}
            if verified:
                self.state.status = ExecutionStatus.DONE
            else:
                self.state.status = ExecutionStatus.FAILED
                self.state.last_error = "Verification failed"

        yield {
            "event": "done",
            "status": self.state.status.value,
            "steps_completed": self.state.current_step,
            "artifacts": self.state.artifacts,
        }

    async def _execute_step(self, step: PlanStep, context: str = "") -> Dict[str, Any]:
        """Execute a single plan step via the coordinator."""
        try:
            return await self.coordinator.execute_step(
                step,
                self.tools,
                context=context,
                on_tool_call=self._on_tool_call,
                on_tool_result=self._on_tool_result,
            )
        except Exception as e:
            return {"success": False, "error": str(e)}

    async def _repair_step(self, step: PlanStep, error: str) -> None:
        """Attempt to repair after a failed step."""
        await self.coordinator.repair(step, error)
