"use client";

import { useEffect, useRef, useState } from "react";
import hljs from "highlight.js";

// ── Types ──────────────────────────────────────────────────────────────────

export interface LogEntry {
  type: "user" | "agent" | "status" | "error";
  message: string;
  agent?: string;
  status?: string;
  time?: string;
  files?: { path: string; size: number }[];
  plan?: { action: string; description: string; agent: string }[];
}

interface ChatPanelProps {
  logs: LogEntry[];
  running: boolean;
  liveAction: string | null;
  connected: boolean;
  collapsed: boolean;
  onToggleCollapse: () => void;
  prompt: string;
  onPromptChange: (value: string) => void;
  onSubmit: () => void;
  onCancel?: () => void;
  onFileOpen: (path: string) => void;
  attachedFiles: string[];
  onAttachFile: (path: string) => void;  // receives the selected file path
  onRemoveFile: (path: string) => void;
  availableFiles: string[];
}

// ── Component ──────────────────────────────────────────────────────────────

export function ChatPanel(props: ChatPanelProps) {
  if (props.collapsed) {
    return <CollapsedStrip onExpand={props.onToggleCollapse} hasActivity={props.logs.length > 0} />;
  }
  return <ExpandedPanel {...props} />;
}

// ── Collapsed strip ───────────────────────────────────────────────────────

function CollapsedStrip({ onExpand, hasActivity }: { onExpand: () => void; hasActivity: boolean }) {
  return (
    <div className="w-9 border-l border-border bg-surface flex flex-col items-center pt-2 gap-3 shrink-0">
      <button
        onClick={onExpand}
        title="Expand chat"
        className="relative w-6 h-6 flex items-center justify-center rounded text-text-muted hover:text-text hover:bg-surface-2 transition-colors"
      >
        <svg className="w-3.5 h-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
          <path strokeLinecap="round" strokeLinejoin="round" d="M15 19l-7-7 7-7" />
        </svg>
        {hasActivity && (
          <span className="absolute -top-0.5 -right-0.5 w-1.5 h-1.5 rounded-full bg-accent" />
        )}
      </button>
      <span
        className="text-[10px] font-semibold text-text-muted uppercase tracking-widest"
        style={{ writingMode: "vertical-rl", transform: "rotate(180deg)" }}
      >
        Agent
      </span>
    </div>
  );
}

