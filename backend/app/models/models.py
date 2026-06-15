"""SQLAlchemy ORM models for Mini Cursor.

All tables from the architecture spec plus the additions from review:
- embeddings, audit_logs, cost_events, files, auth_sessions
"""

import uuid
from datetime import datetime, timezone

from sqlalchemy import (
    Column,
    String,
    Text,
    Integer,
    Float,
    Boolean,
    DateTime,
    ForeignKey,
    Index,
    ARRAY,
)
from sqlalchemy.dialects.postgresql import JSONB, UUID
from sqlalchemy.orm import relationship

from app.core.database import Base


def _utcnow():
    return datetime.now(timezone.utc)


def _new_uuid():
    return str(uuid.uuid4())


# ── Users ──────────────────────────────────────────────────────────────

class User(Base):
    __tablename__ = "users"

    id = Column(String, primary_key=True, default=_new_uuid)
    email = Column(String, unique=True, nullable=False, index=True)
    name = Column(String, nullable=False)
    avatar_url = Column(String, nullable=True)
    created_at = Column(DateTime(timezone=True), nullable=False, default=_utcnow)

    sessions = relationship("AuthSession", back_populates="user")


# ── Auth Sessions ──────────────────────────────────────────────────────

class AuthSession(Base):
    __tablename__ = "auth_sessions"

    id = Column(String, primary_key=True, default=_new_uuid)
    user_id = Column(String, ForeignKey("users.id"), nullable=False, index=True)
    jwt_hash = Column(String, nullable=False)
    created_at = Column(DateTime(timezone=True), nullable=False, default=_utcnow)
    expires_at = Column(DateTime(timezone=True), nullable=False)

    user = relationship("User", back_populates="sessions")


# ── Projects ──────────────────────────────────────────────────────────

class Project(Base):
    __tablename__ = "projects"

    id = Column(String, primary_key=True, default=_new_uuid)
    user_id = Column(String, nullable=True, index=True)
    name = Column(String, nullable=False)
    description = Column(Text, nullable=True)      # project description for agent context
    github_repo = Column(String, nullable=True)    # "owner/repo" when linked
    created_at = Column(DateTime(timezone=True), nullable=False, default=_utcnow)

    sessions = relationship("Session", back_populates="project")
    files = relationship("File", back_populates="project")
    tickets = relationship("Ticket", back_populates="project")
    pull_requests = relationship("PullRequest", back_populates="project")


# ── Sessions ──────────────────────────────────────────────────────────

class Session(Base):
    __tablename__ = "sessions"

    id = Column(String, primary_key=True, default=_new_uuid)
    project_id = Column(String, ForeignKey("projects.id"), nullable=False, index=True)
    title = Column(String, nullable=True)          # auto-set from first user message
    created_at = Column(DateTime(timezone=True), nullable=False, default=_utcnow)

    project = relationship("Project", back_populates="sessions")
    messages = relationship("Message", back_populates="session")
    actions = relationship("AgentAction", back_populates="session")


# ── Messages ──────────────────────────────────────────────────────────

class Message(Base):
    __tablename__ = "messages"

    id = Column(String, primary_key=True, default=_new_uuid)
    session_id = Column(String, ForeignKey("sessions.id"), nullable=False, index=True)
    role = Column(String, nullable=False)  # user | assistant | tool
    content = Column(Text, nullable=False)
    timestamp = Column(DateTime(timezone=True), nullable=False, default=_utcnow)

    session = relationship("Session", back_populates="messages")

    __table_args__ = (
        Index("ix_messages_session_timestamp", "session_id", "timestamp"),
    )

# ── Agent Actions ──────────────────────────────────────────────────────

class AgentAction(Base):
    __tablename__ = "agent_actions"

    id = Column(String, primary_key=True, default=_new_uuid)
    session_id = Column(String, ForeignKey("sessions.id"), nullable=False, index=True)
    agent = Column(String, nullable=False)  # coordinator | planner | coding | ...
    action = Column(String, nullable=False)  # write_file | run_tests | ...
    status = Column(String, nullable=False)  # success | failure | retry
    payload = Column(JSONB, nullable=True)  # tool input/output
    error = Column(Text, nullable=True)
    timestamp = Column(DateTime(timezone=True), nullable=False, default=_utcnow)

    session = relationship("Session", back_populates="actions")


# ── Files (Agent Workspace) ────────────────────────────────────────────

