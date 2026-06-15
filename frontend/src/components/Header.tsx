"use client";

import { useState, useEffect, useRef } from "react";
import { useRouter } from "next/navigation";

// ── Types ──────────────────────────────────────────────────────────────────

interface User {
  id: string;
  email: string;
  name: string;
  avatar_url?: string;
}

export interface Project {
  id: string;
  name: string;
  github_repo: string | null;
  created_at: string;
}

interface HeaderProps {
  user: User | null;
  theme: "dark" | "light";
  projects: Project[];
  currentPid: string | null;
  onProjectSelect: (project: Project) => void;
  onNewProject: () => void;
  onLinkGitHub: () => void;
  onThemeToggle: () => void;
  onSignIn: () => void;
}

// ── Component ──────────────────────────────────────────────────────────────

export function Header({
  user,
  theme,
  projects,
  currentPid,
  onProjectSelect,
  onNewProject,
  onLinkGitHub,
  onThemeToggle,
  onSignIn,
}: HeaderProps) {
  const router = useRouter();
  const [dropdownOpen, setDropdownOpen] = useState(false);
  const dropdownRef = useRef<HTMLDivElement>(null);

  const currentProject = projects.find((p) => p.id === currentPid);

  // Close dropdown when clicking outside
  useEffect(() => {
    if (!dropdownOpen) return;
    const handler = (e: MouseEvent) => {
      if (dropdownRef.current && !dropdownRef.current.contains(e.target as Node)) {
        setDropdownOpen(false);
      }
    };
    document.addEventListener("mousedown", handler);
    return () => document.removeEventListener("mousedown", handler);
  }, [dropdownOpen]);

  return (
    <header className="h-11 border-b border-border bg-surface flex items-center px-4 gap-3 shrink-0 z-20">
      {/* Logo */}
      <button onClick={() => router.push("/dashboard")} className="flex items-center gap-2 shrink-0 hover:opacity-80 transition-opacity">
        <div className="w-5 h-5 rounded-md bg-accent flex items-center justify-center">
          <SparkleIcon className="w-3 h-3 text-white" />
        </div>
        <span className="text-sm font-semibold text-text tracking-tight">Mini Cursor</span>
      </button>

      <div className="w-px h-4 bg-border" />

      {/* Nav links */}
      <button onClick={() => router.push("/dashboard")} className="text-xs text-text-muted hover:text-text-secondary transition-colors">
        Dashboard
      </button>

      {/* Project picker */}
      <div className="relative" ref={dropdownRef}>
        <button
          onClick={() => setDropdownOpen((o) => !o)}
          className={`flex items-center gap-1.5 h-7 px-2.5 rounded-md text-sm transition-colors ${
            dropdownOpen
              ? "bg-surface-2 text-text"
              : "text-text-secondary hover:bg-surface-2 hover:text-text"
          }`}
        >
          <span className="max-w-40 truncate">
            {currentProject?.name ?? "Select project"}
          </span>
          <ChevronIcon open={dropdownOpen} />
        </button>

        {dropdownOpen && (
          <div className="absolute top-full left-0 mt-1 w-52 bg-surface border border-border rounded-xl shadow-xl overflow-hidden z-50">
            {/* Projects only */}
            <div className="py-1 max-h-64 overflow-y-auto">
              {projects.length === 0 ? (
                <p className="px-3 py-2 text-xs text-text-muted">No projects yet</p>
              ) : (
                projects.map((p) => (
                  <button
                    key={p.id}
                    onClick={() => { onProjectSelect(p); setDropdownOpen(false); }}
                    className={`w-full flex items-center gap-2 px-3 py-2 text-sm transition-colors ${
                      p.id === currentPid
                        ? "text-accent bg-accent/10"
                        : "text-text-secondary hover:bg-surface-2 hover:text-text"
                    }`}
                  >
                    <span className={`w-1.5 h-1.5 rounded-full shrink-0 ${p.id === currentPid ? "bg-accent" : "bg-border-strong"}`} />
                    <span className="truncate flex-1 text-left">{p.name}</span>
                    {p.id === currentPid && <CheckIcon className="w-3.5 h-3.5 text-accent shrink-0" />}
                  </button>
                ))
              )}
            </div>

            {/* GitHub connector for current project */}
            {currentProject && (
              <div className="border-t border-border">
                {currentProject.github_repo ? (
                  <button
                    onClick={() => { onLinkGitHub(); setDropdownOpen(false); }}
                    className="w-full flex items-center gap-2 px-3 py-2 hover:bg-surface-2 transition-colors"
                    title="Switch or re-connect GitHub repo"
                  >
                    <GitHubIcon className="w-3.5 h-3.5 text-success shrink-0" />
                    <span className="text-xs text-text-secondary truncate flex-1">{currentProject.github_repo}</span>
                    <svg className="w-3 h-3 text-text-muted shrink-0" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                      <path strokeLinecap="round" strokeLinejoin="round" d="M8.25 15L12 18.75 15.75 15m-7.5-6L12 5.25 15.75 9" />
                    </svg>
                  </button>
                ) : (
                  <button
                    onClick={() => { onLinkGitHub(); setDropdownOpen(false); }}
                    className="w-full flex items-center gap-2 px-3 py-2 text-sm text-text-muted hover:bg-surface-2 hover:text-text transition-colors"
                  >
                    <GitHubIcon className="w-3.5 h-3.5 shrink-0" />
                    Connect GitHub repo
                  </button>
                )}
              </div>
            )}

            {/* New project */}
            <div className="border-t border-border">
              <button
                onClick={() => { onNewProject(); setDropdownOpen(false); }}
                className="w-full flex items-center gap-2 px-3 py-2 text-sm text-text-muted hover:bg-surface-2 hover:text-text transition-colors"
              >
                <PlusIcon className="w-3.5 h-3.5 shrink-0" />
                New project
              </button>
            </div>
          </div>
        )}
      </div>

      <div className="flex-1" />

      {/* Right controls */}
      <button
        onClick={onThemeToggle}
        title={theme === "dark" ? "Light mode" : "Dark mode"}
        className="w-7 h-7 flex items-center justify-center rounded-md text-text-muted hover:text-text-secondary hover:bg-surface-2 transition-colors"
      >
        {theme === "dark" ? <SunIcon /> : <MoonIcon />}
      </button>

      {user ? (
        <button
          onClick={() => router.push("/settings")}
          className="flex items-center gap-2 h-7 px-2 rounded-md hover:bg-surface-2 transition-colors"
          title="Settings"
        >
          <div className="w-5 h-5 rounded-full bg-accent/20 border border-accent/30 flex items-center justify-center shrink-0">
            <span className="text-[10px] font-semibold text-accent leading-none">
              {user.name[0]?.toUpperCase() ?? "?"}
            </span>
          </div>
          <span className="text-xs text-text-secondary hidden sm:block max-w-24 truncate">
            {user.name.split(" ")[0]}
          </span>
        </button>
      ) : (
        <button
          onClick={onSignIn}
          className="h-7 px-3 text-xs font-medium bg-accent text-white rounded-md hover:bg-accent-hover transition-colors"
        >
          Sign in
        </button>
      )}
    </header>
  );
}

