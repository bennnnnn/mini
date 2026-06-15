"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { useAuth } from "@/lib/auth";
import { api } from "@/lib/api";
import { Header, type Project } from "@/components/Header";
import { AuthModal } from "@/components/AuthModal";

export default function DashboardPage() {
  const { user, login, loading: authLoading } = useAuth();
  const router = useRouter();
  const [projects, setProjects] = useState<Project[]>([]);
  const [loading, setLoading] = useState(true);
  const [showAuth, setShowAuth] = useState(false);
  const [theme, setTheme] = useState<"dark" | "light">("dark");
  const [showGitHub, setShowGitHub] = useState(false);
  const [currentPid, setCurrentPid] = useState<string | null>(null);

  useEffect(() => {
    document.documentElement.classList.toggle("light", theme === "light");
    localStorage.setItem("theme", theme);
  }, [theme]);

  useEffect(() => {
    const s = localStorage.getItem("theme") as "dark" | "light" | null;
    if (s) setTheme(s);
  }, []);

  useEffect(() => {
    api("/projects")
      .then(setProjects)
      .catch(() => {})
      .finally(() => setLoading(false));
  }, []);

  const handleNewProject = async () => {
    try {
      const p = await api("/projects", { method: "POST", body: { name: "New Project" } });
      setProjects(prev => [p, ...prev]);
      localStorage.setItem("last_project_id", p.id);
      localStorage.setItem("last_project_name", p.name);
      router.push("/workspace");
    } catch (e: any) {
      // toast handled by layout
    }
  };

  const openProject = (p: Project) => {
    localStorage.setItem("last_project_id", p.id);
    localStorage.setItem("last_project_name", p.name);
    router.push("/workspace");
  };

  if (authLoading) {
    return (
      <div className="h-screen flex items-center justify-center bg-bg">
        <div className="w-5 h-5 border-2 border-accent border-t-transparent rounded-full animate-spin" />
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-bg">
      <Header
        user={user}
        theme={theme}
        projects={projects}
        currentPid={currentPid}
        onProjectSelect={(p) => openProject(p)}
        onNewProject={handleNewProject}
        onLinkGitHub={() => setShowGitHub(true)}
        onThemeToggle={() => setTheme(t => t === "dark" ? "light" : "dark")}
        onSignIn={() => setShowAuth(true)}
      />

      <main className="max-w-4xl mx-auto px-6 pt-24 pb-20">
        {/* Welcome */}
        <div className="mb-10">
          <h1 className="text-2xl font-bold text-text mb-1">
            {user ? `Welcome back, ${user.name?.split(" ")[0] || "there"}` : "Dashboard"}
          </h1>
          <p className="text-sm text-text-muted">
            Your projects and recent activity
          </p>
        </div>

        {/* Projects section */}
        <section className="mb-12">
          <div className="flex items-center justify-between mb-4">
            <h2 className="text-sm font-semibold text-text-secondary uppercase tracking-wider">Projects</h2>
            <button
              onClick={handleNewProject}
              className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg bg-accent text-white text-xs font-medium hover:bg-accent-hover transition-colors"
            >
              <svg className="w-3.5 h-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                <path strokeLinecap="round" strokeLinejoin="round" d="M12 4v16m8-8H4" />
              </svg>
              New project
            </button>
          </div>

          {loading ? (
            <div className="grid gap-3">
              {[1, 2, 3].map(i => (
                <div key={i} className="h-20 rounded-xl bg-surface animate-pulse" />
              ))}
            </div>
          ) : projects.length === 0 ? (
            <div className="rounded-xl border border-border bg-surface p-10 text-center">
              <div className="w-12 h-12 rounded-xl bg-surface-2 border border-border flex items-center justify-center mx-auto mb-3">
                <svg className="w-5 h-5 text-text-muted" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.5}>
                  <path strokeLinecap="round" strokeLinejoin="round" d="M2.25 12.75V12A2.25 2.25 0 014.5 9.75h15A2.25 2.25 0 0121.75 12v.75m-8.69-6.44l-2.12-2.12a1.5 1.5 0 00-1.061-.44H4.5A2.25 2.25 0 002.25 6v12a2.25 2.25 0 002.25 2.25h15A2.25 2.25 0 0021.75 18V9a2.25 2.25 0 00-2.25-2.25h-5.379a1.5 1.5 0 01-1.06-.44z" />
                </svg>
              </div>
              <p className="text-sm text-text-secondary mb-1">No projects yet</p>
              <p className="text-xs text-text-muted mb-4">Create your first project to start building with AI</p>
              <button
                onClick={handleNewProject}
                className="px-4 py-2 rounded-lg bg-accent text-white text-sm font-medium hover:bg-accent-hover transition-colors"
              >
                Create project
              </button>
            </div>
          ) : (
            <div className="grid gap-3">
              {projects.map(p => (
                <button
                  key={p.id}
                  onClick={() => openProject(p)}
                  className="w-full flex items-center gap-4 p-4 rounded-xl border border-border bg-surface hover:border-border-strong hover:bg-surface-2 transition-all text-left group"
                >
                  <div className="w-10 h-10 rounded-lg bg-accent/10 border border-accent/20 flex items-center justify-center shrink-0 group-hover:scale-105 transition-transform">
                    <svg className="w-4 h-4 text-accent" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                      <path strokeLinecap="round" strokeLinejoin="round" d="M2.25 12.75V12A2.25 2.25 0 014.5 9.75h15A2.25 2.25 0 0121.75 12v.75m-8.69-6.44l-2.12-2.12a1.5 1.5 0 00-1.061-.44H4.5A2.25 2.25 0 002.25 6v12a2.25 2.25 0 002.25 2.25h15A2.25 2.25 0 0021.75 18V9a2.25 2.25 0 00-2.25-2.25h-5.379a1.5 1.5 0 01-1.06-.44z" />
                    </svg>
                  </div>
                  <div className="flex-1 min-w-0">
                    <p className="text-sm font-medium text-text truncate">{p.name}</p>
                    {p.github_repo && (
                      <p className="text-xs text-text-muted mt-0.5 flex items-center gap-1">
                        <svg className="w-3 h-3" fill="currentColor" viewBox="0 0 24 24"><path d="M12 0c-6.626 0-12 5.373-12 12 0 5.302 3.438 9.8 8.207 11.387.599.111.793-.261.793-.577v-2.234c-3.338.726-4.033-1.416-4.033-1.416-.546-1.387-1.333-1.756-1.333-1.756-1.089-.745.083-.729.083-.729 1.205.084 1.839 1.237 1.839 1.237 1.07 1.834 2.807 1.304 3.492.997.107-.775.418-1.305.762-1.604-2.665-.305-5.467-1.334-5.467-5.931 0-1.311.469-2.381 1.236-3.221-.124-.303-.535-1.524.117-3.176 0 0 1.008-.322 3.301 1.23.957-.266 1.983-.399 3.003-.404 1.02.005 2.047.138 3.006.404 2.291-1.552 3.297-1.23 3.297-1.23.653 1.653.242 2.874.118 3.176.77.84 1.235 1.911 1.235 3.221 0 4.609-2.807 5.624-5.479 5.921.43.372.823 1.102.823 2.222v3.293c0 .319.192.694.801.576 4.765-1.589 8.199-6.086 8.199-11.386 0-6.627-5.373-12-12-12z"/></svg>
                        {p.github_repo}
                      </p>
                    )}
                  </div>
                  <div className="flex items-center gap-2 text-text-muted shrink-0">
                    <span className="text-xs">{p.created_at ? new Date(p.created_at).toLocaleDateString() : ""}</span>
                    <svg className="w-4 h-4 opacity-0 group-hover:opacity-100 transition-opacity" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                      <path strokeLinecap="round" strokeLinejoin="round" d="M9 5l7 7-7 7" />
                    </svg>
                  </div>
                </button>
              ))}
            </div>
          )}
        </section>

        {/* Quick start */}
        <section>
          <h2 className="text-sm font-semibold text-text-secondary uppercase tracking-wider mb-4">Quick start</h2>
          <div className="grid sm:grid-cols-2 gap-3">
            {[
              {
                icon: <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}><path strokeLinecap="round" strokeLinejoin="round" d="M12 4v16m8-8H4" /></svg>,
                title: "Create a new project",
                desc: "Start with an empty workspace and let the agent build everything from scratch.",
                action: "New project",
                onClick: handleNewProject,
              },
              {
                icon: <svg className="w-4 h-4" fill="currentColor" viewBox="0 0 24 24"><path d="M12 0c-6.626 0-12 5.373-12 12 0 5.302 3.438 9.8 8.207 11.387.599.111.793-.261.793-.577v-2.234c-3.338.726-4.033-1.416-4.033-1.416-.546-1.387-1.333-1.756-1.333-1.756-1.089-.745.083-.729.083-.729 1.205.084 1.839 1.237 1.839 1.237 1.07 1.834 2.807 1.304 3.492.997.107-.775.418-1.305.762-1.604-2.665-.305-5.467-1.334-5.467-5.931 0-1.311.469-2.381 1.236-3.221-.124-.303-.535-1.524.117-3.176 0 0 1.008-.322 3.301 1.23.957-.266 1.983-.399 3.003-.404 1.02.005 2.047.138 3.006.404 2.291-1.552 3.297-1.23 3.297-1.23.653 1.653.242 2.874.118 3.176.77.84 1.235 1.911 1.235 3.221 0 4.609-2.807 5.624-5.479 5.921.43.372.823 1.102.823 2.222v3.293c0 .319.192.694.801.576 4.765-1.589 8.199-6.086 8.199-11.386 0-6.627-5.373-12-12-12z"/></svg>,
                title: "Connect a GitHub repo",
                desc: "Link an existing repository and let the agent work on your real codebase.",
                action: "Connect GitHub",
                onClick: () => setShowGitHub(true),
              },
            ].map((card, i) => (
              <button
                key={i}
                onClick={card.onClick}
                className="flex flex-col items-start gap-3 p-4 rounded-xl border border-border bg-surface hover:border-border-strong hover:bg-surface-2 transition-all text-left"
              >
                <div className="w-8 h-8 rounded-lg bg-surface-2 border border-border flex items-center justify-center text-text-secondary">
                  {card.icon}
                </div>
                <div>
                  <p className="text-sm font-medium text-text">{card.title}</p>
                  <p className="text-xs text-text-muted mt-0.5">{card.desc}</p>
                </div>
                <span className="text-xs text-accent font-medium">{card.action} →</span>
              </button>
            ))}
          </div>
        </section>
      </main>

      {showAuth && <AuthModal theme={theme} onClose={() => setShowAuth(false)} onLogin={login} />}
    </div>
  );
}
