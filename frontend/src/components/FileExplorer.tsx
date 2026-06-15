"use client";

export interface FNode {
  name: string;
  type: "file" | "directory";
  path: string;
  size: number;
  children?: FNode[];
}

interface FileExplorerProps {
  files: FNode[];
  activeFile: string | null;
  loading: boolean;
  onSelect: (path: string) => void;
  onRefresh: () => void;
}

export function FileExplorer({ files, activeFile, loading, onSelect, onRefresh }: FileExplorerProps) {
  const fileCount = countFiles(files);

  return (
    <div className="w-52 border-r border-border flex flex-col shrink-0 bg-surface">
      {/* Panel header */}
      <div className="h-9 px-3 flex items-center justify-between border-b border-border shrink-0">
        <span className="text-[10px] font-semibold text-text-muted uppercase tracking-widest">Files</span>
        <button
          onClick={onRefresh}
          title="Refresh"
          className="w-5 h-5 flex items-center justify-center rounded text-text-muted hover:text-text-secondary transition-colors"
        >
          <RefreshIcon spinning={loading} />
        </button>
      </div>

      {/* Tree */}
      <div className="flex-1 overflow-y-auto py-1">
        {files.length === 0 ? (
          <EmptyState />
        ) : (
          <FileTree nodes={files} activeFile={activeFile} onSelect={onSelect} depth={0} />
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

// ── Sub-components ─────────────────────────────────────────────────────────

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
      {nodes.map((node) => (
        <div key={node.path}>
          <button
            onClick={() => node.type === "file" && onSelect(node.path)}
            disabled={node.type === "directory"}
            className={`
              w-full flex items-center gap-1.5 py-0.5 text-[12px] transition-colors rounded-sm
              disabled:cursor-default
              ${activeFile === node.path
                ? "bg-accent/10 text-accent"
                : "text-text-secondary hover:bg-surface-2 hover:text-text"}
            `}
            style={{ paddingLeft: `${8 + depth * 12}px`, paddingRight: 8 }}
          >
            {node.type === "directory" ? (
              <FolderIcon className="w-3.5 h-3.5 shrink-0 text-warning/60" />
            ) : (
              <FileIcon className="w-3.5 h-3.5 shrink-0 text-text-muted" />
            )}
            <span className="truncate font-mono">{node.name}</span>
          </button>

          {node.children && (
            <FileTree
              nodes={node.children}
              activeFile={activeFile}
              onSelect={onSelect}
              depth={depth + 1}
            />
          )}
        </div>
      ))}
    </>
  );
}

function EmptyState() {
  return (
    <div className="px-4 py-10 text-center">
      <p className="text-[11px] text-text-muted leading-relaxed">
        Files created by the agent will appear here
      </p>
    </div>
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
    <svg
      className={`w-3 h-3 ${spinning ? "animate-spin" : ""}`}
      fill="none"
      viewBox="0 0 24 24"
      stroke="currentColor"
      strokeWidth={2}
    >
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
