"use client";

import { useState } from "react";
import type { FNode } from "./FileExplorer";

export type { FNode };

// ── Types ──────────────────────────────────────────────────────────────────

export interface Project {
  id: string;
  name: string;
  github_repo: string | null;
  created_at: string;
}

interface SidebarProps {
  collapsed: boolean;
  onToggleCollapse: () => void;
  files: FNode[];
  activeFile: string | null;
  filesLoading: boolean;
  onFileSelect: (path: string) => void;
  onRefreshFiles: () => void;
}

// ── Component ──────────────────────────────────────────────────────────────

export function Sidebar(props: SidebarProps) {
  if (props.collapsed) {
    return <CollapsedStrip onExpand={props.onToggleCollapse} />;
  }
  return <FilePanel {...props} />;
}

// ── Collapsed strip ────────────────────────────────────────────────────────

function CollapsedStrip({ onExpand }: { onExpand: () => void }) {
  return (
    <div className="w-full h-full flex flex-col items-center pt-2 gap-3 bg-surface">
      <button
        onClick={onExpand}
        title="Expand"
        className="w-6 h-6 flex items-center justify-center rounded text-text-muted hover:text-text hover:bg-surface-2 transition-colors"
      >
        <svg className="w-3.5 h-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
          <path strokeLinecap="round" strokeLinejoin="round" d="M9 5l7 7-7 7" />
        </svg>
      </button>
      <span
        className="text-[10px] font-semibold text-text-muted uppercase tracking-widest select-none"
        style={{ writingMode: "vertical-rl", transform: "rotate(180deg)" }}
      >
        Files
      </span>
    </div>
  );
}

// ── Full file panel ────────────────────────────────────────────────────────

function FilePanel({
  onToggleCollapse,
  files,
  activeFile,
  filesLoading,
  onFileSelect,
  onRefreshFiles,
}: SidebarProps) {
  const fileCount = countFiles(files);

  return (
    <div className="w-full h-full flex flex-col bg-surface">
      {/* Header */}
      <div className="h-9 px-3 flex items-center justify-between border-b border-border shrink-0">
        <span className="text-[10px] font-semibold text-text-muted uppercase tracking-widest">
          Files
        </span>
        <div className="flex items-center gap-1">
          <button
            onClick={onRefreshFiles}
            title="Refresh"
            className="w-6 h-6 flex items-center justify-center rounded text-text-muted hover:text-text-secondary hover:bg-surface-2 transition-colors"
          >
            <RefreshIcon spinning={filesLoading} />
          </button>
          <button
            onClick={onToggleCollapse}
            title="Collapse"
            className="w-6 h-6 flex items-center justify-center rounded text-text-muted hover:text-text-secondary hover:bg-surface-2 transition-colors"
          >
            <svg className="w-3.5 h-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
              <path strokeLinecap="round" strokeLinejoin="round" d="M15 19l-7-7 7-7" />
            </svg>
          </button>
        </div>
      </div>

      {/* Tree */}
      <div className="flex-1 overflow-y-auto py-1">
        {files.length === 0 ? (
          <p className="text-[11px] text-text-muted px-3 py-8 text-center leading-relaxed">
            Files created by the agent will appear here
          </p>
        ) : (
          <FileTree nodes={files} activeFile={activeFile} onSelect={onFileSelect} depth={0} />
        )}
      </div>

      {/* Footer */}
      {fileCount > 0 && (
        <div className="px-3 py-2 border-t border-border shrink-0">
          <span className="text-[10px] text-text-muted">
            {fileCount} {fileCount === 1 ? "file" : "files"}
          </span>
        </div>
      )}
    </div>
  );
}

// ── File tree ──────────────────────────────────────────────────────────────

function FileTree({
  nodes,
  activeFile,
  onSelect,
  depth,
}: {
  nodes: FNode[];
  activeFile: string | null;
  onSelect: (path: string) => void;
  depth: number;
}) {
  return (
    <>
      {nodes.map((node) =>
        node.type === "directory" ? (
          <FolderRow
            key={node.path}
            node={node}
            activeFile={activeFile}
            onSelect={onSelect}
            depth={depth}
          />
        ) : (
          <FileRow
            key={node.path}
            node={node}
            active={activeFile === node.path}
            onSelect={onSelect}
            depth={depth}
          />
        )
      )}
    </>
  );
}

