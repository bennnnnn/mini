"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { useAuth } from "@/lib/auth";
import { api } from "@/lib/api";
import { Header } from "@/components/Header";
import type { Project } from "@/components/Header";

type SettingsTab = "account" | "github" | "models";

export default function SettingsPage() {
  const { user, login, logout, loading: authLoading } = useAuth();
  const router = useRouter();
  const [projects, setProjects] = useState<Project[]>([]);
  const [tab, setTab] = useState<SettingsTab>("account");
  const [theme, setTheme] = useState<"dark" | "light">("dark");
  const [ghStatus, setGhStatus] = useState<{ connected: boolean; github_user?: string } | null>(null);
  const [ghLoading, setGhLoading] = useState(true);

  useEffect(() => {
    document.documentElement.classList.toggle("light", theme === "light");
    localStorage.setItem("theme", theme);
  }, [theme]);

  useEffect(() => {
    const s = localStorage.getItem("theme") as "dark" | "light" | null;
    if (s) setTheme(s);
  }, []);

  useEffect(() => {
    api("/projects").then(setProjects).catch(() => {});
    api("/github/status")
      .then(setGhStatus)
      .catch(() => setGhStatus({ connected: false }))
      .finally(() => setGhLoading(false));
  }, []);

  const disconnectGitHub = async () => {
    await api("/github/connect", { method: "DELETE" }).catch(() => {});
    setGhStatus({ connected: false });
  };

  const tabs: { id: SettingsTab; label: string }[] = [
    { id: "account", label: "Account" },
    { id: "github", label: "GitHub" },
    { id: "models", label: "Models" },
  ];

  return (
    <div className="min-h-screen bg-bg">
      <Header
        user={user}
        theme={theme}
        projects={projects}
        currentPid={null}
        onProjectSelect={(p) => {
          localStorage.setItem("last_project_id", p.id);
          localStorage.setItem("last_project_name", p.name);
          router.push("/workspace");
        }}
        onNewProject={async () => {
          const p = await api("/projects", { method: "POST", body: { name: "New Project" } });
          localStorage.setItem("last_project_id", p.id);
          localStorage.setItem("last_project_name", p.name);
          router.push("/workspace");
        }}
        onLinkGitHub={() => setTab("github")}
        onThemeToggle={() => setTheme(t => t === "dark" ? "light" : "dark")}
        onSignIn={() => login("")}
      />

      <div className="max-w-3xl mx-auto px-6 pt-24 pb-20">
        <h1 className="text-2xl font-bold text-text mb-8">Settings</h1>

        {/* Tab bar */}
        <div className="flex gap-0 border-b border-border mb-8">
          {tabs.map(t => (
            <button
              key={t.id}
              onClick={() => setTab(t.id)}
              className={`px-4 py-2.5 text-sm font-medium border-b-2 transition-colors -mb-px ${
                tab === t.id
                  ? "border-accent text-text"
                  : "border-transparent text-text-muted hover:text-text-secondary"
              }`}
            >
              {t.label}
            </button>
          ))}
        </div>

        {/* Account tab */}
        {tab === "account" && (
          <div className="space-y-6">
            <div className="rounded-xl border border-border bg-surface p-6">
              <h2 className="text-sm font-semibold text-text mb-4">Profile</h2>
              {user ? (
                <div className="space-y-4">
                  <div className="flex items-center gap-4">
                    {user.avatar_url ? (
                      <img src={user.avatar_url} alt="" className="w-12 h-12 rounded-full" />
                    ) : (
                      <div className="w-12 h-12 rounded-full bg-accent/10 border border-accent/20 flex items-center justify-center text-accent font-semibold text-lg">
                        {user.name?.[0]?.toUpperCase() || "U"}
                      </div>
                    )}
                    <div>
                      <p className="text-sm font-medium text-text">{user.name || "Unknown"}</p>
                      <p className="text-xs text-text-muted">{user.email || "No email"}</p>
                    </div>
                  </div>
                  <div className="pt-4 border-t border-border">
                    <button
                      onClick={logout}
                      className="px-4 py-2 rounded-lg border border-error/30 text-error text-sm hover:bg-error/5 transition-colors"
                    >
                      Sign out
                    </button>
                  </div>
                </div>
              ) : (
                <div className="text-center py-8">
                  <p className="text-sm text-text-muted mb-4">Sign in to manage your account</p>
                  <button
                    onClick={() => login("")}
                    className="px-4 py-2 rounded-lg bg-accent text-white text-sm font-medium hover:bg-accent-hover transition-colors"
                  >
                    Sign in with Google
                  </button>
                </div>
              )}
            </div>

            <div className="rounded-xl border border-border bg-surface p-6">
              <h2 className="text-sm font-semibold text-text mb-4">Appearance</h2>
              <div className="flex items-center justify-between">
                <div>
                  <p className="text-sm text-text">Theme</p>
                  <p className="text-xs text-text-muted">Switch between dark and light mode</p>
                </div>
                <button
                  onClick={() => setTheme(t => t === "dark" ? "light" : "dark")}
                  className="px-3 py-1.5 rounded-lg border border-border text-xs text-text-secondary hover:bg-surface-2 transition-colors"
                >
                  {theme === "dark" ? "🌙 Dark" : "☀️ Light"}
                </button>
              </div>
            </div>
          </div>
        )}

        {/* GitHub tab */}
        {tab === "github" && (
          <div className="space-y-6">
            <div className="rounded-xl border border-border bg-surface p-6">
              <h2 className="text-sm font-semibold text-text mb-4">GitHub Integration</h2>
              {ghLoading ? (
                <div className="flex items-center gap-2 text-sm text-text-muted">
                  <div className="w-4 h-4 border-2 border-accent border-t-transparent rounded-full animate-spin" />
                  Checking GitHub status...
                </div>
              ) : ghStatus?.connected ? (
                <div className="space-y-4">
                  <div className="flex items-center gap-3">
                    <span className="w-2 h-2 rounded-full bg-success" />
                    <span className="text-sm text-text">Connected as{" "}
                      <span className="font-mono text-accent">{ghStatus.github_user}</span>
                    </span>
                  </div>
                  <p className="text-xs text-text-muted">
                    Your GitHub token is encrypted and stored securely. Agents can create branches,
                    commits, and pull requests on your behalf.
                  </p>
                  <button
                    onClick={disconnectGitHub}
                    className="px-4 py-2 rounded-lg border border-error/30 text-error text-sm hover:bg-error/5 transition-colors"
                  >
                    Disconnect GitHub
                  </button>
                </div>
              ) : (
                <div className="text-center py-6 space-y-3">
                  <div className="w-10 h-10 rounded-xl bg-surface-2 border border-border flex items-center justify-center mx-auto">
                    <svg className="w-5 h-5 text-text-muted" fill="currentColor" viewBox="0 0 24 24"><path d="M12 0c-6.626 0-12 5.373-12 12 0 5.302 3.438 9.8 8.207 11.387.599.111.793-.261.793-.577v-2.234c-3.338.726-4.033-1.416-4.033-1.416-.546-1.387-1.333-1.756-1.333-1.756-1.089-.745.083-.729.083-.729 1.205.084 1.839 1.237 1.839 1.237 1.07 1.834 2.807 1.304 3.492.997.107-.775.418-1.305.762-1.604-2.665-.305-5.467-1.334-5.467-5.931 0-1.311.469-2.381 1.236-3.221-.124-.303-.535-1.524.117-3.176 0 0 1.008-.322 3.301 1.23.957-.266 1.983-.399 3.003-.404 1.02.005 2.047.138 3.006.404 2.291-1.552 3.297-1.23 3.297-1.23.653 1.653.242 2.874.118 3.176.77.84 1.235 1.911 1.235 3.221 0 4.609-2.807 5.624-5.479 5.921.43.372.823 1.102.823 2.222v3.293c0 .319.192.694.801.576 4.765-1.589 8.199-6.086 8.199-11.386 0-6.627-5.373-12-12-12z"/></svg>
                  </div>
                  <p className="text-sm text-text-secondary">Connect your GitHub account to enable agent workflows</p>
                  <p className="text-xs text-text-muted">Create branches, commit code, and open pull requests automatically</p>
                  <button
                    onClick={() => router.push("/workspace?github=1")}
                    className="px-4 py-2 rounded-lg bg-accent text-white text-sm font-medium hover:bg-accent-hover transition-colors"
                  >
                    Connect GitHub
                  </button>
                </div>
              )}
            </div>
          </div>
        )}

        {/* Models tab */}
        {tab === "models" && (
          <div className="space-y-6">
            <div className="rounded-xl border border-border bg-surface p-6">
              <h2 className="text-sm font-semibold text-text mb-4">AI Models</h2>
              <p className="text-xs text-text-muted mb-4">
                Mini Cursor uses Anthropic's Claude models for code generation and planning.
                Model selection will be configurable in a future update.
              </p>
              <div className="space-y-3">
                <div className="rounded-lg border border-border bg-surface-2 p-3">
                  <div className="flex items-center justify-between">
                    <div>
                      <p className="text-sm font-medium text-text">Claude Sonnet 4</p>
                      <p className="text-xs text-text-muted">Primary model — coding, testing, reviewing</p>
                    </div>
                    <span className="text-[10px] px-2 py-0.5 rounded-full bg-accent/10 text-accent border border-accent/20 font-medium">Active</span>
                  </div>
                </div>
                <div className="rounded-lg border border-border bg-surface-2 p-3 opacity-60">
                  <div className="flex items-center justify-between">
                    <div>
                      <p className="text-sm font-medium text-text">Claude Haiku</p>
                      <p className="text-xs text-text-muted">Fast model — planning, git, devops</p>
                    </div>
                    <span className="text-[10px] px-2 py-0.5 rounded-full bg-surface border border-border text-text-muted">Active</span>
                  </div>
                </div>
                <div className="rounded-lg border border-border bg-surface-2 p-3 opacity-40">
                  <div className="flex items-center justify-between">
                    <div>
                      <p className="text-sm font-medium text-text">GPT, Gemini, DeepSeek</p>
                      <p className="text-xs text-text-muted">Multi-model support — coming in V2</p>
                    </div>
                    <span className="text-[10px] px-2 py-0.5 rounded-full bg-surface border border-border text-text-muted">Soon</span>
                  </div>
                </div>
              </div>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
