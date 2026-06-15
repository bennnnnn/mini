"""Agent routes — run, stream, logs.

POST /agent/run      — synchronous execution (blocks until done)
POST /agent/stream   — SSE streaming (tokens, tool calls, status)
GET  /agent/logs/{id} — retrieve session logs
"""

import asyncio
import json
import uuid
from collections import deque
from typing import AsyncGenerator, Deque

from fastapi import APIRouter, Depends, HTTPException
from pydantic import BaseModel
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession
from sse_starlette.sse import EventSourceResponse

from app.agents import ExecutionState, AgentLoop, CoordinatorAgent, LLMProvider, ExecutionStatus
from app.core.config import settings
from app.core.database import get_db
from app.core.security import decrypt_token, get_optional_user
from app.models.models import Session, Message, AgentAction, Project, GitHubRepo
from app.tools.registry import build_tool_registry

router = APIRouter()

# ── Cancellation registry ──────────────────────────────────────────────────────
_cancel_flags: dict[str, asyncio.Event] = {}

# ── Confirmation registry ──────────────────────────────────────────────────────
# Maps confirm_id → asyncio.Future[bool]. The SSE generator awaits the future;
# POST /agent/confirm resolves it when the user approves or rejects.
_confirm_futures: dict[str, "asyncio.Future[bool]"] = {}


async def _generate_session_title(user_message: str, llm) -> str:
    """Generate a short topic label for a chat session based on what the user said."""
    try:
        response = await llm.call(
            messages=[{"role": "user", "content": user_message}],
            system=(
                "Generate a 2-4 word TOPIC LABEL for this conversation based on what the user said. "
                "The label describes the SUBJECT, not the greeting or reply. "
                "Examples:\n"
                "  'hi' → 'Greeting'\n"
                "  'how is your day?' → 'Casual chat'\n"
                "  'create a python hello world' → 'Python hello world'\n"
                "  'review africana code' → 'Africana code review'\n"
                "  'fix the login bug' → 'Fix login bug'\n"
                "  'what is recursion?' → 'Recursion explained'\n"
                "Return ONLY the label — no quotes, no punctuation, nothing else."
            ),
            max_tokens=15,
        )
        title = llm.get_text_content(response).strip().strip('"\'').strip()
        return title[:60] if title else "New chat"
    except Exception:
        return "New chat"


def _format_confirm_message(tool_name: str, tool_input: dict) -> str:
    if tool_name == "delete_file":
        return f"Delete `{tool_input.get('path', 'this file')}`? This cannot be undone."
    if tool_name == "shell":
        cmd = tool_input.get("command", "")
        return f"Run shell command?\n\n`{cmd}`"
    return f"Allow `{tool_name}`?"


_AGENT_START = {
    "coding":  "Writing code...",
    "testing": "Running tests...",
    "review":  "Reading and analyzing files...",
    "git":     "Committing and creating PR...",
    "devops":  "Checking infrastructure...",
    "planner": "Thinking...",
}

def _agent_start_message(agent: str) -> str:
    return _AGENT_START.get(agent.lower(), "Working...")


def _format_action(tool_name: str, tool_input: dict) -> str:
    """Convert a raw tool call into a human-readable live status string."""
    p = tool_input.get("path", tool_input.get("pattern", ""))
    match tool_name:
        case "read_file":
            return f"Reading {p}"
        case "write_file":
            return f"Writing {p}"
        case "delete_file":
            return f"Deleting {p}"
        case "grep":
            pat = tool_input.get("pattern", "")
            return f"Searching for '{pat}'"
        case "find":
            return f"Finding {tool_input.get('pattern', 'files')}"
        case "rename_file":
            return f"Renaming {tool_input.get('from_path', '')} → {tool_input.get('to_path', '')}"
        case "make_dir":
            return f"Creating directory {tool_input.get('path', '')}"
        case "sed_replace":
            return f"Replacing in {tool_input.get('path', '')}"
        case "shell":
            cmd = str(tool_input.get("command", ""))[:60]
            return f"$ {cmd}"
        case "list_files":
            return f"Listing {p or 'workspace'}"
        case "search_files":
            return f"Searching for '{p}'"
        case "run_tests":
            cmd = tool_input.get("command", "pytest")
            return f"Running tests: {cmd}"
        case "run_python":
            return "Running Python code"
        case "run_bash":
            cmd = str(tool_input.get("command", ""))[:60]
            return f"Running: {cmd}"
        case "create_branch":
            return f"Creating branch: {tool_input.get('branch', '')}"
        case "commit_changes":
            return f"Committing: {tool_input.get('message', 'changes')}"
        case "create_pr":
            return f"Creating PR: {tool_input.get('title', '')}"
        case "get_cpu_usage":
            return "Checking CPU usage"
        case "get_memory_usage":
            return "Checking memory"
        case "get_disk_usage":
            return "Checking disk"
        case "list_containers":
            return "Listing containers"
        case "container_logs":
            return f"Reading logs: {tool_input.get('container_name', '')}"
        case _:
            return f"{tool_name.replace('_', ' ').title()}"




