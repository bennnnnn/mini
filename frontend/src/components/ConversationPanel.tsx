"use client";

import React, { useRef, useEffect, useState } from "react";
import { type LogEntry } from "./ChatPanel";

export interface ChatSession {
  id: string;
  title: string;
  created_at: string;
}

interface ConversationPanelProps {
  sessions: ChatSession[];
  activeSessionId: string | null;
  onSessionSelect: (session: ChatSession) => void;
  onNewSession: () => void;
  logs: LogEntry[];
  running: boolean;
  liveAction: string | null;
  streamingText?: string;
  connected: boolean;
  prompt: string;
  onPromptChange: (v: string) => void;
  onSubmit: () => void;
  onCancel?: () => void;
  onFileOpen: (path: string) => void;
  availableFiles?: string[];
  onAttachFile?: (path: string) => void;
  attachedFiles?: string[];
  onRemoveFile?: (path: string) => void;
  collapsed: boolean;
  onToggleCollapse: () => void;
  width: number;
}

export function ConversationPanel(props: ConversationPanelProps) {
  const scrollRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (scrollRef.current) {
      scrollRef.current.scrollTop = scrollRef.current.scrollHeight;
    }
  }, [props.logs, props.running, props.streamingText]);

  return (
    <div className="w-full h-full flex flex-col bg-bg">
      {/* Messages — scrollable, centered like ChatGPT */}
      <div ref={scrollRef} className="flex-1 overflow-y-auto py-6 px-4">
        {props.logs.length === 0 && !props.running ? (
          <div className="h-full flex flex-col items-center justify-center text-center max-w-md mx-auto">
            <div className="w-12 h-12 rounded-2xl bg-accent/10 border border-accent/20 flex items-center justify-center mb-4">
              <svg className="w-6 h-6 text-accent" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.5}>
                <path strokeLinecap="round" strokeLinejoin="round" d="M9.813 15.904L9 18.75l-.813-2.846a4.5 4.5 0 00-3.09-3.09L2.25 12l2.846-.813a4.5 4.5 0 003.09-3.09L9 5.25l.813 2.846a4.5 4.5 0 003.09 3.09L15.75 12l-2.846.813a4.5 4.5 0 00-3.09 3.09z" />
              </svg>
            </div>
            <p className="text-base font-medium text-text mb-1">What do you want to build?</p>
            <p className="text-sm text-text-muted">Describe your project and the agent will plan, write, and review.</p>
          </div>
        ) : (
          <div className="max-w-2xl mx-auto space-y-5">
            {groupLogs(props.logs).map((group, i) => (
              <MessageGroup key={i} group={group} onFileOpen={props.onFileOpen} />
            ))}

            {/* Live streaming text — appears while agent is replying */}
            {props.streamingText && (
              <div className="flex gap-3">
                <div className="w-7 h-7 rounded-full bg-accent flex items-center justify-center shrink-0 mt-0.5">
                  <svg className="w-4 h-4 text-white" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                    <path strokeLinecap="round" strokeLinejoin="round" d="M9.813 15.904L9 18.75l-.813-2.846a4.5 4.5 0 00-3.09-3.09L2.25 12l2.846-.813a4.5 4.5 0 003.09-3.09L9 5.25l.813 2.846a4.5 4.5 0 003.09 3.09L15.75 12l-2.846.813a4.5 4.5 0 00-3.09 3.09z" />
                  </svg>
                </div>
                <div className="flex-1 min-w-0 pt-0.5">
                  <Prose text={props.streamingText} />
                  <span className="inline-block w-0.5 h-4 bg-accent animate-pulse ml-0.5 translate-y-1" />
                </div>
              </div>
            )}

            {/* Thinking indicator — shown when running but no text yet */}
            {props.running && !props.streamingText && (
              <div className="flex gap-3">
                <div className="w-7 h-7 rounded-full bg-accent/20 border border-accent/30 flex items-center justify-center shrink-0 mt-0.5">
                  <div className="w-3 h-3 flex gap-0.5 items-center">
                    {[0, 150, 300].map(d => (
                      <span key={d} className="w-1 h-1 rounded-full bg-accent animate-bounce" style={{ animationDelay: `${d}ms` }} />
                    ))}
                  </div>
                </div>
                <div className="flex items-center gap-2 text-[13px] text-text-muted pt-1.5">
                  {props.liveAction || "Thinking..."}
                </div>
              </div>
            )}
          </div>
        )}
      </div>

      {/* Composer — centered, ChatGPT-style */}
      <div className="px-4 pb-4 shrink-0">
        <div className="max-w-2xl mx-auto">
          <Composer
            prompt={props.prompt}
            running={props.running}
            onPromptChange={props.onPromptChange}
            onSubmit={props.onSubmit}
            onCancel={props.onCancel}
            availableFiles={props.availableFiles}
            onAttachFile={props.onAttachFile}
            attachedFiles={props.attachedFiles}
            onRemoveFile={props.onRemoveFile}
          />
          <p className="text-[10px] text-text-muted text-center mt-2">
            ↵ send · ⇧↵ newline · Mini Cursor can make mistakes
          </p>
        </div>
      </div>
    </div>
  );
}

