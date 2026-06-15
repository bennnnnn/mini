"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { useAuth } from "@/lib/auth";
import { GoogleLogin } from "@react-oauth/google";
import toast from "react-hot-toast";

export default function LandingPage() {
  const { user, loading, login } = useAuth();
  const router = useRouter();
  const [scrolled, setScrolled] = useState(false);
  const [theme, setTheme] = useState<"dark" | "light">("dark");

  useEffect(() => {
    const s = localStorage.getItem("theme") as "dark" | "light" | null;
    if (s) setTheme(s);
  }, []);

  useEffect(() => {
    document.documentElement.classList.toggle("light", theme === "light");
  }, [theme]);

  useEffect(() => {
    if (!loading && user) router.replace("/workspace");
  }, [user, loading, router]);

  useEffect(() => {
    const onScroll = () => setScrolled(window.scrollY > 20);
    window.addEventListener("scroll", onScroll);
    return () => window.removeEventListener("scroll", onScroll);
  }, []);

  const isDark = theme === "dark";

  return (
    <div className="bg-bg text-text">
      {/* Nav */}
      <nav className={`fixed top-0 w-full z-50 transition-all duration-300 ${scrolled ? "bg-bg/80 backdrop-blur-xl border-b border-border" : ""}`}>
        <div className="max-w-6xl mx-auto px-6 h-14 flex items-center justify-between">
          <div className="flex items-center gap-2">
            <div className="w-7 h-7 rounded-lg bg-gradient-to-br from-blue-500 to-violet-600 flex items-center justify-center">
              <svg className="w-4 h-4 text-white" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}><path strokeLinecap="round" strokeLinejoin="round" d="M9.813 15.904L9 18.75l-.813-2.846a4.5 4.5 0 00-3.09-3.09L2.25 12l2.846-.813a4.5 4.5 0 003.09-3.09L9 5.25l.813 2.846a4.5 4.5 0 003.09 3.09L15.75 12l-2.846.813a4.5 4.5 0 00-3.09 3.09zM18.259 8.715L18 9.75l-.259-1.035a3.375 3.375 0 00-2.455-2.456L14.25 6l1.036-.259a3.375 3.375 0 002.455-2.456L18 2.25l.259 1.035a3.375 3.375 0 002.455 2.456L21.75 6l-1.036.259a3.375 3.375 0 00-2.455 2.456z" /></svg>
            </div>
            <span className="font-semibold text-sm">Mini Cursor</span>
          </div>
          <div className="flex items-center gap-4">
            <a href="#features" className="text-sm text-text-muted hover:text-text-secondary transition-colors hidden md:block">Features</a>
            <a href="#how-it-works" className="text-sm text-text-muted hover:text-text-secondary transition-colors hidden md:block">How it works</a>
            <a href="#faq" className="text-sm text-text-muted hover:text-text-secondary transition-colors hidden md:block">FAQ</a>
            <button onClick={() => setTheme(t => t === "dark" ? "light" : "dark")} className="text-sm text-text-muted hover:text-text-secondary transition-colors" title="Toggle theme">
              {isDark ? "☀️" : "🌙"}
            </button>
            {user ? (
              <button onClick={() => router.push("/dashboard")} className="h-9 px-4 rounded-lg bg-text text-bg text-sm font-medium hover:opacity-80 transition-opacity">Dashboard</button>
            ) : (
              <button onClick={() => router.push("/workspace")} className="h-9 px-4 rounded-lg bg-text text-bg text-sm font-medium hover:opacity-80 transition-opacity">Get started</button>
            )}
          </div>
        </div>
      </nav>

      {/* Hero */}
      <section className="relative pt-32 pb-24 px-6 overflow-hidden">
        <div className="absolute inset-0 bg-[radial-gradient(ellipse_at_top,_var(--tw-gradient-stops))] from-blue-500/10 via-transparent to-transparent" />
        <div className="absolute top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2 w-[800px] h-[800px] bg-gradient-to-br from-blue-500/5 to-violet-500/5 rounded-full blur-3xl" />
        <div className="max-w-3xl mx-auto text-center relative">
          <div className="inline-flex items-center gap-2 px-4 py-1.5 rounded-full border border-border bg-surface mb-8">
            <span className="w-1.5 h-1.5 rounded-full bg-green-400 animate-pulse" />
            <span className="text-xs text-text-secondary">Powered by Claude Sonnet 4</span>
          </div>
          <h1 className="text-5xl md:text-7xl font-bold tracking-tight leading-[1.05] mb-6">
            <span className="text-text">Build software</span><br />
            <span className="bg-gradient-to-r from-blue-400 to-violet-400 bg-clip-text text-transparent">with AI agents</span>
          </h1>
          <p className="text-lg text-text-secondary max-w-xl mx-auto mb-10 leading-relaxed">
            Describe what you want to build. Mini Cursor plans, writes, tests, and deploys code — while you focus on the big picture.
          </p>
          <div className="flex flex-col sm:flex-row items-center justify-center gap-3">
            <button onClick={() => router.push("/workspace")} className="w-full sm:w-auto h-12 px-8 rounded-xl bg-text text-bg font-medium hover:opacity-80 transition-all hover:scale-[1.02] active:scale-[0.98]">
              Start building — free
            </button>
            {!user && (
              <div className="h-12 flex items-center">
                <GoogleLogin
                  onSuccess={async r => { try { if (r.credential) { await login(r.credential); router.push("/workspace"); } } catch (e: any) { toast.error(e.message); } }}
                  onError={() => toast.error("Login failed")}
                  theme={isDark ? "filled_black" : "outline"}
                  size="large"
                  text="signin_with"
                  shape="rectangular"
                />
              </div>
            )}
          </div>
          <p className="text-xs text-text-muted mt-4">No credit card required.</p>
        </div>
      </section>

      {/* Features Grid */}
      <section id="features" className="max-w-6xl mx-auto px-6 pb-32">
        <div className="text-center mb-16">
          <h2 className="text-3xl font-bold mb-3">Everything you need to ship</h2>
          <p className="text-text-secondary">From idea to production — all in one place.</p>
        </div>
        <div className="grid md:grid-cols-3 gap-4">
          {[
            { icon: <PlanIcon />, title: "Smart planning", desc: "The agent analyzes your request and breaks it down into executable steps before writing any code.", color: "blue" },
            { icon: <CodeIcon />, title: "Production code", desc: "Generates complete, tested, documented files. No stubs. No placeholders. Real code every time.", color: "violet" },
            { icon: <TestIcon />, title: "Automatic testing", desc: "Every feature comes with tests. The agent writes them, runs them, and fixes failures automatically.", color: "emerald" },
            { icon: <ReviewIcon />, title: "Code review", desc: "The agent reviews its own output — checking for bugs, security issues, and performance problems.", color: "amber" },
            { icon: <GitIcon />, title: "GitHub integration", desc: "Creates branches, commits changes, and opens pull requests. Your workflow, automated.", color: "zinc" },
            { icon: <MonitorIcon />, title: "Infrastructure monitoring", desc: "Monitors your VPS — CPU, memory, disk, containers. Catches issues before they become problems.", color: "rose" },
          ].map((f, i) => (
            <div key={i} className="group relative p-6 rounded-2xl border border-border bg-surface hover:bg-surface-2 hover:border-border-strong transition-all duration-300">
              <div className="w-10 h-10 rounded-xl bg-surface-2 border border-border flex items-center justify-center mb-4 group-hover:scale-110 transition-transform duration-300">{f.icon}</div>
              <h3 className="font-semibold text-sm mb-2">{f.title}</h3>
              <p className="text-sm text-text-secondary leading-relaxed">{f.desc}</p>
            </div>
          ))}
        </div>
      </section>

      {/* How it works */}
      <section id="how-it-works" className="border-t border-border py-32 px-6">
        <div className="max-w-4xl mx-auto">
          <div className="text-center mb-20">
            <h2 className="text-3xl font-bold mb-3">How it works</h2>
            <p className="text-text-secondary">From prompt to pull request in seconds.</p>
          </div>
          <div className="space-y-16">
            {[
              { step: "01", title: "You describe what you want", desc: "Type a prompt like \"Build a FastAPI todo API with authentication.\" The agent understands natural language — no special syntax needed.", code: `> Build a FastAPI todo API with Google OAuth\n> Include tests and a Dockerfile` },
              { step: "02", title: "The agent plans it out", desc: "It breaks your request into concrete steps: create models, write routes, add auth, generate tests. You see the plan before anything happens.", code: `Plan created — 4 steps:\n  1. Create database models\n  2. Write API routes with auth\n  3. Generate pytest tests\n  4. Create Dockerfile + README` },
              { step: "03", title: "Code gets written and tested", desc: "Files appear in your workspace. Tests run automatically. If something fails, the agent fixes it and tries again.", code: `✓ src/models.py — 2.1 KB\n✓ src/routes.py — 3.4 KB\n✓ tests/test_api.py — 1.8 KB\n✓ Dockerfile — 0.5 KB\n\nAll tests passing ✓` },
              { step: "04", title: "Ship to production", desc: "Create a pull request, merge, deploy. The agent monitors your infrastructure and alerts you to issues.", code: `PR #42 created: feat/todo-api\nStatus: All checks passed\nReady to merge →` },
            ].map((s, i) => (
              <div key={i} className="flex gap-8 items-start">
                <div className="hidden md:flex w-12 h-12 rounded-2xl bg-surface border border-border items-center justify-center shrink-0">
                  <span className="text-sm font-bold text-text-muted">{s.step}</span>
                </div>
                <div className="flex-1 space-y-4">
                  <h3 className="text-lg font-semibold">{s.title}</h3>
                  <p className="text-text-secondary text-sm leading-relaxed">{s.desc}</p>
                  <pre className="bg-surface border border-border rounded-xl p-4 text-xs font-mono text-text-secondary leading-relaxed overflow-x-auto">{s.code}</pre>
                </div>
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* Capabilities */}
      <section className="border-t border-border py-32 px-6">
        <div className="max-w-6xl mx-auto">
          <div className="text-center mb-16">
            <h2 className="text-3xl font-bold mb-3">What you can build</h2>
            <p className="text-text-secondary">The agent works with any language or framework.</p>
          </div>
          <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
            {["Python + FastAPI", "React + Next.js", "Flask + SQLAlchemy", "TypeScript + Express", "Go + Gin", "Rust + Actix", "Vue + Nuxt", "Django REST", "Node.js + Prisma", "Ruby on Rails", "SvelteKit", "HTMX + Alpine"].map(l => (
              <div key={l} className="px-4 py-3 rounded-xl border border-border bg-surface text-center text-sm text-text-secondary hover:text-text hover:border-border-strong hover:bg-surface-2 transition-all cursor-default">{l}</div>
            ))}
          </div>
        </div>
      </section>

      {/* FAQ */}
      <section id="faq" className="border-t border-border py-32 px-6">
        <div className="max-w-2xl mx-auto">
          <h2 className="text-3xl font-bold text-center mb-16">Frequently asked questions</h2>
          <div className="space-y-4">
            {[
              { q: "Is Mini Cursor free?", a: "Yes. The free tier includes 20 agent runs per day, 100 API requests, and unlimited public projects. No credit card required." },
              { q: "What languages does it support?", a: "The agent can write code in any language — Python, JavaScript, TypeScript, Go, Rust, Ruby, and more. It uses Claude's broad programming knowledge." },
              { q: "How does it handle errors?", a: "The agent runs tests after writing code. If tests fail, it analyzes the error, fixes the code, and retries — up to 3 times per step." },
              { q: "Can I use it with my existing GitHub repos?", a: "Yes. Connect your GitHub account and the agent can create branches, commit changes, and open pull requests on your repos." },
              { q: "Is my code safe?", a: "All code execution happens in sandboxed Docker containers with no network access. Containers are destroyed after each run. Agents cannot access your filesystem or secrets." },
            ].map((faq, i) => (
              <details key={i} className="group border border-border rounded-2xl overflow-hidden bg-surface">
                <summary className="px-6 py-4 cursor-pointer text-sm font-medium hover:text-text-secondary transition-colors list-none flex items-center justify-between">
                  {faq.q}
                  <svg className="w-4 h-4 text-text-muted group-open:rotate-180 transition-transform" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}><path strokeLinecap="round" strokeLinejoin="round" d="M19 9l-7 7-7-7"/></svg>
                </summary>
                <p className="px-6 pb-4 text-sm text-text-secondary leading-relaxed">{faq.a}</p>
              </details>
            ))}
          </div>
        </div>
      </section>

      {/* CTA */}
      <section className="border-t border-border py-32 px-6 text-center">
        <h2 className="text-3xl font-bold mb-4">Ready to build something?</h2>
        <p className="text-text-secondary mb-8 max-w-md mx-auto">Start building with AI — no setup, no configuration, no credit card.</p>
        <button onClick={() => router.push("/workspace")} className="h-12 px-8 rounded-xl bg-text text-bg font-medium hover:opacity-80 transition-all hover:scale-[1.02] active:scale-[0.98]">
          Start building — it&apos;s free
        </button>
      </section>

      {/* Footer */}
      <footer className="border-t border-border px-6 py-10">
        <div className="max-w-6xl mx-auto flex flex-col md:flex-row items-center justify-between gap-4">
          <div className="flex items-center gap-2">
            <div className="w-5 h-5 rounded-md bg-gradient-to-br from-blue-500 to-violet-600 flex items-center justify-center">
              <svg className="w-3 h-3 text-white" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2.5}><path strokeLinecap="round" strokeLinejoin="round" d="M9.813 15.904L9 18.75l-.813-2.846a4.5 4.5 0 00-3.09-3.09L2.25 12l2.846-.813a4.5 4.5 0 003.09-3.09L9 5.25l.813 2.846a4.5 4.5 0 003.09 3.09L15.75 12l-2.846.813a4.5 4.5 0 00-3.09 3.09zM18.259 8.715L18 9.75l-.259-1.035a3.375 3.375 0 00-2.455-2.456L14.25 6l1.036-.259a3.375 3.375 0 002.455-2.456L18 2.25l.259 1.035a3.375 3.375 0 002.455 2.456L21.75 6l-1.036.259a3.375 3.375 0 00-2.455 2.456z" /></svg>
            </div>
            <span className="text-xs text-text-muted">Mini Cursor</span>
          </div>
          <div className="flex items-center gap-6">
            <a href="#features" className="text-xs text-text-muted hover:text-text-secondary transition-colors">Features</a>
            <a href="#how-it-works" className="text-xs text-text-muted hover:text-text-secondary transition-colors">How it works</a>
            <a href="#faq" className="text-xs text-text-muted hover:text-text-secondary transition-colors">FAQ</a>
          </div>
          <p className="text-xs text-text-muted">Built with Anthropic Claude</p>
        </div>
      </footer>
    </div>
  );
}