class ConversationMessage(BaseModel):
    role: str   # "user" | "assistant"
    content: str


class AgentRunRequest(BaseModel):
    project_id: str | None = None  # optional — chat can exist without a project
    prompt: str
    active_file: str | None = None
    history: list[ConversationMessage] = []
    session_id: str | None = None   # reuse an existing chat session
    stream: bool = False


class AgentRunResponse(BaseModel):
    task_id: str
    session_id: str
    status: str
    steps_completed: int
    artifacts: dict = {}


# ── In-memory session store (V1 — move to DB in V2) ───────────────────

_active_sessions: dict[str, ExecutionState] = {}


# ── POST /agent/run ────────────────────────────────────────────────────

@router.post("/run", response_model=AgentRunResponse)
async def run_agent(req: AgentRunRequest, db: AsyncSession = Depends(get_db)):
    """Execute an agent run synchronously."""
    task_id = str(uuid.uuid4())

    # Create DB session
    session = Session(project_id=req.project_id)
    db.add(session)
    await db.flush()

    # Build tool registry for this project
    tools = build_tool_registry(req.project_id)

    # Initialize agent system
    llm = LLMProvider()
    coordinator = CoordinatorAgent(llm)
    state = ExecutionState(task_id=task_id)
    loop = AgentLoop(state, coordinator, tools)

    # Store user message
    db.add(Message(
        session_id=session.id,
        role="user",
        content=req.prompt,
    ))

    # Run
    final_state = await loop.run(req.prompt)

    # Store assistant response
    db.add(Message(
        session_id=session.id,
        role="assistant",
        content=json.dumps({
            "status": final_state.status.value,
            "steps": final_state.current_step,
            "artifacts": final_state.artifacts,
        }),
    ))

    return AgentRunResponse(
        task_id=task_id,
        session_id=session.id,
        status=final_state.status.value,
        steps_completed=final_state.current_step,
        artifacts=final_state.artifacts,
    )


# ── POST /agent/stream ─────────────────────────────────────────────────