// ── Group consecutive agent logs into one reply block ─────────────────────────

type LogGroup =
  | { kind: "user"; log: LogEntry }
  | { kind: "agent"; logs: LogEntry[] }
  | { kind: "other"; log: LogEntry };

function groupLogs(logs: LogEntry[]): LogGroup[] {
  const groups: LogGroup[] = [];
  let i = 0;
  while (i < logs.length) {
    const log = logs[i];
    if (log.type === "agent") {
      // Collect all consecutive agent logs into one reply
      const agentLogs: LogEntry[] = [];
      while (i < logs.length && logs[i].type === "agent") {
        agentLogs.push(logs[i]);
        i++;
      }
      groups.push({ kind: "agent", logs: agentLogs });
    } else if (log.type === "user") {
      groups.push({ kind: "user", log });
      i++;
    } else {
      groups.push({ kind: "other", log });
      i++;
    }
  }
  return groups;
}

function MessageGroup({ group, onFileOpen }: { group: LogGroup; onFileOpen: (p: string) => void }) {
  if (group.kind === "user") return <Message log={group.log} onFileOpen={onFileOpen} />;
  if (group.kind === "other") return <Message log={group.log} onFileOpen={onFileOpen} />;

  // Agent reply — avatar shows ONCE, all lines flow beneath it
  const textLogs = group.logs.filter(l => !l.message.startsWith("⚙ "));
  const actionLogs = group.logs.filter(l => l.message.startsWith("⚙ "));
  const lastLog = group.logs[group.logs.length - 1];

  return (
    <div className="flex gap-3">
      {/* Avatar — single, at the top */}
      <div className="w-7 h-7 rounded-full bg-accent flex items-center justify-center shrink-0 mt-0.5">
        <svg className="w-4 h-4 text-white" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
          <path strokeLinecap="round" strokeLinejoin="round" d="M9.813 15.904L9 18.75l-.813-2.846a4.5 4.5 0 00-3.09-3.09L2.25 12l2.846-.813a4.5 4.5 0 003.09-3.09L9 5.25l.813 2.846a4.5 4.5 0 003.09 3.09L15.75 12l-2.846.813a4.5 4.5 0 00-3.09 3.09z" />
        </svg>
      </div>

      {/* All lines of this reply */}
      <div className="flex-1 min-w-0 space-y-1">
        {/* Tool action lines (⚙) — small, muted */}
        {actionLogs.map((l, i) => (
          <p key={i} className="text-[11px] text-text-muted font-mono">{l.message.slice(2)}</p>
        ))}

        {/* Main text — joined into one block */}
        {textLogs.length > 0 && (
          <AgentText text={textLogs.map(l => l.message).join("")} />
        )}

        {lastLog.time && (
          <p className="text-[10px] text-text-muted pt-0.5">{lastLog.time}</p>
        )}
      </div>
    </div>
  );
}

// ── Message ────────────────────────────────────────────────────────────────────