function FolderRow({
  node,
  activeFile,
  onSelect,
  depth,
}: {
  node: FNode;
  activeFile: string | null;
  onSelect: (path: string) => void;
  depth: number;
}) {
  // Root-level folders start open; nested start closed
  const [open, setOpen] = useState(depth === 0);

  return (
    <div>
      <button
        onClick={() => setOpen((o) => !o)}
        className="w-full flex items-center gap-1.5 py-0.5 text-[12px] text-text-secondary hover:bg-surface-2 hover:text-text transition-colors rounded-sm"
        style={{ paddingLeft: `${8 + depth * 12}px`, paddingRight: 8 }}
      >
        <svg
          className={`w-3 h-3 shrink-0 text-text-muted transition-transform duration-100 ${open ? "rotate-90" : ""}`}
          fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}
        >
          <path strokeLinecap="round" strokeLinejoin="round" d="M9 5l7 7-7 7" />
        </svg>
        <FolderIcon className="w-3.5 h-3.5 shrink-0 text-warning/70" />
        <span className="truncate font-mono">{node.name}</span>
      </button>

      {open && node.children && (
        <FileTree
          nodes={node.children}
          activeFile={activeFile}
          onSelect={onSelect}
          depth={depth + 1}
        />
      )}
    </div>
  );
}

function FileRow({
  node,
  active,
  onSelect,
  depth,
}: {
  node: FNode;
  active: boolean;
  onSelect: (path: string) => void;
  depth: number;
}) {
  return (
    <button
      onClick={() => onSelect(node.path)}
      className={`
        w-full flex items-center gap-1.5 py-0.5 text-[12px] transition-colors rounded-sm
        ${active ? "bg-accent/10 text-accent" : "text-text-secondary hover:bg-surface-2 hover:text-text"}
      `}
      style={{ paddingLeft: `${8 + depth * 12}px`, paddingRight: 8 }}
    >
      <FileIcon className="w-3.5 h-3.5 shrink-0 text-text-muted" />
      <span className="truncate font-mono">{node.name}</span>
    </button>
  );
}

function countFiles(nodes: FNode[]): number {
  let count = 0;
  for (const n of nodes) {
    if (n.type === "file") count++;
    if (n.children) count += countFiles(n.children);
  }
  return count;
}

// ── Icons ──────────────────────────────────────────────────────────────────

function RefreshIcon({ spinning }: { spinning: boolean }) {
  return (
    <svg className={`w-3 h-3 ${spinning ? "animate-spin" : ""}`} fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
      <path strokeLinecap="round" strokeLinejoin="round" d="M16.023 9.348h4.992v-.001M2.985 19.644v-4.992m0 0h4.992m-4.993 0l3.181 3.183a8.25 8.25 0 0013.803-3.7M4.031 9.865a8.25 8.25 0 0113.803-3.7l3.181 3.182" />
    </svg>
  );
}

function FolderIcon({ className }: { className?: string }) {
  return (
    <svg className={className} fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.5}>
      <path strokeLinecap="round" strokeLinejoin="round" d="M2.25 12.75V12A2.25 2.25 0 014.5 9.75h15A2.25 2.25 0 0121.75 12v.75m-8.69-6.44l-2.12-2.12a1.5 1.5 0 00-1.061-.44H4.5A2.25 2.25 0 002.25 6v12a2.25 2.25 0 002.25 2.25h15A2.25 2.25 0 0021.75 18V9a2.25 2.25 0 00-2.25-2.25h-5.379a1.5 1.5 0 01-1.06-.44z" />
    </svg>
  );
}

function FileIcon({ className }: { className?: string }) {
  return (
    <svg className={className} fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.5}>
      <path strokeLinecap="round" strokeLinejoin="round" d="M19.5 14.25v-2.625a3.375 3.375 0 00-3.375-3.375h-1.5A1.125 1.125 0 0113.5 7.125v-1.5a3.375 3.375 0 00-3.375-3.375H8.25m2.25 0H5.625c-.621 0-1.125.504-1.125 1.125v17.25c0 .621.504 1.125 1.125 1.125h12.75c.621 0 1.125-.504 1.125-1.125V11.25a9 9 0 00-9-9z" />
    </svg>
  );
}
