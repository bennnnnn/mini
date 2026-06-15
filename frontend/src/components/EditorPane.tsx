"use client";

import Editor from "@monaco-editor/react";
import { useRef, useEffect } from "react";

const SUGGESTIONS = [
  "Build a FastAPI todo API",
  "Create a React login form",
  "Write a Python CLI tool",
  "Set up a Flask blog",
];

const LANG_MAP: Record<string, string> = {
  py: "python",
  js: "javascript",
  ts: "typescript",
  tsx: "typescript",
  jsx: "javascript",
  json: "json",
  yaml: "yaml",
  yml: "yaml",
  md: "markdown",
  html: "html",
  css: "css",
  sql: "sql",
  sh: "shell",
  bash: "shell",
  go: "go",
  rs: "rust",
  toml: "toml",
};

function getLanguage(filePath: string | null): string {
  if (!filePath) return "plaintext";
  const ext = filePath.split(".").pop()?.toLowerCase() ?? "";
  return LANG_MAP[ext] ?? "plaintext";
}

interface EditorPaneProps {
  activeFile: string | null;
  content: string;
  dirty: boolean;
  theme: "dark" | "light";
  onSave: () => void;
  onChange: (value: string) => void;
  onSuggestion: (text: string) => void;
}

export function EditorPane({
  activeFile,
  content,
  dirty,
  theme,
  onSave,
  onChange,
  onSuggestion,
}: EditorPaneProps) {
  if (activeFile) {
    return <ActiveEditor
      filePath={activeFile}
      content={content}
      dirty={dirty}
      theme={theme}
      onSave={onSave}
      onChange={onChange}
    />;
  }

  return <WelcomeScreen onSuggestion={onSuggestion} />;
}

// ── Active editor view ─────────────────────────────────────────────────────

function ActiveEditor({
  filePath,
  content,
  dirty,
  theme,
  onSave,
  onChange,
}: {
  filePath: string;
  content: string;
  dirty: boolean;
  theme: "dark" | "light";
  onSave: () => void;
  onChange: (v: string) => void;
}) {
  const segments = filePath.split("/");

  // Monaco fires onChange once during mount with the initial value.
  // We ignore that first event so the file isn't marked dirty immediately.
  const ignoreNextChange = useRef(true);
  useEffect(() => {
    ignoreNextChange.current = true;
  }, [filePath]);

  const handleChange = (v: string | undefined) => {
    if (ignoreNextChange.current) {
      ignoreNextChange.current = false;
      return;
    }
    onChange(v ?? "");
  };

  return (
    // h-full so Monaco's 100% height resolves against this container
    <div className="h-full flex flex-col">
      {/* Breadcrumb + save */}
      <div className="h-8 border-b border-border px-4 flex items-center gap-1 shrink-0 bg-bg">
        {segments.map((seg, i) => (
          <span key={i} className="flex items-center gap-1">
            {i > 0 && <span className="text-text-muted text-[10px]">/</span>}
            <span
              className={`text-[11px] font-mono ${
                i === segments.length - 1 ? "text-text-secondary" : "text-text-muted"
              }`}
            >
              {seg}
            </span>
          </span>
        ))}
        <div className="flex-1" />
        {dirty && (
          <button
            onClick={onSave}
            className="text-[11px] text-warning hover:text-text transition-colors"
            title="Save (⌘S / Ctrl+S)"
          >
            ● Save
          </button>
        )}
      </div>

      {/* Monaco — min-h-0 lets it shrink properly inside flex */}
      <div className="flex-1 min-h-0">
        <Editor
          key={filePath}
          height="100%"
          language={getLanguage(filePath)}
          theme={theme === "dark" ? "vs-dark" : "vs"}
          value={content}
          onChange={handleChange}
          beforeMount={(monaco) => {
            // Disable type-checking — we're a code viewer, not a full IDE.
            // Without the project's node_modules, Monaco flags valid code as errors.
            monaco.languages.typescript.typescriptDefaults.setDiagnosticsOptions({
              noSemanticValidation: true,
              noSyntaxValidation: true,
            });
            monaco.languages.typescript.javascriptDefaults.setDiagnosticsOptions({
              noSemanticValidation: true,
              noSyntaxValidation: true,
            });
          }}
          options={{
            fontSize: 13,
            fontFamily: "'JetBrains Mono', 'Fira Code', Menlo, monospace",
            minimap: { enabled: false },
            padding: { top: 16, bottom: 16 },
            scrollBeyondLastLine: false,
            lineNumbersMinChars: 3,
            renderLineHighlight: "line",
            smoothScrolling: true,
            cursorBlinking: "smooth",
            cursorSmoothCaretAnimation: "on",
            bracketPairColorization: { enabled: true },
          }}
        />
      </div>
    </div>
  );
}

// ── Welcome / empty state ──────────────────────────────────────────────────

function WelcomeScreen({ onSuggestion }: { onSuggestion: (text: string) => void }) {
  return (
    <div className="flex-1 flex flex-col items-center justify-center px-8 py-12">
      {/* Logo mark */}
      <div className="w-14 h-14 rounded-2xl bg-accent/10 border border-accent/20 flex items-center justify-center mb-6">
        <svg className="w-7 h-7 text-accent" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.5}>
          <path strokeLinecap="round" strokeLinejoin="round" d="M9.813 15.904L9 18.75l-.813-2.846a4.5 4.5 0 00-3.09-3.09L2.25 12l2.846-.813a4.5 4.5 0 003.09-3.09L9 5.25l.813 2.846a4.5 4.5 0 003.09 3.09L15.75 12l-2.846.813a4.5 4.5 0 00-3.09 3.09zM18.259 8.715L18 9.75l-.259-1.035a3.375 3.375 0 00-2.455-2.456L14.25 6l1.036-.259a3.375 3.375 0 002.455-2.456L18 2.25l.259 1.035a3.375 3.375 0 002.455 2.456L21.75 6l-1.036.259a3.375 3.375 0 00-2.455 2.456z" />
        </svg>
      </div>

      <h1 className="text-xl font-semibold text-text mb-2 text-center">What do you want to build?</h1>
      <p className="text-sm text-text-secondary mb-8 text-center max-w-sm leading-relaxed">
        Describe your project and the AI agent will write code, run tests, and create files — all automatically.
      </p>

      {/* Quick-start chips */}
      <div className="flex flex-wrap gap-2 justify-center max-w-md">
        {SUGGESTIONS.map((s) => (
          <button
            key={s}
            onClick={() => onSuggestion(s)}
            className="px-3 py-1.5 rounded-full border border-border text-sm text-text-secondary hover:bg-surface hover:text-text hover:border-border-strong transition-colors"
          >
            {s}
          </button>
        ))}
      </div>

      <p className="text-xs text-text-muted mt-8">
        ← Type in the <span className="text-text-secondary">Agent</span> panel
      </p>
    </div>
  );
}
