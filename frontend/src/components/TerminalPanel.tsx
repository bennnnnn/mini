"use client";

import { useEffect, useRef, useState, useCallback } from "react";

// xterm accesses `self` at module scope — must be lazy-imported inside useEffect
// so it never runs during Next.js SSR.
type XTerminal = import("xterm").Terminal;

interface TerminalTab {
  id: string;
  title: string;
  terminal: XTerminal;
  ws: WebSocket;
}

interface TerminalPanelProps {
  open: boolean;
  onToggle: () => void;
  projectId: string | null;
}

export function TerminalPanel({ open, onToggle, projectId }: TerminalPanelProps) {
  const containerRef = useRef<HTMLDivElement>(null);
  const [tabs, setTabs] = useState<TerminalTab[]>([]);
  const [activeTabId, setActiveTabId] = useState<string | null>(null);
  const [cssLoaded, setCssLoaded] = useState(false);
  const tabsRef = useRef<TerminalTab[]>([]);
  tabsRef.current = tabs;

  // Load xterm CSS once on mount (client-only)
  useEffect(() => {
    if (cssLoaded) return;
    import("xterm/css/xterm.css" as string).then(() => setCssLoaded(true)).catch(() => setCssLoaded(true));
  }, [cssLoaded]);

  // Re-attach active terminal to DOM when panel opens or tab switches
  useEffect(() => {
    if (!open || tabs.length === 0) return;
    const active = tabs.find(t => t.id === activeTabId);
    if (active) {
      const timer = setTimeout(() => {
        if (containerRef.current && !containerRef.current.contains(active.terminal.element!)) {
          containerRef.current.innerHTML = "";
          active.terminal.open(containerRef.current);
          try { (active.terminal as any)._fitAddon?.fit(); } catch {}
        }
      }, 50);
      return () => clearTimeout(timer);
    }
  }, [open, activeTabId, tabs]);

  const spawnTab = useCallback(async () => {
    if (!projectId || !containerRef.current) return;

    // Lazy-import xterm only in the browser
    const { Terminal } = await import("xterm");
    const { FitAddon } = await import("@xterm/addon-fit");
    const { WebLinksAddon } = await import("@xterm/addon-web-links");

    const id = crypto.randomUUID();
    const term = new Terminal({
      cursorBlink: true,
      fontSize: 13,
      fontFamily: "'JetBrains Mono', 'Fira Code', Menlo, monospace",
      theme: {
        background: "#0a0a0a",
        foreground: "#d4d4d4",
        cursor: "#d4d4d4",
        selectionBackground: "#264f78",
        red: "#f44747",
        green: "#6a9955",
        yellow: "#dcdcaa",
        blue: "#569cd6",
        magenta: "#c586c0",
        cyan: "#4ec9b0",
        white: "#d4d4d4",
        brightWhite: "#ffffff",
      },
    });

    const fitAddon = new FitAddon();
    term.loadAddon(fitAddon);
    term.loadAddon(new WebLinksAddon());
    (term as any)._fitAddon = fitAddon;

    const proto = window.location.protocol === "https:" ? "wss:" : "ws:";
    const wsUrl = `${proto}//localhost:8000/terminal/ws/${projectId}`;
    const ws = new WebSocket(wsUrl);

    ws.onopen = () => {
      term.open(containerRef.current!);
      setTimeout(() => { try { fitAddon.fit(); } catch {} }, 50);
    };

    ws.onmessage = (ev) => {
      if (ev.data instanceof Blob) {
        ev.data.arrayBuffer().then(buf => term.write(new Uint8Array(buf)));
      } else {
        term.write(ev.data);
      }
    };

    ws.onerror = () => term.write("\r\n\x1b[31mWebSocket error — terminal backend unavailable\x1b[0m\r\n");
    ws.onclose = () => term.write("\r\n\x1b[33mConnection closed\x1b[0m\r\n");

    term.onData(data => { if (ws.readyState === WebSocket.OPEN) ws.send(data); });
    term.onResize(({ cols, rows }) => {
      if (ws.readyState === WebSocket.OPEN) ws.send(`\x1b[8;${rows};${cols}t`);
    });

    const tab: TerminalTab = { id, title: "bash", terminal: term, ws };
    setTabs(prev => [...prev, tab]);
    setActiveTabId(id);
  }, [projectId]);

  // Spawn first tab when panel opens
  useEffect(() => {
    if (open && tabs.length === 0 && projectId) spawnTab();
  }, [open, tabs.length, projectId, spawnTab]);

  // Cleanup all tabs when panel closes
  useEffect(() => {
    if (!open) {
      tabsRef.current.forEach(t => {
        try { t.ws.close(); } catch {}
        try { t.terminal.dispose(); } catch {}
      });
      setTabs([]);
      setActiveTabId(null);
    }
  }, [open]);

  const killTab = (id: string) => {
    setTabs(prev => {
      const tab = prev.find(t => t.id === id);
      if (tab) { try { tab.ws.close(); } catch {} try { tab.terminal.dispose(); } catch {} }
      const remaining = prev.filter(t => t.id !== id);
      if (activeTabId === id && remaining.length > 0) setActiveTabId(remaining[remaining.length - 1].id);
      if (remaining.length === 0) setActiveTabId(null);
      return remaining;
    });
  };

  return (
    <div className="border-t border-border bg-[#0a0a0a]">
      {/* Toggle bar */}
      <button
        onClick={onToggle}
        className="w-full flex items-center gap-2 px-4 py-1.5 text-[11px] text-text-muted hover:text-text-secondary hover:bg-[#111] transition-colors"
      >
        <svg className={`w-3 h-3 transition-transform ${open ? "rotate-90" : ""}`} fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
          <path strokeLinecap="round" strokeLinejoin="round" d="M8.25 4.5l7.5 7.5-7.5 7.5" />
        </svg>
        Terminal
        {open && tabs.length > 0 && (
          <span className="ml-1 text-[10px] text-green-500/60">{tabs.length} session{tabs.length > 1 ? "s" : ""}</span>
        )}
      </button>

      {open && (
        <div>
          {/* Tab bar */}
          <div className="flex items-center bg-[#0a0a0a] border-b border-border px-1 gap-0.5 overflow-x-auto shrink-0">
            {tabs.map(tab => (
              <div
                key={tab.id}
                onClick={() => setActiveTabId(tab.id)}
                className={`flex items-center gap-1.5 px-3 py-1 text-[11px] cursor-pointer border-r border-border shrink-0 transition-colors ${
                  tab.id === activeTabId
                    ? "bg-[#1e1e1e] text-white border-t-2 border-t-accent"
                    : "text-zinc-500 hover:text-zinc-300 hover:bg-[#111]"
                }`}
              >
                <span className="font-mono">{tab.title}</span>
                <button
                  onClick={e => { e.stopPropagation(); killTab(tab.id); }}
                  className="opacity-50 hover:opacity-100 hover:text-red-400 transition-opacity"
                >×</button>
              </div>
            ))}
            <button
              onClick={spawnTab}
              title="New terminal"
              className="w-6 h-6 flex items-center justify-center text-zinc-600 hover:text-zinc-300 hover:bg-[#1e1e1e] rounded transition-colors shrink-0"
            >
              <svg className="w-3 h-3" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                <path strokeLinecap="round" strokeLinejoin="round" d="M12 4v16m8-8H4" />
              </svg>
            </button>
          </div>

          {/* xterm container */}
          <div ref={containerRef} className="h-48 bg-[#0a0a0a] p-1" style={{ overflow: "hidden" }} />

          {/* Empty state */}
          {tabs.length === 0 && (
            <div className="h-48 bg-[#0a0a0a] flex items-center justify-center">
              <p className="text-zinc-600 text-xs font-mono">
                {projectId ? "Opening terminal..." : "Select a project first"}
              </p>
            </div>
          )}
        </div>
      )}
    </div>
  );
}