// ── Icons ──────────────────────────────────────────────────────────────────

function SparkleIcon({ className }: { className?: string }) {
  return (
    <svg className={className} fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2.5}>
      <path strokeLinecap="round" strokeLinejoin="round" d="M9.813 15.904L9 18.75l-.813-2.846a4.5 4.5 0 00-3.09-3.09L2.25 12l2.846-.813a4.5 4.5 0 003.09-3.09L9 5.25l.813 2.846a4.5 4.5 0 003.09 3.09L15.75 12l-2.846.813a4.5 4.5 0 00-3.09 3.09z" />
    </svg>
  );
}

function ChevronIcon({ open }: { open: boolean }) {
  return (
    <svg
      className={`w-3.5 h-3.5 transition-transform duration-150 ${open ? "rotate-180" : ""}`}
      fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}
    >
      <path strokeLinecap="round" strokeLinejoin="round" d="M19 9l-7 7-7-7" />
    </svg>
  );
}

function CheckIcon({ className }: { className?: string }) {
  return (
    <svg className={className} fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2.5}>
      <path strokeLinecap="round" strokeLinejoin="round" d="M4.5 12.75l6 6 9-13.5" />
    </svg>
  );
}

function PlusIcon({ className }: { className?: string }) {
  return (
    <svg className={className} fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
      <path strokeLinecap="round" strokeLinejoin="round" d="M12 4.5v15m7.5-7.5h-15" />
    </svg>
  );
}

function GitHubIcon({ className }: { className?: string }) {
  return (
    <svg className={className} viewBox="0 0 24 24" fill="currentColor">
      <path d="M12 2C6.477 2 2 6.484 2 12.017c0 4.425 2.865 8.18 6.839 9.504.5.092.682-.217.682-.483 0-.237-.008-.868-.013-1.703-2.782.605-3.369-1.343-3.369-1.343-.454-1.158-1.11-1.466-1.11-1.466-.908-.62.069-.608.069-.608 1.003.07 1.531 1.032 1.531 1.032.892 1.53 2.341 1.088 2.91.832.092-.647.35-1.088.636-1.338-2.22-.253-4.555-1.113-4.555-4.951 0-1.093.39-1.988 1.029-2.688-.103-.253-.446-1.272.098-2.65 0 0 .84-.27 2.75 1.026A9.564 9.564 0 0112 6.844c.85.004 1.705.115 2.504.337 1.909-1.296 2.747-1.027 2.747-1.027.546 1.379.202 2.398.1 2.651.64.7 1.028 1.595 1.028 2.688 0 3.848-2.339 4.695-4.566 4.943.359.309.678.92.678 1.855 0 1.338-.012 2.419-.012 2.747 0 .268.18.58.688.482A10.019 10.019 0 0022 12.017C22 6.484 17.522 2 12 2z" />
    </svg>
  );
}

function SunIcon() {
  return (
    <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.5}>
      <path strokeLinecap="round" strokeLinejoin="round" d="M12 3v2.25m6.364.386l-1.591 1.591M21 12h-2.25m-.386 6.364l-1.591-1.591M12 18.75V21m-4.773-4.227l-1.591 1.591M5.25 12H3m4.227-4.773L5.636 5.636M15.75 12a3.75 3.75 0 11-7.5 0 3.75 3.75 0 017.5 0z" />
    </svg>
  );
}

function MoonIcon() {
  return (
    <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.5}>
      <path strokeLinecap="round" strokeLinejoin="round" d="M21.752 15.002A9.718 9.718 0 0118 15.75c-5.385 0-9.75-4.365-9.75-9.75 0-1.33.266-2.597.748-3.752A9.753 9.753 0 003 11.25C3 16.635 7.365 21 12.75 21a9.753 9.753 0 009.002-5.998z" />
    </svg>
  );
}