@router.post("/stream")
async def stream_agent(
    req: AgentRunRequest,
    db: AsyncSession = Depends(get_db),
    current_user: dict | None = Depends(get_optional_user),
):
    """Execute an agent run with SSE streaming."""

    async def event_generator() -> AsyncGenerator[dict, None]:
        task_id = str(uuid.uuid4())
        try:
            async for event in _run_agent(task_id, req, db):
                yield event
        finally:
            # Always clean up cancellation state so the set doesn't grow unbounded
            _cancelled_tasks.discard(task_id)
            _cancel_flags.pop(task_id, None)
            _active_sessions.pop(task_id, None)

    async def _run_agent(task_id: str, req: AgentRunRequest, db) -> AsyncGenerator[dict, None]:
        # ── Load project metadata (optional — chat works without a project) ──
        from sqlalchemy import select as sa_select
        user_id = current_user.get("user_id") if current_user else "default"
        project = None
        if req.project_id:
            proj_result = await db.execute(sa_select(Project).where(Project.id == req.project_id))
            project = proj_result.scalar_one_or_none()
        github_repo = project.github_repo if project else None
        project_name = project.name if project else None
        project_description = project.description if project else None

        # GitHub token for coding on a connected repo
        gh_token = ""
        if github_repo:
            gh_result = await db.execute(sa_select(GitHubRepo).where(GitHubRepo.user_id == user_id))
            gh_record = gh_result.scalar_one_or_none()
            if gh_record:
                try:
                    gh_token = decrypt_token(gh_record.access_token_encrypted)
                except Exception:
                    pass

        # ── Load user context ──────────────────────────────────────────────
        from app.models.models import UserContext
        ctx_q = sa_select(UserContext).where(
            UserContext.user_id == user_id,
            UserContext.scope == "global"
        )
        if req.project_id:
            from sqlalchemy import or_
            ctx_q = sa_select(UserContext).where(
                UserContext.user_id == user_id,
                or_(
                    UserContext.scope == "global",
                    (UserContext.scope == "project") & (UserContext.project_id == req.project_id)
                )
            )
        ctx_result = await db.execute(ctx_q)
        user_context = [{"key": c.key, "value": c.value, "scope": c.scope} for c in ctx_result.scalars().all()]

        # ── Create or reuse session ────────────────────────────────────────
        session = None
        if req.session_id:
            session_result = await db.execute(sa_select(Session).where(Session.id == req.session_id))
            session = session_result.scalar_one_or_none()
        if not session:
            # Sessions can exist without a project (chat-first model)
            session = Session(project_id=req.project_id)
            db.add(session)
            await db.flush()
        db.add(Message(session_id=session.id, role="user", content=req.prompt))

        # ── Build tools — file/shell tools only available with a project ───
        tools = build_tool_registry(req.project_id or None, github_token=gh_token)
        llm = LLMProvider()
        coordinator = CoordinatorAgent(llm)
        state = ExecutionState(task_id=task_id)

        # Immediate heartbeat so the user sees something straight away.
        # Send session_id immediately so the frontend pins to this session
        # for all subsequent messages in this chat
        yield {"event": "status", "data": json.dumps({
            "status": "planning", "task_id": task_id, "session_id": session.id,
        })}
        yield {"event": "action", "data": json.dumps({"message": "Thinking..."})}

        # ── Unified event buffer ───────────────────────────────────────────
        ev_buf: Deque[dict] = deque()

        def on_tool_call(tool_name: str, tool_input: dict) -> None:
            ev_buf.append({"event": "action", "data": json.dumps({
                "message": _format_action(tool_name, tool_input)
            })})

        def on_token(chunk: str) -> None:
            """Called for each streaming token chunk from a chat reply."""
            ev_buf.append({"event": "token_chunk", "data": json.dumps({"chunk": chunk})})

        def on_tool_result(tool_name: str, tool_input: dict, raw_output: str) -> None:
            try:
                out = json.loads(raw_output)
            except Exception:
                out = {}

            if tool_name == "write_file" and out.get("success"):
                ev_buf.append({"event": "file_update", "data": json.dumps({
                    "path": tool_input.get("path", ""),
                    "content": tool_input.get("content", ""),
                })})

            elif tool_name == "delete_file" and out.get("success"):
                ev_buf.append({"event": "file_delete", "data": json.dumps({
                    "path": tool_input.get("path", ""),
                })})

            elif tool_name in ("run_bash", "run_python", "run_tests"):
                cmd = (tool_input.get("command") or tool_input.get("code", ""))[:200]
                ev_buf.append({"event": "terminal", "data": json.dumps({
                    "command": cmd,
                    "output": out.get("stdout", ""),
                    "error": out.get("stderr", ""),
                    "success": out.get("success", False),
                    "exit_code": out.get("exit_code"),
                })})

        # ── Confirmation helper ──────────────────────────────────────────────────
        # Called from within the agent when it tries to run a destructive tool.
        # Emits a 'confirm' SSE event, then blocks until the user responds via
        # POST /agent/confirm/{confirm_id}.

        async def request_confirm(tool_name: str, agent_name: str, tool_input: dict) -> bool:
            confirm_id = str(uuid.uuid4())
            loop = asyncio.get_event_loop()
            future: asyncio.Future[bool] = loop.create_future()
            _confirm_futures[confirm_id] = future

            # Emit the confirmation request immediately
            ev_buf.append({"event": "confirm", "data": json.dumps({
                "confirm_id": confirm_id,
                "tool": tool_name,
                "agent": agent_name,
                "input": tool_input,
                "message": _format_confirm_message(tool_name, tool_input),
            })})

            try:
                # Wait up to 60s for user response
                approved = await asyncio.wait_for(future, timeout=60.0)
                return approved
            except asyncio.TimeoutError:
                return False  # Auto-reject on timeout
            finally:
                _confirm_futures.pop(confirm_id, None)

        async def run_with_actions(coro):
            """Run the agent coroutine as a background task, streaming
            ev_buf events every 50ms so the user sees live progress.

            asyncio.create_task works here because sse_starlette runs
            the generator in a normal asyncio context (not anyio).
            """
            task = asyncio.create_task(coro)
            try:
                while not task.done():
                    await asyncio.sleep(0.05)   # yield to event loop
                    while ev_buf:
                        yield ev_buf.popleft()  # stream buffered events live

                # Drain any events that arrived in the final tick
                while ev_buf:
                    yield ev_buf.popleft()

                # Re-raise any exception from the agent
                exc = task.exception()
                if exc:
                    yield {"event": "error", "data": json.dumps({"error": str(exc)})}
                    return

                yield task.result()

            except Exception as e:
                if not task.done():
                    task.cancel()
                yield {"event": "error", "data": json.dumps({"error": str(e)})}

        # ── Phase 1: Planning ──────────────────────────────────────────────
        result_holder = []
        prior_messages = [{"role": m.role, "content": m.content} for m in req.history]

        async for item in run_with_actions(
            coordinator.plan(
                req.prompt, tools,
                github_repo=github_repo,
                project_name=project_name,
                project_description=project_description,
                active_file=req.active_file,
                on_tool_call=on_tool_call,
                prior_messages=prior_messages,
                user_context=user_context,
                on_token=on_token,
            )
        ):
            if isinstance(item, dict) and "event" in item:
                yield item
            else:
                result_holder.append(item)

        try:
            plan = result_holder[0] if result_holder else None
        except Exception as e:
            yield {"event": "error", "data": json.dumps({"error": str(e)})}
            return

        if plan is None:
            # Tokens already streamed chunk-by-chunk via ev_buf (token_chunk events)
            # _chat_reply holds the full assembled text for DB storage
            reply = coordinator._chat_reply or "Hey! How can I help?"
            # Yield a final token_end event so frontend knows streaming is done
            yield {"event": "token_end", "data": ""}
            session_title = session.title
            if not session_title:
                session_title = await _generate_session_title(req.prompt, llm)
                session.title = session_title
                await db.flush()
            db.add(Message(session_id=session.id, role="assistant", content=reply))
            yield {"event": "done", "data": json.dumps({
                "session_id": session.id,
                "session_title": session_title,
            })}
            return

        # Coding task: streamed decision text must be wiped from the chat
        if getattr(coordinator, "_stream_was_coding", False):
            yield {"event": "stream_discard", "data": ""}
        else:
            yield {"event": "token_end", "data": ""}

        state.plan = plan
        state.status = ExecutionStatus.EXECUTING

        yield {
            "event": "status",
            "data": json.dumps({
                "status": "executing",
                "message": f"Plan ready — {len(plan)} step{'s' if len(plan) != 1 else ''}",
                "plan": [{"action": s.action, "description": s.description, "agent": s.agent} for s in plan],
            }),
        }

        exec_context = await coordinator.build_project_context(
            tools, github_repo, project_name,
            project_description=project_description,
            active_file=req.active_file, user_context=user_context
        )

        # ── Phase 2: Execute steps ─────────────────────────────────────────
        while state.status == ExecutionStatus.EXECUTING:
            if is_cancelled(task_id):
                yield {"event": "status", "data": json.dumps({
                    "status": "done",
                    "message": "Cancelled by user",
                    "steps_completed": state.current_step,
                })}
                yield {"event": "done", "data": json.dumps({"task_id": task_id})}
                return

            if not state.should_continue():
                yield {"event": "error", "data": json.dumps({
                    "error": state.last_error, "message": state.last_error
                })}
                return

            step = state.current_plan_step
            if step is None:
                break

            yield {
                "event": "status",
                "data": json.dumps({
                    "status": "executing",
                    "agent": step.agent,
                    "message": _agent_start_message(step.agent),
                }),
            }

            step_result = []
            try:
                async for item in run_with_actions(
                    coordinator.execute_step(
                        step, tools,
                        context=exec_context,
                        user_request=req.prompt,
                        on_tool_call=on_tool_call,
                        on_tool_result=on_tool_result,
                        request_confirm=request_confirm,
                    )
                ):
                    if isinstance(item, dict) and "event" in item:
                        yield item
                    else:
                        step_result.append(item)
                result = step_result[0] if step_result else {"success": False, "error": "No result"}
            except Exception as e:
                result = {"success": False, "error": str(e)}

            if result.get("success"):
                state.advance()
                if "files_written" in result:
                    state.artifacts.setdefault("files", []).extend(result["files_written"])
                if "test_output" in result:
                    state.artifacts["test_results"] = result
                if "verdict" in result:
                    state.artifacts["review"] = result

                # Refresh project context so subsequent agents see newly created files
                exec_context = await coordinator.build_project_context(
                    tools, github_repo, project_name, active_file=req.active_file
                )

                yield {
                    "event": "status",
                    "data": json.dumps({
                        "step": step.action,
                        "status": "completed",
                        "agent": step.agent,
                        "message": f"✓ {step.agent.title()} agent finished",
                        "progress": f"{state.current_step}/{len(state.plan)}",
                        "files": result.get("files_written", []),
                    }),
                }

                chat_msg = coordinator.format_step_result(step.agent, result)
                if chat_msg:
                    yield {"event": "token", "data": chat_msg}
            else:
                error = result.get("error", "Unknown error")
                if state.should_retry_step():
                    state.record_retry(error)
                    yield {
                        "event": "status",
                        "data": json.dumps({
                            "step": step.action,
                            "status": "retrying",
                            "agent": step.agent,
                            "message": f"⚠ Retrying ({state.step_retries}/3): {error[:120]}",
                        }),
                    }
                else:
                    yield {"event": "error", "data": json.dumps({
                        "error": state.last_error or error,
                        "message": state.last_error or error,
                    })}
                    return

            if state.is_complete:
                state.status = ExecutionStatus.VERIFYING
                break

        # Phase 3: Verify
        yield {"event": "token", "data": "Verifying the implementation..."}
        verified = await coordinator.verify(state.artifacts)
        if verified:
            state.status = ExecutionStatus.DONE
        else:
            state.status = ExecutionStatus.FAILED
            state.last_error = "Verification failed"

        yield {
            "event": "status",
            "data": json.dumps({
                "status": state.status.value,
                "message": f"{'✓' if verified else '✕'} {'Task complete' if verified else 'Verification failed'} — {state.current_step} steps finished",
                "steps_completed": state.current_step,
                "artifacts": state.artifacts,
            }),
        }

        db.add(Message(
            session_id=session.id,
            role="assistant",
            content=json.dumps({"status": state.status.value, "steps": state.current_step}),
        ))

        # Generate a smart title and flush to DB before done so the frontend
        # gets the real title and DB is consistent when loadSessions fires
        session_title = session.title
        if not session_title:
            session_title = await _generate_session_title(req.prompt, llm)
            session.title = session_title
            await db.flush()   # write to DB within this transaction

        yield {"event": "done", "data": json.dumps({
            "task_id": task_id,
            "session_id": session.id,
            "session_title": session_title,
        })}

    return EventSourceResponse(event_generator())


