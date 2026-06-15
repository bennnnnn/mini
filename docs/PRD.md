# Mini Cursor

**Version:** 1.0
**Status:** Planning
**Owner:** Founder
**Primary Goal:** Learn and build modern AI agent systems using Anthropic AES while creating an AI-native software engineering platform.

---

# Table of Contents

1. Executive Summary
2. Product Vision
3. Goals
4. Non-Goals
5. Target Users
6. System Overview
7. User Flows
8. Functional Requirements
9. Agent Architecture
10. Tool Architecture
11. GitHub Integration
12. VPS & Infrastructure Architecture
13. Docker Execution Sandbox
14. Security Requirements
15. Business Rules
16. Middleware Requirements
17. Database Schema
18. API Design
19. UI/UX Specifications
20. Logging & Observability
21. Rate Limits
22. Acceptance Criteria
23. Future Roadmap

---

# 1. Executive Summary

Mini Cursor is an AI-native software engineering platform that helps developers build, modify, test, review, and deploy software through autonomous AI agents.

Unlike traditional AI coding assistants, Mini Cursor is designed to understand the entire software development lifecycle.

The platform combines:

- Planning
- Coding
- Testing
- Reviewing
- Ticket management
- Pull request management
- Infrastructure monitoring

into a unified workspace.

The initial implementation uses Anthropic AES and a single model provider while maintaining an architecture that supports future multi-model expansion.

---

# 2. Product Vision

A developer should be able to type:

> Build a blogging platform with Google authentication.

The system should:

1. Create a ticket
2. Create a branch
3. Generate a plan
4. Implement the solution
5. Create tests
6. Execute tests
7. Fix failures
8. Review code
9. Create a pull request
10. Request approval
11. Merge changes
12. Deploy application
13. Monitor production

while maintaining complete visibility into every action performed by the system.

---

# 3. Goals

## Primary Goals

- Learn modern AI agent architecture
- Build a production-quality AI engineering platform
- Support autonomous coding workflows
- Understand AES deeply
- Learn tool-based agent design
- Learn execution environments
- Learn infrastructure automation

## Secondary Goals

- Multi-model support
- Team collaboration
- Long-term project memory
- DevOps automation
- Autonomous software engineering

---

# 4. Non-Goals

The initial version will NOT include:

- Mobile applications
- Kubernetes support
- Multi-tenant enterprise architecture
- Team collaboration
- Marketplace integrations
- Self-hosted model execution
- Custom plugin marketplace

---

# 5. Target Users

## V1

- Individual developers
- Students
- Open source contributors
- AI learners

## Future

- Engineering teams
- Startups
- Internal developer platforms

---

# 6. System Overview

```
User
 |
Coordinator Agent
 |
+----------------------------+
| Planner Agent              |
| Coding Agent               |
| Testing Agent              |
| Review Agent               |
| Git Agent                  |
| DevOps Agent               |
+----------------------------+
 |
Tools
 |
Infrastructure
```

The Coordinator Agent is responsible for delegating work to specialized agents.

---

# 7. Core User Flow

## Example Request

User: `Build a FastAPI Todo API.`

System:

1. Create ticket
2. Create branch
3. Generate implementation plan
4. Create files
5. Generate code
6. Generate tests
7. Execute tests
8. Review implementation
9. Commit changes
10. Create pull request

Result:

- Branch created
- Code generated
- Tests passing
- Draft PR created

---

# 8. Authentication

## Supported

- Google OAuth

## Not Supported

- Email/password
- Anonymous users
- Facebook login
- GitHub login

## Stored User Information

- User ID
- Email
- Name
- Avatar URL
- Created Timestamp

---

# 9. Infrastructure Architecture

## Deployment Model

All V1 services run on a single Contabo VPS.

```
Internet
 |
Nginx
 |
+-------------------------------------+
| VPS                                 |
|                                     |
| Frontend (Next.js)                  |
| Backend (FastAPI)                   |
| PostgreSQL                          |
| AES Agents                          |
| Docker Executor                     |
|                                     |
+-------------------------------------+
```

---

# 10. Frontend Requirements

