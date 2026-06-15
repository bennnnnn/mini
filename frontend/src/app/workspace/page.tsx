"use client";

import { useEffect, useState, useCallback, useRef } from "react";
import { useRouter } from "next/navigation";
import { useAuth } from "@/lib/auth";
import { api, streamAgent, type ConversationMessage } from "@/lib/api";
import { Header, type Project } from "@/components/Header";
import { Sidebar } from "@/components/Sidebar";
import { EditorPane } from "@/components/EditorPane";
import { ConversationPanel, type ChatSession } from "@/components/ConversationPanel";
import { type LogEntry } from "@/components/ChatPanel";
import { AuthModal } from "@/components/AuthModal";
import { GitHubModal } from "@/components/GitHubModal";
import { ResizeHandle } from "@/components/ResizeHandle";
import { TerminalPanel } from "@/components/TerminalPanel";
import type { FNode } from "@/components/FileExplorer";
import toast from "react-hot-toast";
import { ConfirmModal } from "@/components/ConfirmModal";
import { NewProjectModal } from "@/components/NewProjectModal";

export default function WorkspacePage() {
  const { user, login } = useAuth();
  const router = useRouter();

  const [projects, setProjects] = useState<Project[]>([]);
  const [pid, setPid] = useState<string | null>(null);
  const [projectName, setProjectName] = useState("Quick Start");
  const [files, setFiles] = useState<FNode[]>([]);
  const [activeFile, setActiveFile] = useState<string | null>(null);
  const [editorContent, setEditorContent] = useState("");
  const [dirty, setDirty] = useState(false);
  const [prompt, setPrompt] = useState("");
  const [logs, setLogs] = useState<LogEntry[]>([]);
  const [running, setRunning] = useState(false);
  const [liveAction, setLiveAction] = useState<string | null>(null);
  const [streamingText, setStreamingText] = useState<string>("");
  const streamingRef = useRef<string>(""); // always-current mirror of streamingText for use in callbacks
  const [theme, setTheme] = useState<"dark" | "light">("dark");
  const [showAuth, setShowAuth] = useState(false);
  const [showGitHub, setShowGitHub] = useState(false);
  const [showNewProject, setShowNewProject] = useState(false);
  const [terminalOpen, setTerminalOpen] = useState(false);
  const [activeRunId, setActiveRunId] = useState<string | null>(null);
  const [sessions, setSessions] = useState<ChatSession[]>([]);
  const [activeSessionId, setActiveSessionId] = useState<string | null>(null);
  const activeSessionIdRef = useRef<string | null>(null); // always current, safe in closures
  useEffect(() => { activeSessionIdRef.current = activeSessionId; }, [activeSessionId]);
  const [chatWidth, setChatWidth] = useState(480);
  const [topicWidth, setTopicWidth] = useState(200);
  const [filesOpen, setFilesOpen] = useState(false);
  const [sidebarWidth, setSidebarWidth] = useState(220);
  const [confirmPending, setConfirmPending] = useState<{
    confirmId: string; message: string; tool: string;
  } | null>(null);
  const [attachedFiles, setAttachedFiles] = useState<string[]>([]);
  const [availableFiles, setAvailableFiles] = useState<string[]>([]);

  const thinkingTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const logsRef = useRef<LogEntry[]>([]);
  logsRef.current = logs;

  // ── Theme ────────────────────────────────────────────────────────────
  useEffect(() => {
    document.documentElement.classList.toggle("light", theme === "light");
    localStorage.setItem("theme", theme);
  }, [theme]);
  useEffect(() => {
    const s = localStorage.getItem("theme") as "dark" | "light" | null;
    if (s) setTheme(s);
  }, []);

  // ── Init project ─────────────────────────────────────────────────────
  useEffect(() => {
    api("/projects").then((allProjects: Project[]) => {
      setProjects(allProjects);
      const existing = localStorage.getItem("last_project_id");
      // Only restore if the project still exists
      const found = existing ? allProjects.find(p => p.id === existing) : null;
      if (found) {
        setPid(found.id);
        setProjectName(found.name);
      } else if (allProjects.length > 0) {
        // Fall back to the most recent project
        const latest = allProjects[0];
        setPid(latest.id);
        setProjectName(latest.name);
        localStorage.setItem("last_project_id", latest.id);
        localStorage.setItem("last_project_name", latest.name);
      }
      // No auto-creation — user creates projects explicitly via "New project"
    }).catch(() => {});
  }, []);

  const loadFiles = useCallback(async () => {
    if (!pid) return;
    try {
      const data = await api(`/projects/${pid}/files`);
      const root: FNode[] = [];
      const map = new Map<string, FNode>();
      for (const e of data) {
        const n: FNode = { name: e.name, type: e.type, path: e.path, size: e.size };
        if (n.type === "directory") n.children = [];
        map.set(e.path, n);
      }
      for (const e of data) {
        const n = map.get(e.path)!;
        const pp = e.path.includes("/") ? e.path.substring(0, e.path.lastIndexOf("/")) : "";
        if (pp && map.has(pp)) map.get(pp)!.children!.push(n);
        else root.push(n);
      }
      setFiles(root);
      // Sync flat path list for the file-attach picker in the composer
      const flat: string[] = [];
      const walk = (ns: FNode[]) => { for (const n of ns) { if (n.type === "file") flat.push(n.path); if (n.children) walk(n.children); } };
      walk(root);
      setAvailableFiles(flat);
    } catch {}
  }, [pid]);
  useEffect(() => { if (pid) { loadFiles(); loadSessions(); } }, [loadFiles, pid]);

  const loadSessions = useCallback(async () => {
    try {
      // Load ALL sessions across all projects — chat owns the conversation now
      const data: ChatSession[] = pid
        ? await api(`/projects/${pid}/sessions`)
        : [];
      setSessions(data);
      // Auto-select and load the most recent session on first load
      // But never overwrite logs while an agent run is active
      if (data.length > 0 && !activeSessionIdRef.current) {
        const latest = data[0];
        activeSessionIdRef.current = latest.id;
        setActiveSessionId(latest.id);
        // Load its messages
        api(`/agent/logs/${latest.id}`).then(d => {
          const entries: LogEntry[] = (d.messages || [])
            .map((m: { role: string; content: string; timestamp: string }) => {
              // Skip internal JSON status messages stored by the backend
              if (m.role === "assistant") {
                try {
                  const parsed = JSON.parse(m.content);
                  if (parsed.status || parsed.steps !== undefined) return null;
                } catch {}
              }
              return {
                type: m.role === "user" ? "user" as const : "agent" as const,
                message: m.content,
                time: m.timestamp ? new Date(m.timestamp).toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" }) : "",
              };
            })
            .filter(Boolean) as LogEntry[];
          setLogs(entries);
        }).catch(() => {});
      }
    } catch {}
  }, [pid]);

  // "New chat" just resets the UI — the backend creates the DB session
  // when the first real message is sent. No API call here.
  const handleNewSession = () => {
    setActiveSessionId(null);
    setLogs([]);
  };

  const handleSessionSelect = (session: ChatSession) => {
    if (session.id === activeSessionId) return;
    setActiveSessionId(session.id);
    setLogs([]);
    // Load messages for this session
    api(`/agent/logs/${session.id}`).then(data => {
      const entries: LogEntry[] = (data.messages || [])
        .map((m: { role: string; content: string; timestamp: string }) => {
          if (m.role === "assistant") {
            try {
              const p = JSON.parse(m.content);
              if (p.status || p.steps !== undefined) return null;
            } catch {}
          }
          return {
            type: m.role === "user" ? "user" as const : "agent" as const,
            message: m.content,
            time: m.timestamp ? new Date(m.timestamp).toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" }) : "",
          };
        })
        .filter(Boolean) as LogEntry[];
      setLogs(entries);
    }).catch(() => {});
  };

  // Auto-refresh while agent is running
  useEffect(() => {
    if (!running || !pid) return;
    const id = setInterval(loadFiles, 2000);
    return () => clearInterval(id);
  }, [running, pid, loadFiles]);

  const handleOpenFile = async (path: string) => {
    if (!pid) return;
    try {
      const d = await api(`/projects/${pid}/files/${encodeURIComponent(path)}`);
      setActiveFile(path); setEditorContent(d.content); setDirty(false);
    } catch {}
  };

  const handleSaveFile = async () => {
    if (!pid || !activeFile || !dirty) return;
    try {
      await fetch(`/api/projects/${pid}/files/${encodeURIComponent(activeFile)}`, {
        method: "PUT", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ content: editorContent }),
      });
      setDirty(false); loadFiles();
    } catch { toast.error("Save failed"); }
  };

  useEffect(() => {
    const h = (e: KeyboardEvent) => { if ((e.metaKey || e.ctrlKey) && e.key === "s") { e.preventDefault(); handleSaveFile(); } };
    window.addEventListener("keydown", h); return () => window.removeEventListener("keydown", h);
  }, [activeFile, editorContent, dirty]);

  const handleSubmit = () => {
    const msg = prompt.trim();
    if (!msg || running) return;
    setPrompt("");
    setAttachedFiles([]);
    handleRun(msg);
  };

  const resolveConfirm = async (approved: boolean) => {
    if (!confirmPending) return;
    const { confirmId } = confirmPending;
    setConfirmPending(null);
    await fetch(`http://localhost:8000/agent/confirm/${confirmId}`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ approved }),
    });
  };

  const handleCancel = async () => {
    if (activeRunId) await fetch(`/api/agent/cancel/${activeRunId}`, { method: "POST" });
    setRunning(false); setActiveRunId(null); setLiveAction(null);
  };

  const handleRun = (message: string) => {
    if (running) return;
    streamingRef.current = "";
    setStreamingText("");
    setRunning(true); setActiveRunId(null);
    if (thinkingTimer.current) clearTimeout(thinkingTimer.current);

    // Show the user's message immediately in the chat
    setLogs(p => [...p, { type: "user", message, time: now() }]);

    const history = logsRef.current
      .slice(-10)
      .filter(l => l.type === "user" || l.type === "agent")
      .map(l => ({ role: l.type === "user" ? "user" as const : "assistant" as const, content: l.message }));

    streamAgent(pid, message, activeFile, history,
      (event, data) => {
        const d = (typeof data === "object" ? data : {}) as Record<string, unknown>;
        const msg = (d.message as string) || (d.error as string) || (typeof data === "string" ? data : "");
        if (d.task_id) setActiveRunId(d.task_id as string);
        // Pin to the session the backend created (use ref to avoid stale closure)
        if (d.session_id && !activeSessionIdRef.current) {
          const sid = d.session_id as string;
          activeSessionIdRef.current = sid;
          setActiveSessionId(sid);
          setSessions(prev =>
            prev.some(s => s.id === sid)
              ? prev
              : [{ id: sid, title: "New chat", created_at: new Date().toISOString() }, ...prev]
          );
        }

        // Done event carries the AI-generated title — update the sidebar
        if ((event as string) === "done" && d.session_id && d.session_title) {
          const sid = d.session_id as string;
          const title = d.session_title as string;
          setSessions(prev => prev.map(s => s.id === sid ? { ...s, title } : s));
        }

        if ((event as string) === "token_chunk") {
          const chunk = (d.chunk as string) ?? msg;
          streamingRef.current += chunk;
          setStreamingText(prev => prev + chunk);
          return;
        }

        if ((event as string) === "token_end") {
          // Use functional updater so we always get the latest streamingText value
          setStreamingText(prev => {
            const text = prev || streamingRef.current;
            if (text) {
              // Schedule log update outside the setState call
              setTimeout(() => {
                setLogs(p => [...p, { type: "agent" as const, message: text, time: now() }]);
              }, 0);
            }
            streamingRef.current = "";
            return "";
          });
          return;
        }

        if ((event as string) === "stream_discard") {
          streamingRef.current = "";
          setStreamingText("");
          return;
        }

        if (event === "action") {
          if ((event as string) === "confirm") {
            // Agent is requesting approval for a destructive action — show modal
            setConfirmPending({
              confirmId: d.confirm_id as string,
              message: d.message as string,
              tool: d.tool as string,
            });
            return;
          }

          if ((event as string) === "file_delete") {
            // File was deleted — refresh explorer
            const path = d.path as string;
            if (path === activeFile) { setActiveFile(null); setEditorContent(""); }
            setTimeout(loadFiles, 300);
            setLogs(p => [...p, { type: "status" as const, status: "completed", message: `Deleted ${path}`, files: [], time: now() }]);
            return;
          }

          // Update the live indicator
          setLiveAction(msg);
          // Don't auto-clear — liveAction stays until run ends or new action arrives

          // Only show WRITE actions as chat entries — Reading is just context-building
          // and would spam every message with "⚙ Reading [active file]..."
          if (msg.startsWith("Writing ")) {
            setLogs(p => {
              const last = p[p.length - 1];
              if (last?.type === "agent" && last.message === `⚙ ${msg}`) return p;
              return [...p, { type: "agent", message: `⚙ ${msg}`, time: now() }];
            });
          }

          // Pre-open file in editor the moment agent starts writing it
          const writeMatch = msg.match(/^Writing (.+)$/);
          if (writeMatch) setActiveFile(writeMatch[1]);

        } else if (event === "file_update") {
          const path = d.path as string;
          const content = d.content as string ?? "";
          if (path) {
            setActiveFile(path);
            setEditorContent(content);
            setDirty(false);
          }
          // Replace the "⚙ Writing X" message with a completed file card
          setLogs(p => {
            const filtered = p.filter(l => l.message !== `⚙ Writing ${path}`);
            return [...filtered, {
              type: "status" as const,
              status: "completed",
              message: path,
              files: [{ path, size: content.length }],
              time: now(),
            }];
          });
          setTimeout(loadFiles, 300);

        } else if (event === "status") {
          const statusFiles = (d.files as { path: string; size: number }[] | undefined) || [];
          if (statusFiles.length > 0) setActiveFile(statusFiles[0].path);
          // Skip "executing" cards — the action events already show what's happening
          if (d.status === "executing" && !d.plan) return;
          setLogs(p => [...p, {
            type: "status" as const,
            status: d.status as string,
            message: msg,
            files: statusFiles,
            agent: d.agent as string,
            time: now(),
            plan: d.plan as { action: string; description: string; agent: string }[] | undefined,
          }]);

        } else if (event === "token") {
          setLogs(p => [...p, { type: "agent", message: msg, time: now() }]);
        }
      },
      (error) => {
        setStreamingText("");
        setLogs(p => [...p, { type: "error", message: error, time: now() }]);
        setRunning(false); setActiveRunId(null); setLiveAction(null);
        if (thinkingTimer.current) clearTimeout(thinkingTimer.current);
        loadFiles();
      },
      () => {
        streamingRef.current = "";
        setStreamingText("");
        setRunning(false); setActiveRunId(null); setLiveAction(null);
        if (thinkingTimer.current) clearTimeout(thinkingTimer.current);
        loadFiles();
        // Don't call loadSessions() here — the done event already carries
        // session_title and updates the sidebar. Reloading from DB would
        // race with the uncommitted title and show the raw message instead.
      },
      activeSessionIdRef.current, // always current — avoids stale closure
    );
  };

  const handleProjectSelect = (p: Project) => {
    setPid(p.id); setProjectName(p.name); setFiles([]); setLogs([]);
    setActiveFile(null); setEditorContent(""); setDirty(false);
    localStorage.setItem("last_project_id", p.id);
    localStorage.setItem("last_project_name", p.name);
  };

  const handleNewProject = () => setShowNewProject(true);

  const createProject = async (name: string, description: string) => {
    const p = await api("/projects", { method: "POST", body: { name, description } });
    setProjects(prev => [p, ...prev]);
    handleProjectSelect(p);
    return p;
  };

  return (
    <div className="h-screen flex flex-col bg-bg overflow-hidden">
      <Header
        user={user} theme={theme} projects={projects} currentPid={pid}
        onProjectSelect={handleProjectSelect} onNewProject={handleNewProject}
        onLinkGitHub={() => setShowGitHub(true)}
        onThemeToggle={() => setTheme(t => t === "dark" ? "light" : "dark")}
        onSignIn={() => setShowAuth(true)}
      />

      {/*
        LAYOUT:
        • Default:  [Topics 200px] | [Chat fills rest]
        • Coding:   [Topics 200px] | [Chat 320px] | [Editor fills rest]
        Editor appears automatically when a file is open / agent starts writing.
      */}
      <div className="flex-1 flex overflow-hidden min-h-0">

        {/* 1. TOPICS — resizable */}
        <div className="flex-none flex flex-col h-full" style={{ width: topicWidth }}>
          <ChatHistoryPanel
            sessions={sessions}
            activeSessionId={activeSessionId}
            runningSessionId={running ? activeSessionId : null}
            onSessionSelect={handleSessionSelect}
            onNewSession={handleNewSession}
          />
        </div>
        <ResizeHandle onMouseDown={(e) => {
          e.preventDefault();
          const startX = e.clientX; const startW = topicWidth;
          const onMove = (ev: MouseEvent) => setTopicWidth(Math.min(360, Math.max(160, startW + (ev.clientX - startX))));
          const onUp = () => { window.removeEventListener("mousemove", onMove); window.removeEventListener("mouseup", onUp); };
          window.addEventListener("mousemove", onMove); window.addEventListener("mouseup", onUp);
        }} />

        {/* 2. CHAT — fills all space when no file is open */}
        <div
          className="flex flex-col border-r border-border min-w-0"
          style={{ width: activeFile ? chatWidth : undefined, flex: activeFile ? "none" : 1 }}
        >
          <ConversationPanel
            sessions={sessions}
            activeSessionId={activeSessionId}
            onSessionSelect={handleSessionSelect}
            onNewSession={handleNewSession}
            logs={logs}
            running={running}
            liveAction={liveAction}
            streamingText={streamingText}
            connected={true}
            prompt={prompt}
            onPromptChange={setPrompt}
            onSubmit={handleSubmit}
            onCancel={handleCancel}
            onFileOpen={handleOpenFile}
            availableFiles={availableFiles}
            onAttachFile={(path) => setAttachedFiles(f => f.includes(path) ? f : [...f, path])}
            attachedFiles={attachedFiles}
            onRemoveFile={(path) => setAttachedFiles(f => f.filter(x => x !== path))}
            collapsed={false}
            onToggleCollapse={() => {}}
            width={activeFile ? chatWidth : 9999}
          />
        </div>

        {/* 3. EDITOR — only visible when a file is open */}
        {activeFile && (
          <>
            <ResizeHandle onMouseDown={(e) => {
              e.preventDefault();
              const startX = e.clientX; const startW = chatWidth;
              const onMove = (ev: MouseEvent) => setChatWidth(Math.min(600, Math.max(260, startW + (ev.clientX - startX))));
              const onUp = () => { window.removeEventListener("mousemove", onMove); window.removeEventListener("mouseup", onUp); };
              window.addEventListener("mousemove", onMove); window.addEventListener("mouseup", onUp);
            }} />

            {/* Editor area — relative so file overlay can position absolutely */}
            <div className="flex-1 flex min-w-0 overflow-hidden relative">

              {/* File explorer — hover overlay, auto-hides on mouse leave */}
              {filesOpen && (
                <div
                  className="absolute inset-y-0 left-0 z-20 shadow-2xl"
                  onMouseLeave={() => setFilesOpen(false)}
                  style={{ width: sidebarWidth }}
                >
                  <div className="border-r border-border bg-surface h-full overflow-hidden">
                    <Sidebar
                      collapsed={false}
                      onToggleCollapse={() => setFilesOpen(false)}
                      files={files}
                      activeFile={activeFile}
                      filesLoading={false}
                      onFileSelect={(path) => { handleOpenFile(path); setFilesOpen(false); }}
                      onRefreshFiles={loadFiles}
                    />
                  </div>
                </div>
              )}

              {/* Monaco editor + toolbar */}
              <div className="flex-1 flex flex-col min-w-0 overflow-hidden">
                <div className="h-7 border-b border-border bg-surface flex items-center px-2 gap-2 shrink-0">
                  <button
                    onMouseEnter={() => files.length > 0 && setFilesOpen(true)}
                    onClick={() => setFilesOpen(o => !o)}
                    className="flex items-center gap-1.5 px-2 py-0.5 rounded text-[11px] text-text-muted hover:text-text hover:bg-surface-2 transition-colors"
                    title="Hover to browse files"
                  >
                    <svg className="w-3.5 h-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.5}>
                      <path strokeLinecap="round" strokeLinejoin="round" d="M2.25 12.75V12A2.25 2.25 0 014.5 9.75h15A2.25 2.25 0 0121.75 12v.75m-8.69-6.44l-2.12-2.12a1.5 1.5 0 00-1.061-.44H4.5A2.25 2.25 0 002.25 6v12a2.25 2.25 0 002.25 2.25h15A2.25 2.25 0 0021.75 18V9a2.25 2.25 0 00-2.25-2.25h-5.379a1.5 1.5 0 01-1.06-.44z" />
                    </svg>
                    {files.length > 0 && `${flattenFiles(files).length} files`}
                  </button>
                  <span className="text-[11px] text-text-muted font-mono truncate flex-1">{activeFile}</span>
                  <button onClick={() => setTerminalOpen(o => !o)} className={`px-2 py-0.5 rounded text-[11px] transition-colors ${terminalOpen ? "text-accent bg-accent/10" : "text-text-muted hover:text-text hover:bg-surface-2"}`}>
                    Terminal
                  </button>
                  <button
                    onClick={() => { setActiveFile(null); setEditorContent(""); setDirty(false); }}
                    title="Close editor"
                    className="w-5 h-5 flex items-center justify-center rounded text-text-muted hover:text-text hover:bg-surface-2 transition-colors"
                  >
                    <svg className="w-3 h-3" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                      <path strokeLinecap="round" strokeLinejoin="round" d="M6 18L18 6M6 6l12 12" />
                    </svg>
                  </button>
                </div>
                <div className="flex-1 min-h-0">
                  <EditorPane
                    theme={theme}
                    activeFile={activeFile}
                    content={editorContent}
                    dirty={dirty}
                    onChange={v => { setEditorContent(v || ""); setDirty(true); }}
                    onSave={handleSaveFile}
                    onSuggestion={handleRun}
                  />
                </div>
                {terminalOpen && (
                  <TerminalPanel open={terminalOpen} onToggle={() => setTerminalOpen(false)} projectId={pid} />
                )}
              </div>
            </div>
          </>
        )}

      </div>

      {confirmPending && (
        <ConfirmModal
          message={confirmPending.message}
          tool={confirmPending.tool}
          onApprove={() => resolveConfirm(true)}
          onReject={() => resolveConfirm(false)}
        />
      )}

      {showNewProject && (
        <NewProjectModal
          onClose={() => setShowNewProject(false)}
          onCreate={createProject}
          onConnectGitHub={(projectId) => { setPid(projectId); setShowGitHub(true); }}
        />
      )}

      {showAuth && <AuthModal theme={theme} onClose={() => setShowAuth(false)} onLogin={login} />}
      {showGitHub && pid && (
        <GitHubModal
          projectId={pid}
          onClose={() => setShowGitHub(false)}
          onSuccess={() => { setShowGitHub(false); loadFiles(); }}
        />
      )}
    </div>
  );
}