# ── GET /agent/logs/{session_id} ───────────────────────────────────────

@router.get("/logs/{session_id}")
async def get_agent_logs(session_id: str, db: AsyncSession = Depends(get_db)):
    """Retrieve all messages and actions for a session."""
    result = await db.execute(
        select(Message).where(Message.session_id == session_id).order_by(Message.timestamp)
    )
    messages = result.scalars().all()

    result = await db.execute(
        select(AgentAction).where(AgentAction.session_id == session_id).order_by(AgentAction.timestamp)
    )
    actions = result.scalars().all()

    return {
        "session_id": session_id,
        "messages": [
            {"role": m.role, "content": m.content, "timestamp": m.timestamp.isoformat() if m.timestamp else ""}
            for m in messages
        ],
        "actions": [
            {
                "agent": a.agent,
                "action": a.action,
                "status": a.status,
                "timestamp": a.timestamp.isoformat() if a.timestamp else "",
            }
            for a in actions
        ],
    }


# ── Cancel + Cost tracking ────────────────────────────────────────────

_cancelled_tasks: set[str] = set()


@router.post("/cancel/{task_id}")
async def cancel_agent(task_id: str):
    """Cancel a running agent task."""
    _cancelled_tasks.add(task_id)
    return {"status": "cancelled", "task_id": task_id}


