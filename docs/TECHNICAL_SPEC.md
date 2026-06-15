# Mini Cursor — Technical Architecture Document

**Version:** 1.0
**Status:** Implementation Spec
**Purpose:** Defines exact system architecture so an AI agent or engineer can build the system without ambiguity.

---

# 1. System Overview

Mini Cursor is a distributed AI agent system running on a single VPS (V1).

It consists of:

- Frontend (Next.js)
- Backend API (FastAPI)
- Agent Runtime (AES-based orchestration layer)
- Tool Execution Layer (sandboxed Docker)
- PostgreSQL (state + memory)
- GitHub Integration Layer
- DevOps Monitoring Layer

---

# 2. High-Level Architecture

```
[ User ]
   |
   v
[ Next.js Frontend ]
   |
   v
[ FastAPI Backend ]
   |
   v
[ Agent Orchestrator (AES) ]
   |
   +-------------------------------+
   |        Tool Layer             |
   |                               |
   | GitHub Tools                 |
   | File System Tools            |
   | Docker Execution Tools       |
   | DevOps Tools                 |
   | Ticketing Tools              |
   +-------------------------------+
   |
   v
[ PostgreSQL + Docker Engine ]
```

---

# 3. Repository Structure

```
mini-cursor/
│
├── frontend/                # Next.js app
├── backend/                 # FastAPI app
├── agents/                  # AES agent definitions
├── tools/                   # Tool implementations
├── executor/                # Docker sandbox runner
├── infra/                   # Nginx, docker-compose
├── db/                      # migrations + schema
└── docs/
```

---

# 4. Backend Architecture (FastAPI)

## 4.1 Responsibilities

- Authentication (Google OAuth)
- Project management
- Agent orchestration
- Tool execution routing
- GitHub integration
- Audit logging

## 4.2 API Structure

### Auth

```
POST /auth/google
GET  /auth/session
```

### Projects

```
POST /projects
GET  /projects
GET  /projects/{id}
```

### Chat / Agent

```
POST /agent/run
POST /agent/stream
GET  /agent/logs/{session_id}
```

### GitHub

```
POST /github/connect
GET  /github/repos
POST /github/sync
```

### Execution

```
POST /execution/run
GET  /execution/status/{id}
```

---

# 5. Agent System (AES Orchestration Layer)

## 5.1 Core Rule

Agents NEVER directly:

- Access filesystem
- Access OS
- Execute shell commands
- Access secrets

All actions go through tools.

## 5.2 Coordinator Agent

```python
class CoordinatorAgent:
    def route(self, task):
        if task.type == "code":
            return CodingAgent()
        if task.type == "plan":
            return PlannerAgent()
        if task.type == "review":
            return ReviewAgent()
```

## 5.3 Deterministic Execution Model (State Machine)

```text
USER REQUEST
    ↓
COORDINATOR STATE MACHINE
    ↓
PLAN
    ↓
EXECUTE STEP (loop)
    ↓
VALIDATE
    ↓
FIX IF NEEDED
    ↓
REPEAT OR EXIT
```

## 5.4 Execution State

```python
class ExecutionState:
    task_id: str
    status: Literal["planning", "executing", "verifying", "failed", "done"]
    current_step: int
    max_steps: int = 25
    retry_count: int = 0
    artifacts: dict
```

## 5.5 Main Loop

```python
while state.status != "done":
    if state.retry_count > 5:
        fail_task()

    step = plan.steps[state.current_step]
    result = execute(step)

    if result.success:
        state.current_step += 1
    else:
        state.retry_count += 1
        state = repair(step, error=result.error)
```

## 5.6 Stop Conditions

A task ends ONLY when:
- All steps complete
- Tests pass (if applicable)
- Review passes OR user overrides

Hard limits:
- MAX_STEPS = 25
- MAX_RETRIES_PER_STEP = 3
- MAX_TOTAL_RUNTIME = 10 min (V1)

## 5.7 AES Integration