function ExpandedPanel({
  logs,
  running,
  liveAction,
  connected,
  onToggleCollapse,
  prompt,
  onPromptChange,
  onSubmit,
  onCancel,
  onFileOpen,
  attachedFiles,
  onAttachFile,
  onRemoveFile,
  availableFiles,
}: ChatPanelProps) {
  const scrollRef = useRef<HTMLDivElement>(null);
  const textareaRef = useRef<HTMLTextAreaElement>(null);
  const [showFilePicker, setShowFilePicker] = useState(false);

  useEffect(() => {
    if (scrollRef.current) {
      scrollRef.current.scrollTop = scrollRef.current.scrollHeight;
    }
  }, [logs, running]);

  // Auto-resize textarea
  useEffect(() => {
    const el = textareaRef.current;
    if (el) { el.style.height = "auto"; el.style.height = Math.min(el.scrollHeight, 160) + "px"; }
  }, [prompt]);

  const handleKeyDown = (e: React.KeyboardEvent<HTMLTextAreaElement>) => {
    if (e.key === "Enter" && !e.shiftKey) {
      e.preventDefault();
      if (prompt.trim()) onSubmit();
    }
    if (e.key === "Escape") setShowFilePicker(false);
  };

  return (
    <div className="w-full h-full flex flex-col bg-surface">
      {/* Panel header */}
      <div className="h-9 px-3 flex items-center justify-between border-b border-border shrink-0">
        {/* Collapse button */}
        <button
          onClick={onToggleCollapse}
          title="Collapse chat"
          className="w-5 h-5 flex items-center justify-center rounded text-text-muted hover:text-text-secondary hover:bg-surface-2 transition-colors"
        >
          <svg className="w-3.5 h-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
            <path strokeLinecap="round" strokeLinejoin="round" d="M9 5l7 7-7 7" />
          </svg>
        </button>
        <span className="text-[10px] font-semibold text-text-muted uppercase tracking-widest">Agent</span>
        {running ? (
          <div className="flex items-center gap-1.5">
            <span className="w-1.5 h-1.5 rounded-full bg-accent animate-pulse" />
            <span className="text-[10px] text-accent font-medium">Working</span>
          </div>
        ) : connected ? (
          <div className="flex items-center gap-1.5">
            <span className="w-1.5 h-1.5 rounded-full bg-success" />
            <span className="text-[10px] text-text-muted">Ready</span>
          </div>
        ) : (
          <div className="flex items-center gap-1.5">
            <span className="w-1.5 h-1.5 rounded-full bg-warning animate-pulse" />
            <span className="text-[10px] text-text-muted">Connecting...</span>
          </div>
        )}
      </div>

      {/* Live activity banner — sticks below the header when agent is working */}
      {running && (
        <div className="px-3 py-2 border-b border-border bg-accent/5 shrink-0">
          <div className="flex items-center gap-2">
            <div className="flex gap-0.5 shrink-0">
              {[0, 120, 240].map((d) => (
                <span key={d} className="w-1.5 h-1.5 rounded-full bg-accent animate-bounce" style={{ animationDelay: `${d}ms` }} />
              ))}
            </div>
            <span className="text-[12px] text-accent font-mono truncate">
              {liveAction ?? "Working..."}
            </span>
          </div>
        </div>
      )}

      {/* Messages */}
      <div ref={scrollRef} className="flex-1 overflow-y-auto px-3 py-3 space-y-2">
        {logs.length === 0 && !running && <EmptyMessages connected={connected} />}

        {logs.map((log, i) => (
          <Message key={i} log={log} onFileOpen={onFileOpen} />
        ))}
      </div>

      {/* Composer — Cursor-style */}
      <div className="border-t border-border p-3 shrink-0">
        <div className="rounded-xl border border-border bg-bg focus-within:border-accent/40 focus-within:ring-1 focus-within:ring-accent/20 transition-all overflow-hidden">
          {/* Attached files */}
          {attachedFiles.length > 0 && (
            <div className="flex flex-wrap gap-1.5 px-3 pt-3 pb-1">
              {attachedFiles.map(f => (
                <span key={f} className="inline-flex items-center gap-1 px-2 py-0.5 rounded-md bg-accent/10 border border-accent/20 text-[11px] text-accent font-mono">
                  {f.split("/").pop()}
                  <button onClick={() => onRemoveFile(f)} className="hover:text-text transition-colors">×</button>
                </span>
              ))}
            </div>
          )}

          {/* Textarea */}
          <textarea
            ref={textareaRef}
            value={prompt}
            onChange={(e) => onPromptChange(e.target.value)}
            onKeyDown={handleKeyDown}
            placeholder="Describe what you want to build... (↵ to send, ⇧↵ new line)"
            rows={1}
            disabled={running}
            className="w-full bg-transparent px-3 pt-2.5 pb-0 text-[13px] text-text placeholder:text-text-muted resize-none focus:outline-none border-none disabled:opacity-50"
          />

          {/* Bottom bar: file picker + send */}
          <div className="flex items-center justify-between px-2 pb-2 pt-1.5">
            <div className="relative">
              <button
                onClick={() => setShowFilePicker(!showFilePicker)}
                className="w-7 h-7 flex items-center justify-center rounded-lg text-text-muted hover:text-text hover:bg-surface transition-colors"
                title="Add context files"
              >
                <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.5}>
                  <path strokeLinecap="round" strokeLinejoin="round" d="M18.375 12.739l-7.693 7.693a4.5 4.5 0 01-6.364-6.364l10.94-10.94A3 3 0 1119.5 7.372L8.552 18.32m.009-.01l-.01.01m5.699-5.7l-1.42 1.42" />
                </svg>
              </button>

              {/* File picker dropdown */}
              {showFilePicker && availableFiles.length > 0 && (
                <div className="absolute bottom-full left-0 mb-2 w-56 bg-surface border border-border rounded-xl shadow-xl overflow-hidden z-10">
                  <div className="px-3 py-2 border-b border-border">
                    <span className="text-[10px] font-medium text-text-muted uppercase tracking-wide">Add context</span>
                  </div>
                  <div className="max-h-40 overflow-y-auto p-1">
                    {availableFiles.filter(f => !attachedFiles.includes(f)).map(f => (
                      <button
                        key={f}
                        onClick={() => { onAttachFile(f); setShowFilePicker(false); }}
                        className="w-full flex items-center gap-2 px-2 py-1.5 rounded-md text-[11px] text-text-secondary hover:bg-bg hover:text-text transition-colors"
                      >
                        <svg className="w-3 h-3 text-text-muted shrink-0" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.5}>
                          <path strokeLinecap="round" strokeLinejoin="round" d="M19.5 14.25v-2.625a3.375 3.375 0 00-3.375-3.375h-1.5A1.125 1.125 0 0113.5 7.125v-1.5a3.375 3.375 0 00-3.375-3.375H8.25m2.25 0H5.625c-.621 0-1.125.504-1.125 1.125v17.25c0 .621.504 1.125 1.125 1.125h12.75c.621 0 1.125-.504 1.125-1.125V11.25a9 9 0 00-9-9z" />
                        </svg>
                        <span className="font-mono truncate">{f}</span>
                      </button>
                    ))}
                  </div>
                  {availableFiles.filter(f => !attachedFiles.includes(f)).length === 0 && (
                    <p className="text-[11px] text-text-muted px-3 py-4 text-center">No files available</p>
                  )}
                </div>
              )}
            </div>

            {running ? (
              <button
                onClick={onCancel}
                className="w-7 h-7 flex items-center justify-center rounded-lg bg-error/20 text-error hover:bg-error/30 transition-all"
                title="Stop agent"
              >
                <svg className="w-4 h-4" fill="currentColor" viewBox="0 0 24 24"><rect x="6" y="6" width="12" height="12" rx="1"/></svg>
              </button>
            ) : (
              <button
                onClick={onSubmit}
                disabled={!prompt.trim()}
                className="w-7 h-7 flex items-center justify-center rounded-lg bg-text text-bg hover:opacity-80 disabled:opacity-20 disabled:cursor-not-allowed transition-all"
              >
                <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                  <path strokeLinecap="round" strokeLinejoin="round" d="M4.5 12h15m0 0l-6.75-6.75M19.5 12l-6.75 6.75" />
                </svg>
              </button>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}

// ── Message renderer ───────────────────────────────────────────────────────

function Message({ log, onFileOpen }: { log: LogEntry; onFileOpen: (path: string) => void }) {
  switch (log.type) {
    case "user":
      return <UserMessage log={log} />;
    case "agent":
      return <AgentMessage text={log.message} />;
    case "status":
      return <StatusCard log={log} onFileOpen={onFileOpen} />;
    case "error":
      return <ErrorCard message={log.message} />;
    default:
      return null;
  }
}

// User message — right-aligned bubble
function UserMessage({ log }: { log: LogEntry }) {
  return (
    <div className="flex justify-end">
      <div className="max-w-[85%] bg-accent/10 border border-accent/20 rounded-2xl rounded-br-sm px-3 py-2">
        <p className="text-[13px] text-text leading-relaxed">{log.message}</p>
        {log.time && (
          <p className="text-[10px] text-text-muted mt-1 text-right">{log.time}</p>
        )}
      </div>
    </div>
  );
}

// Agent text response — supports inline code blocks
function AgentMessage({ text }: { text: string }) {
  const parts = text.split(/(```[\s\S]*?```)/g);

  return (
    <div className="text-[13px] text-text-secondary leading-relaxed space-y-2">
      {parts.map((part, i) => {
        if (part.startsWith("```")) {
          const match = part.match(/```(\w+)?\n?([\s\S]*?)```/);
          if (match) {
            let highlighted: string;
            try {
              highlighted = match[1]
                ? hljs.highlight(match[2].trim(), { language: match[1] }).value
                : hljs.highlightAuto(match[2].trim()).value;
            } catch {
              highlighted = hljs.highlightAuto(match[2].trim()).value;
            }
            return (
              <pre key={i} className="!bg-bg border border-border rounded-lg overflow-x-auto">
                <code
                  className="!bg-transparent text-[11px] font-mono"
                  dangerouslySetInnerHTML={{ __html: highlighted }}
                />
              </pre>
            );
          }
        }
        return part ? <p key={i} className="whitespace-pre-wrap">{part}</p> : null;
      })}
    </div>
  );
}

// Status card — plan overview, completed steps, files created
function StatusCard({ log, onFileOpen }: { log: LogEntry; onFileOpen: (path: string) => void }) {
  // Plan card — shown once when planning finishes
  if (log.plan && log.plan.length > 0) {
    return (
      <div className="rounded-lg border border-border bg-surface-2 overflow-hidden">
        <div className="px-3 py-2 border-b border-border flex items-center gap-2">
          <span className="w-1.5 h-1.5 rounded-full bg-accent shrink-0" />
          <span className="text-[11px] font-medium text-text-secondary">
            {log.plan.length} step{log.plan.length !== 1 ? "s" : ""} planned
          </span>
        </div>
        <div className="divide-y divide-border">
          {log.plan.map((step, i) => (
            <div key={i} className="px-3 py-1.5 flex items-center gap-2">
              <span className="text-[10px] text-text-muted w-4 shrink-0">{i + 1}.</span>
              <span className={`text-[10px] font-semibold uppercase tracking-wide shrink-0 ${
                step.agent === "review" ? "text-accent" :
                step.agent === "testing" ? "text-warning" :
                step.agent === "git" ? "text-success" : "text-text-muted"
              }`}>{step.agent}</span>
              {/* Only show description if it's short and non-generic */}
              {step.description.length < 80 && (
                <span className="text-[11px] text-text-secondary truncate">{step.description}</span>
              )}
            </div>
          ))}
        </div>
      </div>
    );
  }

  // "executing" — the live action already shows this. Skip the card.
  if (log.status === "executing") return null;

  const styles = getStatusStyle(log.status);

  return (
    <div className={`rounded-lg border px-3 py-2 ${styles.card}`}>
      <div className="flex items-center gap-2">
        <span className={`w-1.5 h-1.5 rounded-full shrink-0 ${styles.dot}`} />
        {log.agent && (
          <span className={`text-[10px] font-semibold uppercase tracking-wider ${styles.label}`}>
            {log.agent}
          </span>
        )}
        {log.message && log.status !== "completed" && (
          <span className="text-[12px] text-text-secondary truncate">{log.message}</span>
        )}
        {log.time && (
          <span className="text-[10px] text-text-muted ml-auto shrink-0">{log.time}</span>
        )}
      </div>

      {/* Files created — shown as clickable pills */}
      {log.files && log.files.length > 0 && (
        <div className="mt-2 space-y-1">
          {log.files.map((f, i) => (
            <button
              key={i}
              onClick={() => onFileOpen(f.path)}
              className="flex items-center gap-2 w-full text-left px-2 py-1.5 rounded-md bg-bg/60 border border-border hover:border-border-strong hover:bg-bg transition-colors"
            >
              <svg className="w-3 h-3 text-success shrink-0" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                <path strokeLinecap="round" strokeLinejoin="round" d="M19.5 14.25v-2.625a3.375 3.375 0 00-3.375-3.375h-1.5A1.125 1.125 0 0113.5 7.125v-1.5a3.375 3.375 0 00-3.375-3.375H8.25m2.25 0H5.625c-.621 0-1.125.504-1.125 1.125v17.25c0 .621.504 1.125 1.125 1.125h12.75c.621 0 1.125-.504 1.125-1.125V11.25a9 9 0 00-9-9z" />
              </svg>
              <span className="text-[11px] text-text-secondary font-mono truncate flex-1">{f.path}</span>
              {f.size > 0 && <span className="text-[10px] text-text-muted shrink-0">{f.size}B</span>}
            </button>
          ))}
        </div>
      )}
    </div>
  );
}

function ErrorCard({ message }: { message: string }) {
  return (
    <div className="rounded-lg border border-error/30 bg-error/5 px-3 py-2.5">
      <div className="flex items-center gap-2 mb-1">
        <span className="w-1.5 h-1.5 rounded-full bg-error shrink-0" />
        <span className="text-[10px] font-semibold text-error uppercase tracking-wider">Error</span>
      </div>
      <p className="text-[12px] text-error/80 leading-relaxed pl-3.5">{message}</p>
    </div>
  );
}

function EmptyMessages({ connected }: { connected: boolean }) {
  return (
    <div className="py-16 text-center space-y-2">
      <p className="text-xs text-text-muted leading-relaxed max-w-48 mx-auto">
        {connected
          ? "Type a message below and the agent will get to work."
          : "Waiting for the backend to connect on port 8000..."}
      </p>
    </div>
  );
}

function ThinkingIndicator({ action }: { action: string | null }) {
  const isThinking = !action || action === "Claude is thinking...";

  return (
    <div className={`rounded-lg border px-3 py-2.5 transition-colors ${
      isThinking
        ? "border-border bg-surface-2"
        : "border-accent/25 bg-accent/5"
    }`}>
      <div className="flex items-center gap-2">
        <div className="flex gap-1 shrink-0">
          {[0, 150, 300].map((delay) => (
            <span
              key={delay}
              className={`w-1.5 h-1.5 rounded-full animate-bounce ${
                isThinking ? "bg-text-muted" : "bg-accent"
              }`}
              style={{ animationDelay: `${delay}ms` }}
            />
          ))}
        </div>
        <span className={`text-xs font-medium ${isThinking ? "text-text-muted" : "text-accent"}`}>
          {action ?? "Working..."}
        </span>
      </div>
    </div>
  );
}

// ── Status style helpers ───────────────────────────────────────────────────

type StatusStyle = { card: string; dot: string; label: string };

function getStatusStyle(status?: string): StatusStyle {
  const map: Record<string, StatusStyle> = {
    planning:  { card: "border-accent/20 bg-accent/5",   dot: "bg-accent",   label: "text-accent" },
    verifying: { card: "border-accent/20 bg-accent/5",   dot: "bg-accent",   label: "text-accent" },
    executing: { card: "border-warning/20 bg-warning/5", dot: "bg-warning",  label: "text-warning" },
    retrying:  { card: "border-warning/20 bg-warning/5", dot: "bg-warning",  label: "text-warning" },
    completed: { card: "border-success/20 bg-success/5", dot: "bg-success",  label: "text-success" },
    done:      { card: "border-success/20 bg-success/5", dot: "bg-success",  label: "text-success" },
    failed:    { card: "border-error/20 bg-error/5",     dot: "bg-error",    label: "text-error" },
  };

  return map[status ?? ""] ?? {
    card: "border-border bg-surface-2",
    dot: "bg-text-muted",
    label: "text-text-secondary",
  };
}