function Message({ log, onFileOpen }: { log: LogEntry; onFileOpen: (p: string) => void }) {
  if (log.type === "user") {
    return (
      <div className="flex justify-end">
        <div className="max-w-[75%] bg-surface border border-border rounded-2xl rounded-br-sm px-4 py-3">
          <p className="text-[14px] text-text leading-relaxed">{log.message}</p>
          {log.time && <p className="text-[10px] text-text-muted mt-1.5 text-right">{log.time}</p>}
        </div>
      </div>
    );
  }

  // agent logs are handled by MessageGroup — this fallback shouldn't normally fire
  if (log.type === "agent") {
    return <p className="text-[14px] text-text leading-relaxed">{log.message}</p>;
  }

  if (log.type === "status") {
    if (log.status === "executing" && !log.plan) return null;

    if (log.plan && log.plan.length > 0) {
      return (
        <div className="ml-9 rounded-xl border border-border bg-surface overflow-hidden text-[12px]">
          <div className="px-4 py-2.5 border-b border-border flex items-center gap-2">
            <span className="w-1.5 h-1.5 rounded-full bg-accent shrink-0" />
            <span className="font-medium text-text-secondary">{log.plan.length} step{log.plan.length !== 1 ? "s" : ""} planned</span>
          </div>
          {log.plan.map((step, i) => (
            <div key={i} className="px-4 py-2 flex items-center gap-3 border-b border-border last:border-0">
              <span className="text-text-muted w-5 shrink-0">{i + 1}.</span>
              <span className={`text-[10px] font-bold uppercase tracking-wider w-14 shrink-0 ${
                step.agent === "review" ? "text-accent" :
                step.agent === "testing" ? "text-warning" :
                step.agent === "git" ? "text-success" : "text-text-muted"
              }`}>{step.agent}</span>
              <span className="text-text-secondary truncate">{step.description}</span>
            </div>
          ))}
        </div>
      );
    }

    if (log.files && log.files.length > 0) {
      return (
        <div className="ml-9 space-y-1.5">
          {log.files.map((f, i) => (
            <button
              key={i}
              onClick={() => onFileOpen(f.path)}
              className="flex items-center gap-2.5 w-full text-left px-3 py-2 rounded-lg bg-surface border border-border hover:border-accent/40 hover:bg-accent/5 transition-colors group"
            >
              <svg className="w-4 h-4 text-success shrink-0" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                <path strokeLinecap="round" strokeLinejoin="round" d="M9 12.75L11.25 15 15 9.75M21 12a9 9 0 11-18 0 9 9 0 0118 0z" />
              </svg>
              <span className="text-[12px] text-text-secondary font-mono truncate flex-1 group-hover:text-text">{f.path}</span>
              {f.size > 0 && <span className="text-[10px] text-text-muted shrink-0">{(f.size / 1024).toFixed(1)}KB</span>}
            </button>
          ))}
        </div>
      );
    }

    if (log.message && log.status !== "planning") {
      return <p className="ml-9 text-[12px] text-text-muted">{log.message}</p>;
    }

    return null;
  }

  if (log.type === "error") {
    return (
      <div className="ml-9 rounded-xl border border-error/30 bg-error/5 px-4 py-3">
        <p className="text-[13px] text-error/90">{log.message}</p>
      </div>
    );
  }

  return null;
}

// ── Markdown renderer ──────────────────────────────────────────────────────────

function AgentText({ text }: { text: string }) {
  // Split on fenced code blocks first
  const sections = text.split(/(```[\s\S]*?```)/g);

  return (
    <div className="space-y-3 text-[14px] leading-relaxed">
      {sections.map((s, i) => {
        if (s.startsWith("```")) {
          const m = s.match(/```(\w*)\n?([\s\S]*?)```/);
          const lang = m?.[1] || "";
          const code = (m?.[2] ?? s.slice(3, -3)).trim();
          return (
            <div key={i} className="rounded-xl border border-border overflow-hidden">
              {lang && <div className="bg-surface-2 border-b border-border px-4 py-1 text-[11px] text-text-muted font-mono">{lang}</div>}
              <pre className="bg-[#0d0d0d] p-4 overflow-x-auto text-[12px] font-mono text-neutral-200 leading-relaxed">{code}</pre>
            </div>
          );
        }
        return <Prose key={i} text={s} />;
      })}
    </div>
  );
}