## Technology

- Next.js
- React
- TypeScript
- TailwindCSS
- Monaco Editor

## Pages

### Login
Google Sign-In only.

### Dashboard
Displays:

- Projects
- Recent Sessions

### Workspace
Displays:

- File Explorer
- Monaco Editor
- Chat
- Terminal
- Agent Timeline

### Settings
Displays:

- Account
- GitHub Integration
- Model Settings (future)

---

# 11. Backend Requirements

## Technology

- FastAPI
- Python
- PostgreSQL
- AES

## Responsibilities

- Authentication
- Project Management
- Agent Orchestration
- GitHub Integration
- Tool Execution
- Docker Management
- Audit Logging

---

# 12. Agent Architecture

## Coordinator Agent

Responsibilities:

- Route tasks
- Manage workflow
- Track progress

Cannot:

- Write files
- Execute code directly

## Planner Agent

Responsibilities:

- Analyze requests
- Create implementation plans

Cannot:

- Modify code

## Coding Agent

Responsibilities:

- Create files
- Modify files
- Generate code

## Testing Agent

Responsibilities:

- Create tests
- Execute tests
- Report failures

## Review Agent

Responsibilities:

- Security review
- Quality review
- Performance review

## Git Agent

Responsibilities:

- Branches
- Commits
- Pull Requests

## DevOps Agent

Responsibilities:

- Infrastructure monitoring
- Log analysis
- Deployment diagnostics

---

# 13. GitHub Integration

## GitHub OAuth

Users may connect GitHub accounts.

## Read Access

- Repositories
- Branches
- Pull Requests
- Issues
- Commits

## Write Access

- Create Branch
- Create Commit
- Create Pull Request
- Create Issue

## Restricted

- Repository Deletion
- Force Push
- Branch Protection Modification

## GitHub Agent Features

### Repository Understanding

Agent can:

- Analyze project structure
- Analyze commit history
- Analyze pull requests
- Analyze issues

### Pull Request Creation

Agent automatically generates:

- Title
- Description
- Testing Notes
- Risk Assessment

---

# 14. Docker Execution Sandbox

All user-generated code executes inside Docker.

## Limits

CPU: 1 Core
Memory: 512 MB
Disk: 1 GB
Execution Timeout: 120 Seconds

## Security

Containers are destroyed after execution.
No host filesystem access.

---

# 15. Business Rules

- **BR-001** Agents cannot SSH into servers.
- **BR-002** Agents cannot access root.
- **BR-003** Agents cannot access secrets.
- **BR-004** Agents cannot execute destructive commands (rm -rf, shutdown, reboot, mkfs).
- **BR-005** Agents cannot access files outside the project workspace.
- **BR-006** Production deployments require approval.
- **BR-007** Pull request merges require approval.
- **BR-008** All actions must be audit logged.

---

# 16. Middleware Requirements

Every tool invocation must pass through middleware.

Responsibilities:

- Authentication
- Authorization
- Rate Limiting
- Audit Logging
- Cost Tracking
- Request Validation

Architecture:

```
Agent → Middleware → Tool
```

---

# 17. Rate Limits

## Free Tier

- Requests: 100/day
- Agent Runs: 20/day
- Code Executions: 20/day
- Pull Requests: 10/day

## Premium (Future)

Fair-use limits.

---

# 18. Future Roadmap

### V2 — Multi-model support
Claude, GPT, Gemini, DeepSeek, Ollama

### V3 — Knowledge Agent
Architecture Memory, Team Memory, Historical Memory, Incident Memory

### V4 — AI Engineering Manager
Prioritize work, analyze technical debt, recommend next tasks

### V5 — Autonomous Ticket-to-Production
Ticket → Plan → Code → Test → Review → PR → Approval → Merge → Deploy

### V6 — Team Collaboration
Shared Projects, Shared Agents, Shared Workspaces

---

# Success Criteria

A user can:

- Connect Google
- Connect GitHub
- Create Projects
- Generate Code
- Run Tests
- Review Code
- Create Tickets
- Create Pull Requests
- Monitor Infrastructure