```python
class AESClient:
    def run(self, agent_prompt, tools):
        response = anthropic.messages.create(
            model="claude-3-5-sonnet",
            messages=agent_prompt,
            tools=tools,
            temperature=0.2,
            max_tokens=4096
        )
        return response
```

## 5.8 Agent Communication

Single Orchestrator Model — all agents are functions, not services.

```
Coordinator (FastAPI process)
    |
    ├── Planner Agent
    ├── Coding Agent
    ├── Review Agent
    ├── DevOps Agent
```

No message queues, no microservices, no Redis pub/sub.

## 5.9 Error Recovery

Global Retry Policy:
- MAX_RETRIES_PER_TOOL = 3
- MAX_RETRIES_PER_STEP = 3
- MAX_AGENT_RETRIES = 5

Self-Healing Rule: Agent MUST diagnose → modify plan → retry on failure.

---

# 6. Tool System

## 6.1 Tool Interface Contract

```python
class Tool:
    name: str
    description: str

    def execute(self, input: dict) -> dict:
        pass
```

## 6.2 File Tools

```
read_file(path)
write_file(path, content)
list_files(path)
search_files(query)
```

## 6.3 Execution Tools (Docker Sandbox)

```
run_python(code)
run_bash(command)
run_tests()
```

### Execution Rules
- Must run inside Docker container
- 120s timeout max
- 512MB RAM limit
- No host access
- No network access (default OFF)
- Container deleted after execution

### File Injection
```
write_file → volume mount → container
```

### Container IO Contract
```
INPUT:  file system (mounted /workspace)
OUTPUT: stdout, stderr, modified files diff
```

## 6.4 GitHub Tools

```
create_branch()
commit_changes()
push_branch()
create_pr()
list_prs()
merge_pr()
```

## 6.5 DevOps Tools

```
get_cpu_usage()
get_memory_usage()
get_disk_usage()
list_containers()
container_logs()
restart_container()
```

## 6.6 Ticket Tools

```
create_ticket()
update_ticket()
close_ticket()
list_tickets()
```

---

# 7. Docker Execution Layer

## 7.1 Architecture

```
FastAPI
   |
   v
Docker Runner Service
   |
   v
Ephemeral Container
   |
   v
User Code Execution
```

## 7.2 Container Spec

```yaml
image: python:3.12
resources:
  cpu: 1
  memory: 512mb
  disk: 1gb
timeout: 120s
```

## 7.3 Isolation Rules

- No network access (default OFF)
- No host mount access
- Container deleted after execution

---

# 8. Database Schema (PostgreSQL)

## 8.1 Users

```sql
id TEXT PRIMARY KEY
email TEXT UNIQUE
name TEXT
avatar_url TEXT
created_at TIMESTAMP
```

## 8.2 Auth Sessions

```sql
auth_sessions (
  id UUID PRIMARY KEY,
  user_id UUID,
  jwt_hash TEXT,
  created_at TIMESTAMP,
  expires_at TIMESTAMP
)
```

## 8.3 Projects

```sql
id TEXT PRIMARY KEY
user_id TEXT
name TEXT
created_at TIMESTAMP
```

## 8.4 Sessions

```sql
id TEXT PRIMARY KEY
project_id TEXT
created_at TIMESTAMP
```

## 8.5 Messages

```sql
id TEXT PRIMARY KEY
session_id TEXT
role TEXT
content TEXT
timestamp TIMESTAMP
```

## 8.6 Agent Actions

```sql
id TEXT PRIMARY KEY
session_id TEXT
agent TEXT
action TEXT
status TEXT
timestamp TIMESTAMP
```

## 8.7 Files (agent workspace)

```sql
files (
  id UUID,
  project_id UUID,
  path TEXT,
  content TEXT,
  version INT,
  updated_at TIMESTAMP
)
```

## 8.8 GitHub Repositories

```sql
id TEXT PRIMARY KEY
user_id TEXT
repo_name TEXT
repo_url TEXT
access_token_encrypted TEXT
```

## 8.9 Tickets

```sql
id TEXT PRIMARY KEY
project_id TEXT
title TEXT
status TEXT
priority TEXT
created_at TIMESTAMP
```