function PlanIcon() { return <svg className="w-5 h-5 text-blue-400" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.5}><path strokeLinecap="round" strokeLinejoin="round" d="M9 12h3.75M9 15h3.75M9 18h3.75m3 .75H18a2.25 2.25 0 002.25-2.25V6.108c0-1.135-.845-2.098-1.976-2.192a48.424 48.424 0 00-1.123-.08m-5.801 0c-.065.21-.1.433-.1.664 0 .414.336.75.75.75h4.5a.75.75 0 00.75-.75 2.25 2.25 0 00-.1-.664m-5.8 0A2.251 2.251 0 0113.5 2.25H15c1.012 0 1.867.668 2.15 1.586m-5.8 0c-.376.023-.75.05-1.124.08C9.095 4.01 8.25 4.973 8.25 6.108V8.25m0 0H4.875c-.621 0-1.125.504-1.125 1.125v11.25c0 .621.504 1.125 1.125 1.125h9.75c.621 0 1.125-.504 1.125-1.125V9.375c0-.621-.504-1.125-1.125-1.125H8.25zM6.75 12h.008v.008H6.75V12zm0 3h.008v.008H6.75V15zm0 3h.008v.008H6.75V18z"/></svg>; }
function CodeIcon() { return <svg className="w-5 h-5 text-violet-400" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.5}><path strokeLinecap="round" strokeLinejoin="round" d="M17.25 6.75L22.5 12l-5.25 5.25m-10.5 0L1.5 12l5.25-5.25m7.5-3l-4.5 16.5"/></svg>; }
function TestIcon() { return <svg className="w-5 h-5 text-emerald-400" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.5}><path strokeLinecap="round" strokeLinejoin="round" d="M9 12.75L11.25 15 15 9.75m-3-7.036A11.959 11.959 0 013.598 6 11.99 11.99 0 003 9.749c0 5.592 3.824 10.29 9 11.623 5.176-1.332 9-6.03 9-11.622 0-1.31-.21-2.571-.598-3.751h-.152c-3.196 0-6.1-1.248-8.25-3.285z"/></svg>; }
function ReviewIcon() { return <svg className="w-5 h-5 text-amber-400" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.5}><path strokeLinecap="round" strokeLinejoin="round" d="M2.036 12.322a1.012 1.012 0 010-.639C3.423 7.51 7.36 4.5 12 4.5c4.638 0 8.573 3.007 9.963 7.178.07.207.07.431 0 .639C20.577 16.49 16.64 19.5 12 19.5c-4.638 0-8.573-3.007-9.963-7.178z"/><path strokeLinecap="round" strokeLinejoin="round" d="M15 12a3 3 0 11-6 0 3 3 0 016 0z"/></svg>; }
function GitIcon() { return <svg className="w-5 h-5 text-text-muted" fill="currentColor" viewBox="0 0 24 24"><path d="M12 2C6.477 2 2 6.484 2 12.017c0 4.425 2.865 8.18 6.839 9.504.5.092.682-.217.682-.483 0-.237-.008-.868-.013-1.703-2.782.605-3.369-1.343-3.369-1.343-.454-1.158-1.11-1.466-1.11-1.466-.908-.62.069-.608.069-.608 1.003.07 1.531 1.032 1.531 1.032.892 1.53 2.341 1.088 2.91.832.092-.647.35-1.088.636-1.338-2.22-.253-4.555-1.113-4.555-4.951 0-1.093.39-1.988 1.029-2.688-.103-.253-.446-1.272.098-2.65 0 0 .84-.27 2.75 1.026A9.564 9.564 0 0112 6.844c.85.004 1.705.115 2.504.337 1.909-1.296 2.747-1.027 2.747-1.027.546 1.379.202 2.398.1 2.651.64.7 1.028 1.595 1.028 2.688 0 3.848-2.339 4.695-4.566 4.943.359.309.678.92.678 1.855 0 1.338-.012 2.419-.012 2.747 0 .268.18.58.688.482A10.019 10.019 0 0022 12.017C22 6.484 17.522 2 12 2z"/></svg>; }
function MonitorIcon() { return <svg className="w-5 h-5 text-rose-400" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.5}><path strokeLinecap="round" strokeLinejoin="round" d="M9 17.25v1.007a3 3 0 01-.879 2.122L7.5 21h9l-.621-.621A3 3 0 0115 18.257V17.25m6-12V15a2.25 2.25 0 01-2.25 2.25H5.25A2.25 2.25 0 013 15V5.25m18 0A2.25 2.25 0 0018.75 3H5.25A2.25 2.25 0 003 5.25m18 0V12a2.25 2.25 0 01-2.25 2.25H5.25A2.25 2.25 0 013 12V5.25"/></svg>; }