class File(Base):
    __tablename__ = "files"

    id = Column(String, primary_key=True, default=_new_uuid)
    project_id = Column(String, ForeignKey("projects.id"), nullable=False, index=True)
    path = Column(String, nullable=False)
    content = Column(Text, nullable=True)
    version = Column(Integer, nullable=False, default=1)
    created_at = Column(DateTime(timezone=True), nullable=False, default=_utcnow)
    updated_at = Column(DateTime(timezone=True), nullable=False, default=_utcnow)

    project = relationship("Project", back_populates="files")


# ── GitHub Repositories ────────────────────────────────────────────────

class GitHubRepo(Base):
    __tablename__ = "github_repos"

    id = Column(String, primary_key=True, default=_new_uuid)
    user_id = Column(String, ForeignKey("users.id"), nullable=False, index=True)
    repo_name = Column(String, nullable=False)
    repo_url = Column(String, nullable=False)
    access_token_encrypted = Column(String, nullable=False)
    created_at = Column(DateTime(timezone=True), nullable=False, default=_utcnow)


# ── Tickets ────────────────────────────────────────────────────────────

class Ticket(Base):
    __tablename__ = "tickets"

    id = Column(String, primary_key=True, default=_new_uuid)
    project_id = Column(String, ForeignKey("projects.id"), nullable=False, index=True)
    title = Column(String, nullable=False)
    status = Column(String, nullable=False, default="open")  # open | in_progress | done
    priority = Column(String, nullable=False, default="medium")  # low | medium | high
    created_at = Column(DateTime(timezone=True), nullable=False, default=_utcnow)

    project = relationship("Project", back_populates="tickets")


# ── Pull Requests ──────────────────────────────────────────────────────

class PullRequest(Base):
    __tablename__ = "pull_requests"

    id = Column(String, primary_key=True, default=_new_uuid)
    project_id = Column(String, ForeignKey("projects.id"), nullable=False, index=True)
    branch = Column(String, nullable=False)
    status = Column(String, nullable=False)  # draft | open | merged | closed
    url = Column(String, nullable=True)
    created_at = Column(DateTime(timezone=True), nullable=False, default=_utcnow)

    project = relationship("Project", back_populates="pull_requests")


# ── Embeddings (Code Index) ────────────────────────────────────────────

class Embedding(Base):
    __tablename__ = "embeddings"

    id = Column(String, primary_key=True, default=_new_uuid)
    repo_id = Column(String, nullable=False, index=True)
    file_path = Column(String, nullable=False)
    vector = Column(ARRAY(Float), nullable=True)
    content_hash = Column(String, nullable=False)
    created_at = Column(DateTime(timezone=True), nullable=False, default=_utcnow)


# ── Audit Logs ─────────────────────────────────────────────────────────

class AuditLog(Base):
    __tablename__ = "audit_logs"

    id = Column(String, primary_key=True, default=_new_uuid)
    user_id = Column(String, ForeignKey("users.id"), nullable=True, index=True)
    action = Column(String, nullable=False)
    payload = Column(JSONB, nullable=True)
    timestamp = Column(DateTime(timezone=True), nullable=False, default=_utcnow)

    __table_args__ = (
        Index("ix_audit_logs_timestamp", "timestamp"),
        Index("ix_audit_logs_user_action", "user_id", "action"),
    )


# ── User Context (preferences + project notes) ────────────────────────────

class UserContext(Base):
    """Dynamic context about the user — injected into every agent call."""
    __tablename__ = "user_context"

    id = Column(String, primary_key=True, default=_new_uuid)
    user_id = Column(String, nullable=False, default="default", index=True)
    project_id = Column(String, ForeignKey("projects.id"), nullable=True, index=True)
    scope = Column(String, nullable=False, default="global")  # "global" | "project"
    key = Column(String, nullable=False)
    value = Column(Text, nullable=False)
    updated_at = Column(DateTime(timezone=True), nullable=False, default=_utcnow)

    __table_args__ = (
        Index("ix_user_context_user_scope", "user_id", "scope"),
    )


# ── Cost Events ────────────────────────────────────────────────────────

class CostEvent(Base):
    __tablename__ = "cost_events"

    id = Column(String, primary_key=True, default=_new_uuid)
    user_id = Column(String, nullable=True, index=True)  # nullable — may be "anonymous"
    tokens = Column(Integer, nullable=False)
    cost = Column(Float, nullable=False)
    model = Column(String, nullable=False)
    timestamp = Column(DateTime(timezone=True), nullable=False, default=_utcnow)