## 8.10 Pull Requests

```sql
id TEXT PRIMARY KEY
project_id TEXT
branch TEXT
status TEXT
url TEXT
```

## 8.11 Embeddings

```sql
embeddings (
  id UUID,
  repo_id TEXT,
  file_path TEXT,
  vector FLOAT[],
  content_hash TEXT
)
```

## 8.12 Audit Logs

```sql
audit_logs (
  id UUID,
  user_id UUID,
  action TEXT,
  payload JSONB,
  timestamp TIMESTAMP
)
```

## 8.13 Cost Events

```sql
cost_events (
  id UUID,
  user_id UUID,
  tokens INT,
  cost FLOAT,
  model TEXT,
  timestamp TIMESTAMP
)
```

---

# 9. GitHub Integration Design

## 9.1 Sync Flow

```
User connects GitHub
   ↓
OAuth token stored
   ↓
Repo cloned or indexed
   ↓
Embeddings generated
   ↓
Stored in DB
```

## 9.2 Agent Git Flow

```
Issue → Plan → Code → Test → PR → Review → Merge
```

## 9.3 Restrictions

- No force push
- No repo deletion
- No direct production merge

---

# 10. Middleware Layer

Every request passes through:
- Auth check
- Rate limiting
- Logging
- Cost tracking
- Validation

```
Agent Request → Middleware → Tool Execution Allowed / Blocked
```

---

# 11. Authentication

## Google OAuth Flow

```
Frontend → Google → Callback → Backend → JWT → Session
```

## JWT Structure

```json
{
  "user_id": "uuid",
  "email": "user@gmail.com",
  "exp": 1234567890
}
```

## GitHub Token Encryption

AES-256-GCM, server-side key.

---

# 12. Streaming Design

Uses SSE (Server-Sent Events), not WebSockets in V1.

```
GET /agent/stream
```

Event format:

```
event: token
data: "Generating code..."

event: tool_call
data: {"tool": "write_file"}

event: status
data: "running tests"
```

---

# 13. Rate Limits

## Free Tier

- 100 API requests/day
- 20 agent runs/day
- 20 code executions/day
- 10 PR creations/day

---

# 14. Security Model

## Forbidden Actions

- SSH access
- Root access
- OS commands outside sandbox
- Secret exposure
- File system escape

## Secret Handling

Secrets are injected as `ENV_VAR_EXISTS=true` — NOT actual values.

---

# 15. Logging & Observability

## Logged Events

- Agent decisions
- Tool calls
- Execution outputs
- GitHub actions
- Errors
- Latency

## V1 Logging Stack

PostgreSQL logs table + stdout logs (docker logs).

---

# 16. Deployment Architecture

## VPS Setup

```
Nginx
  |
Next.js (3000)
  |
FastAPI (8000)
  |
Postgres (5432)
  |
Docker Engine
```

## Docker Compose

```yaml
services:
  frontend:
  backend:
  postgres:
  executor:
```

## CI/CD (V1)

```
GitHub → VPS pull → docker compose up
```

---

# 17. Performance Constraints

- API latency target: < 500ms (non-agent calls)
- Agent response: < 20s initial token
- Docker execution: < 120s
- Max file size: 500KB
- Max project size: 10,000 files

---

# 18. Acceptance Criteria (V1)

System is complete when:

- User can log in with Google
- User can create project
- Agent can generate code
- Agent can run tests in Docker
- Agent can fix errors automatically
- Agent can create GitHub PR
- Agent can review PR
- Agent can monitor VPS
- All actions are logged
- No direct server access is possible

---

# 19. Future Extensions

### V2: Multi-model support
Claude, GPT, Gemini, DeepSeek

### V3: Knowledge Agent
Long-term memory, repo understanding, incident memory

### V4: Engineering Manager Agent
Task prioritization, productivity analysis

### V5: Autonomous SDLC
Full lifecycle automation: Ticket → Code → Test → PR → Merge → Deploy → Monitor

---

# END OF TECHNICAL SPEC