function now() { return new Date().toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" }); }

function flattenFiles(nodes: FNode[]): string[] {
  const paths: string[] = [];
  const walk = (ns: FNode[]) => { for (const n of ns) { if (n.type === "file") paths.push(n.path); if (n.children) walk(n.children); } };
  walk(nodes);
  return paths;
}

// ── ChatHistoryPanel — left sidebar showing past conversations ─────────────────

function ChatHistoryPanel({ sessions, activeSessionId, runningSessionId, onSessionSelect, onNewSession }: {
  sessions: ChatSession[];
  activeSessionId: string | null;
  runningSessionId: string | null;
  onSessionSelect: (s: ChatSession) => void;
  onNewSession: () => void;
}) {
  return (
    <div className="w-full border-r border-border bg-surface flex flex-col h-full">
      {/* Header */}
      <div className="h-9 px-3 flex items-center justify-between border-b border-border shrink-0">
        <span className="text-[10px] font-semibold text-text-muted uppercase tracking-widest">Chats</span>
        <button
          onClick={onNewSession}
          title="New chat"
          className="w-6 h-6 flex items-center justify-center rounded text-text-muted hover:text-text hover:bg-surface-2 transition-colors"
        >
          <svg className="w-3.5 h-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
            <path strokeLinecap="round" strokeLinejoin="round" d="M12 4.5v15m7.5-7.5h-15" />
          </svg>
        </button>
      </div>

      {/* Conversation list */}
      <div className="flex-1 overflow-y-auto py-1">
        {sessions.length === 0 ? (
          <p className="text-[11px] text-text-muted text-center px-3 py-8 leading-relaxed">
            No chats yet.<br />Start a conversation.
          </p>
        ) : (
          sessions.map(s => {
            const isActive = s.id === activeSessionId;
            const isRunning = s.id === runningSessionId;
            return (
              <button
                key={s.id}
                onClick={() => onSessionSelect(s)}
                className={`w-full text-left px-3 py-2 text-[12px] transition-colors flex items-center gap-2 ${
                  isActive
                    ? "bg-accent/10 text-accent"
                    : "text-text-secondary hover:bg-surface-2 hover:text-text"
                }`}
                title={s.title}
              >
                {isRunning ? (
                  /* Spinning dots when this chat is processing */
                  <span className="flex gap-0.5 shrink-0">
                    {[0, 150, 300].map(d => (
                      <span key={d} className="w-1 h-1 rounded-full bg-accent animate-bounce" style={{ animationDelay: `${d}ms` }} />
                    ))}
                  </span>
                ) : (
                  <span className={`w-1 h-1 rounded-full shrink-0 ${isActive ? "bg-accent" : "bg-transparent"}`} />
                )}
                <span className="truncate flex-1">{s.title}</span>
              </button>
            );
          })
        )}
      </div>
    </div>
  );
}