// Renders a prose block line-by-line with heading/list/hr support
function Prose({ text }: { text: string }) {
  const lines = text.split(/\r?\n/);
  const out: React.ReactElement[] = [];
  let bullets: string[] = [];
  let numbered: string[] = [];
  let key = 0;
  const k = () => `k${key++}`;

  const flushBullets = () => {
    if (!bullets.length) return;
    out.push(
      <ul key={k()} className="space-y-1.5 my-1">
        {bullets.map((t, i) => (
          <li key={i} className="flex gap-2.5">
            <span className="text-text-muted shrink-0 mt-1.5 text-[10px]">●</span>
            <span className="text-text-secondary"><Inline text={t} /></span>
          </li>
        ))}
      </ul>
    );
    bullets = [];
  };

  const flushNumbered = () => {
    if (!numbered.length) return;
    out.push(
      <ol key={k()} className="space-y-1.5 my-1">
        {numbered.map((t, i) => (
          <li key={i} className="flex gap-2.5">
            <span className="text-accent font-semibold shrink-0 w-5 text-[13px]">{i + 1}.</span>
            <span className="text-text-secondary"><Inline text={t} /></span>
          </li>
        ))}
      </ol>
    );
    numbered = [];
  };

  for (const line of lines) {
    const t = line.trim();

    // Horizontal rule
    if (/^-{3,}$/.test(t)) {
      flushBullets(); flushNumbered();
      out.push(<hr key={k()} className="border-border my-2" />);
      continue;
    }

    // Headings
    const h3m = t.match(/^###\s+(.+)/);
    const h2m = t.match(/^##\s+(.+)/);
    const h1m = t.match(/^#\s+(.+)/);
    if (h3m) { flushBullets(); flushNumbered(); out.push(<h3 key={k()} className="text-[15px] font-semibold text-text mt-3"><Inline text={h3m[1]} /></h3>); continue; }
    if (h2m) { flushBullets(); flushNumbered(); out.push(<h2 key={k()} className="text-[16px] font-bold text-text mt-4"><Inline text={h2m[1]} /></h2>); continue; }
    if (h1m) { flushBullets(); flushNumbered(); out.push(<h1 key={k()} className="text-[18px] font-bold text-text mt-4"><Inline text={h1m[1]} /></h1>); continue; }

    // Bullets
    const bm = t.match(/^[-*]\s+(.+)/);
    if (bm) { flushNumbered(); bullets.push(bm[1]); continue; }

    // Numbered list
    const nm = t.match(/^\d+[.)]\s+(.+)/);
    if (nm) { flushBullets(); numbered.push(nm[1]); continue; }

    // Table row
    if (t.startsWith("|") && t.endsWith("|")) {
      flushBullets(); flushNumbered();
      if (/^\|[-| :]+\|$/.test(t)) continue; // separator
      const cells = t.slice(1, -1).split("|").map(c => c.trim());
      out.push(
        <div key={k()} className="flex border-b border-border last:border-0">
          {cells.map((c, i) => <span key={i} className="flex-1 px-3 py-1.5 text-[13px] text-text-secondary"><Inline text={c} /></span>)}
        </div>
      );
      continue;
    }

    // Empty line
    if (!t) { flushBullets(); flushNumbered(); continue; }

    // Paragraph
    flushBullets(); flushNumbered();
    out.push(<p key={k()} className="text-text-secondary"><Inline text={t} /></p>);
  }

  flushBullets();
  flushNumbered();
  return <>{out}</>;
}

// Inline: **bold**, *italic*, `code`
function Inline({ text }: { text: string }) {
  const parts = text.split(/(\*\*[^*]+\*\*|\*[^*]+\*|`[^`]+`)/g);
  return (
    <>
      {parts.map((p, i) => {
        if (p.startsWith("**") && p.endsWith("**"))
          return <strong key={i} className="font-semibold text-text">{p.slice(2, -2)}</strong>;
        if (p.startsWith("*") && p.endsWith("*") && p.length > 2)
          return <em key={i} className="italic">{p.slice(1, -1)}</em>;
        if (p.startsWith("`") && p.endsWith("`") && p.length > 2)
          return <code key={i} className="bg-surface border border-border rounded px-1.5 py-0.5 text-[12px] font-mono text-accent">{p.slice(1, -1)}</code>;
        return <span key={i}>{p}</span>;
      })}
    </>
  );
}

// ── Composer ───────────────────────────────────────────────────────────────────

function Composer({ prompt, running, onPromptChange, onSubmit, onCancel, availableFiles, onAttachFile, attachedFiles, onRemoveFile }: {
  prompt: string; running: boolean;
  onPromptChange: (v: string) => void;
  onSubmit: () => void;
  onCancel?: () => void;
  availableFiles?: string[];
  onAttachFile?: (path: string) => void;
  attachedFiles?: string[];
  onRemoveFile?: (path: string) => void;
}) {
  const ref = useRef<HTMLTextAreaElement>(null);
  const [showFiles, setShowFiles] = useState(false);

  useEffect(() => {
    const el = ref.current;
    if (el) { el.style.height = "auto"; el.style.height = Math.min(el.scrollHeight, 200) + "px"; }
  }, [prompt]);

  return (
    <div className="rounded-2xl border border-border bg-surface shadow-lg focus-within:border-accent/50 focus-within:shadow-accent/10 transition-all overflow-hidden">
      {/* Attached file chips */}
      {attachedFiles && attachedFiles.length > 0 && (
        <div className="flex flex-wrap gap-1.5 px-4 pt-3">
          {attachedFiles.map(f => (
            <span key={f} className="inline-flex items-center gap-1 px-2.5 py-1 rounded-lg bg-accent/10 border border-accent/20 text-[11px] text-accent font-mono">
              {f.split("/").pop()}
              <button onClick={() => onRemoveFile?.(f)} className="hover:text-text ml-0.5 transition-colors">×</button>
            </span>
          ))}
        </div>
      )}

      {/* Textarea */}
      <textarea
        ref={ref}
        value={prompt}
        onChange={e => onPromptChange(e.target.value)}
        onKeyDown={e => {
          if (e.key === "Enter" && !e.shiftKey) { e.preventDefault(); if (prompt.trim()) onSubmit(); }
          if (e.key === "Escape") setShowFiles(false);
        }}
        placeholder="Message Mini Cursor..."
        rows={1}
        disabled={running}
        className="w-full bg-transparent px-4 pt-3.5 pb-1 text-[14px] text-text placeholder:text-text-muted resize-none focus:outline-none disabled:opacity-50"
      />

      {/* Bottom bar */}
      <div className="flex items-center justify-between px-3 pb-3 pt-1">
        {/* File attach */}
        <div className="relative">
          {availableFiles && availableFiles.length > 0 && (
            <>
              <button
                onClick={() => setShowFiles(v => !v)}
                className="w-8 h-8 flex items-center justify-center rounded-lg text-text-muted hover:text-text hover:bg-surface-2 transition-colors"
                title="Attach file for context"
              >
                <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.5}>
                  <path strokeLinecap="round" strokeLinejoin="round" d="M18.375 12.739l-7.693 7.693a4.5 4.5 0 01-6.364-6.364l10.94-10.94A3 3 0 1119.5 7.372L8.552 18.32m.009-.01l-.01.01m5.699-5.7l-1.42 1.42" />
                </svg>
              </button>
              {showFiles && (
                <div className="absolute bottom-full left-0 mb-2 w-60 bg-surface border border-border rounded-xl shadow-xl overflow-hidden z-10">
                  <p className="px-3 py-2 text-[10px] font-semibold text-text-muted uppercase tracking-wider border-b border-border">Add file context</p>
                  <div className="max-h-48 overflow-y-auto p-1">
                    {availableFiles.filter(f => !(attachedFiles || []).includes(f)).map(f => (
                      <button key={f} onClick={() => { onAttachFile?.(f); setShowFiles(false); }}
                        className="w-full flex items-center gap-2 px-3 py-2 rounded-lg text-[12px] text-text-secondary hover:bg-bg hover:text-text transition-colors text-left">
                        <svg className="w-3 h-3 text-text-muted shrink-0" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.5}>
                          <path strokeLinecap="round" strokeLinejoin="round" d="M19.5 14.25v-2.625a3.375 3.375 0 00-3.375-3.375h-1.5A1.125 1.125 0 0113.5 7.125v-1.5a3.375 3.375 0 00-3.375-3.375H8.25m2.25 0H5.625c-.621 0-1.125.504-1.125 1.125v17.25c0 .621.504 1.125 1.125 1.125h12.75c.621 0 1.125-.504 1.125-1.125V11.25a9 9 0 00-9-9z" />
                        </svg>
                        <span className="font-mono truncate">{f}</span>
                      </button>
                    ))}
                  </div>
                </div>
              )}
            </>
          )}
        </div>

        {/* Send / Stop */}
        {running ? (
          <button
            onClick={onCancel}
            className="w-8 h-8 flex items-center justify-center rounded-lg bg-error/20 text-error hover:bg-error/30 transition-all"
            title="Stop"
          >
            <svg className="w-4 h-4" fill="currentColor" viewBox="0 0 24 24"><rect x="6" y="6" width="12" height="12" rx="1.5" /></svg>
          </button>
        ) : (
          <button
            onClick={onSubmit}
            disabled={!prompt.trim()}
            className="w-8 h-8 flex items-center justify-center rounded-lg bg-accent text-white hover:bg-accent-hover disabled:opacity-30 disabled:cursor-not-allowed transition-all"
          >
            <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
              <path strokeLinecap="round" strokeLinejoin="round" d="M4.5 10.5L12 3m0 0l7.5 7.5M12 3v18" />
            </svg>
          </button>
        )}
      </div>
    </div>
  );
}