def is_cancelled(task_id: str) -> bool:
    return task_id in _cancelled_tasks


# ── Confirmation endpoint ─────────────────────────────────────────────────────

class ConfirmRequest(BaseModel):
    approved: bool


@router.post("/confirm/{confirm_id}")
async def confirm_action(confirm_id: str, req: ConfirmRequest):
    """Resolve a pending destructive-action confirmation."""
    future = _confirm_futures.get(confirm_id)
    if future and not future.done():
        future.set_result(req.approved)
        return {"status": "resolved", "approved": req.approved}
    return {"status": "not_found"}


async def track_cost(user_id: str, model: str, input_tokens: int, output_tokens: int, db: AsyncSession):
    """Log LLM usage to cost_events table.

    Pricing sourced from settings so it stays current without code changes.
    """
    from app.models.models import CostEvent

    # Use fast-model pricing for Haiku, standard pricing for everything else
    if "haiku" in model.lower():
        input_price = settings.LLM_PRICE_FAST_INPUT_PER_1M
        output_price = settings.LLM_PRICE_FAST_OUTPUT_PER_1M
    else:
        input_price = settings.LLM_PRICE_INPUT_PER_1M
        output_price = settings.LLM_PRICE_OUTPUT_PER_1M

    input_cost = (input_tokens / 1_000_000) * input_price
    output_cost = (output_tokens / 1_000_000) * output_price
    total_cost = input_cost + output_cost

    event = CostEvent(
        user_id=user_id or "anonymous",
        tokens=input_tokens + output_tokens,
        cost=round(total_cost, 6),
        model=model,
    )
    db.add(event)
