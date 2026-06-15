"use client";

import { useEffect, useRef, useState } from "react";
import { api } from "@/lib/api";

// ── Types ──────────────────────────────────────────────────────────────────

interface Repo {
  name: string;
  full_name: string;
  url: string;
  private: boolean;
  description: string | null;
}

interface GitHubModalProps {
  projectId: string;
  onSuccess: (repoFullName: string) => void;
  onClose: () => void;
}

type Screen = "loading" | "connect" | "device" | "pick";

// ── Root component ─────────────────────────────────────────────────────────

export function GitHubModal({ projectId, onSuccess, onClose }: GitHubModalProps) {
  const [screen, setScreen] = useState<Screen>("loading");
  const [ghUser, setGhUser] = useState<string | null>(null);

  useEffect(() => {
    api("/github/status")
      .then((d) => {
        if (d.connected) {
          setGhUser(d.github_user);
          setScreen("pick");
        } else {
          setScreen("connect");
        }
      })
      .catch(() => setScreen("connect"));
  }, []);

  const handleAuthorized = (user: string) => {
    setGhUser(user);
    setScreen("pick");
  };

  const handleDisconnect = async () => {
    await api("/github/connect", { method: "DELETE" }).catch(() => {});
    setGhUser(null);
    setScreen("connect");
  };

  return (
    <div
      className="fixed inset-0 bg-black/70 backdrop-blur-sm flex items-center justify-center z-50 p-4"
      onClick={onClose}
    >
      <div
        className="bg-surface border border-border rounded-2xl w-full max-w-md shadow-2xl"
        onClick={(e) => e.stopPropagation()}
      >
        {screen === "loading" && <LoadingScreen onClose={onClose} />}
        {screen === "connect" && (
          <ConnectScreen
            onDeviceFlow={() => setScreen("device")}
            onAuthorized={handleAuthorized}
            onClose={onClose}
          />
        )}
        {screen === "device" && (
          <DeviceFlowScreen
            onAuthorized={handleAuthorized}
            onBack={() => setScreen("connect")}
            onClose={onClose}
          />
        )}
        {screen === "pick" && (
          <PickScreen
            ghUser={ghUser}
            projectId={projectId}
            onSuccess={onSuccess}
            onDisconnect={handleDisconnect}
            onClose={onClose}
          />
        )}
      </div>
    </div>
  );
}

// ── Loading ────────────────────────────────────────────────────────────────

function LoadingScreen({ onClose }: { onClose: () => void }) {
  return (
    <ModalShell title="GitHub" onClose={onClose}>
      <div className="py-12 flex justify-center">
        <Spinner />
      </div>
    </ModalShell>
  );
}

// ── Connect — choose auth method ───────────────────────────────────────────

function ConnectScreen({
  onDeviceFlow,
  onAuthorized,
  onClose,
}: {
  onDeviceFlow: () => void;
  onAuthorized: (user: string) => void;
  onClose: () => void;
}) {
  const [showPat, setShowPat] = useState(false);
  const [token, setToken] = useState("");
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const connectPat = async () => {
    if (!token.trim()) return;
    setLoading(true);
    setError(null);
    try {
      const res = await api("/github/connect", {
        method: "POST",
        body: { access_token: token.trim() },
      });
      onAuthorized(res.github_user);
    } catch (e: unknown) {
      setError(e instanceof Error ? e.message : "Connection failed");
    } finally {
      setLoading(false);
    }
  };

  return (
    <ModalShell title="Connect GitHub" onClose={onClose}>
      <div className="space-y-3">
        {/* Primary CTA — Device Flow */}
        <button
          onClick={onDeviceFlow}
          className="w-full flex items-center gap-3 px-4 py-3.5 bg-surface-2 border border-border rounded-xl hover:border-border-strong hover:bg-surface-2 transition-colors text-left group"
        >
          <div className="w-8 h-8 rounded-lg bg-bg border border-border flex items-center justify-center shrink-0">
            <GitHubIcon className="w-4 h-4 text-text-secondary" />
          </div>
          <div className="flex-1 min-w-0">
            <p className="text-sm font-medium text-text">Authorize with GitHub</p>
            <p className="text-xs text-text-muted">Opens a code — enter it on GitHub's website</p>
          </div>
          <svg className="w-4 h-4 text-text-muted group-hover:text-text transition-colors shrink-0" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
            <path strokeLinecap="round" strokeLinejoin="round" d="M9 5l7 7-7 7" />
          </svg>
        </button>

        {/* Divider */}
        <div className="flex items-center gap-3">
          <div className="flex-1 h-px bg-border" />
          <span className="text-[11px] text-text-muted">or</span>
          <div className="flex-1 h-px bg-border" />
        </div>

        {/* PAT fallback */}
        {!showPat ? (
          <button
            onClick={() => setShowPat(true)}
            className="w-full text-xs text-text-muted hover:text-text-secondary transition-colors py-1 text-center"
          >
            Use a personal access token instead
          </button>
        ) : (
          <div className="space-y-2">
            <label className="text-xs text-text-muted block">
              Personal access token —{" "}
              <a
                href="https://github.com/settings/tokens/new?scopes=repo,read:user&description=Mini+Cursor"
                target="_blank"
                rel="noopener noreferrer"
                className="text-accent hover:underline"
              >
                generate one here
              </a>
            </label>
            <input
              autoFocus
              type="password"
              value={token}
              onChange={(e) => setToken(e.target.value)}
              onKeyDown={(e) => e.key === "Enter" && connectPat()}
              placeholder="ghp_xxxxxxxxxxxxxxxxxxxx"
              className="w-full h-9 bg-bg border border-border rounded-lg px-3 text-sm text-text placeholder:text-text-muted font-mono focus:outline-none focus:border-accent/50 focus:ring-1 focus:ring-accent/20 transition-colors"
            />
            {error && <p className="text-xs text-error">{error}</p>}
            <button
              onClick={connectPat}
              disabled={!token.trim() || loading}
              className="w-full h-9 bg-accent text-white rounded-lg text-sm font-medium hover:bg-accent-hover disabled:opacity-40 disabled:cursor-not-allowed transition-colors"
            >
              {loading ? "Connecting..." : "Connect"}
            </button>
          </div>
        )}
      </div>
    </ModalShell>
  );
}

// ── Device Flow screen ─────────────────────────────────────────────────────

function DeviceFlowScreen({
  onAuthorized,
  onBack,
  onClose,
}: {
  onAuthorized: (user: string) => void;
  onBack: () => void;
  onClose: () => void;
}) {
  const [state, setState] = useState<"starting" | "waiting" | "error">("starting");
  const [userCode, setUserCode] = useState("");
  const [verificationUri, setVerificationUri] = useState("https://github.com/login/device");
  const [sessionId, setSessionId] = useState("");
  const [error, setError] = useState<string | null>(null);
  const pollRef = useRef<ReturnType<typeof setInterval> | null>(null);

  useEffect(() => {
    startDeviceFlow();
    return () => { if (pollRef.current) clearInterval(pollRef.current); };
  }, []);

  const startDeviceFlow = async () => {
    setState("starting");
    setError(null);
    try {
      const data = await api("/github/device/start", { method: "POST" });
      setUserCode(data.user_code);
      setVerificationUri(data.verification_uri);
      setSessionId(data.session_id);
      setState("waiting");

      // Poll every 5 seconds
      const interval = Math.max((data.interval ?? 5) * 1000, 5000);
      pollRef.current = setInterval(() => poll(data.session_id), interval);
    } catch (e: unknown) {
      const msg = e instanceof Error ? e.message : "Failed to start";
      setError(msg);
      setState("error");
    }
  };

  const poll = async (sid: string) => {
    try {
      const res = await api(`/github/device/poll?session_id=${sid}`, { method: "POST" });
      if (res.status === "authorized") {
        if (pollRef.current) clearInterval(pollRef.current);
        onAuthorized(res.github_user);
      } else if (res.status === "expired_token" || res.status === "access_denied") {
        if (pollRef.current) clearInterval(pollRef.current);
        setError(res.status === "access_denied" ? "Authorization denied on GitHub." : "Code expired — please try again.");
        setState("error");
      }
      // "pending" → keep polling
    } catch {
      // Network error — keep polling
    }
  };

  return (
    <ModalShell
      title="Authorize with GitHub"
      onClose={onClose}
      back={onBack}
    >
      {state === "starting" && (
        <div className="py-10 flex flex-col items-center gap-3">
          <Spinner />
          <p className="text-sm text-text-secondary">Starting authorization...</p>
        </div>
      )}

      {state === "waiting" && (
        <div className="space-y-5">
          <div className="text-center space-y-1">
            <p className="text-sm text-text-secondary">
              1. Copy this code
            </p>
          </div>

          {/* The code — large and copyable */}
          <div className="relative">
            <div className="bg-bg border border-border rounded-xl px-6 py-4 text-center">
              <span className="text-2xl font-mono font-bold text-text tracking-[0.2em]">
                {userCode}
              </span>
            </div>
            <button
              onClick={() => navigator.clipboard.writeText(userCode)}
              className="absolute right-3 top-1/2 -translate-y-1/2 text-[11px] text-text-muted hover:text-text border border-border rounded px-2 py-0.5 transition-colors"
            >
              Copy
            </button>
          </div>

          <div className="text-center space-y-3">
            <p className="text-sm text-text-secondary">
              2. Open this link and enter the code
            </p>
            <a
              href={verificationUri}
              target="_blank"
              rel="noopener noreferrer"
              className="inline-flex items-center gap-2 px-4 py-2.5 bg-accent text-white rounded-lg text-sm font-medium hover:bg-accent-hover transition-colors"
            >
              <GitHubIcon className="w-4 h-4" />
              Open github.com/login/device
            </a>
          </div>

          <div className="flex items-center justify-center gap-2 text-xs text-text-muted">
            <span className="w-1.5 h-1.5 rounded-full bg-accent animate-pulse" />
            Waiting for you to authorize...
          </div>
        </div>
      )}

      {state === "error" && (
        <div className="space-y-4 text-center">
          <p className="text-sm text-error">{error}</p>
          {error?.includes("GITHUB_CLIENT_ID") ? (
            <div className="bg-surface-2 rounded-lg p-4 text-left space-y-2">
              <p className="text-xs font-medium text-text">To enable one-click auth:</p>
              <ol className="text-xs text-text-secondary space-y-1.5 list-decimal list-inside">
                <li>
                  Go to{" "}
                  <a href="https://github.com/settings/developers" target="_blank" rel="noopener noreferrer" className="text-accent hover:underline">
                    github.com/settings/developers
                  </a>
                  {" "}→ New OAuth App
                </li>
                <li>Set any callback URL (e.g. http://localhost:3000)</li>
                <li>Copy the <strong>Client ID</strong></li>
                <li>Add to <code className="bg-bg px-1 rounded">backend/.env</code>:<br/>
                  <code className="bg-bg px-1 rounded">GITHUB_CLIENT_ID=your_id_here</code>
                </li>
                <li>Restart the backend</li>
              </ol>
            </div>
          ) : (
            <button
              onClick={startDeviceFlow}
              className="px-4 py-2 bg-surface-2 border border-border rounded-lg text-sm text-text hover:bg-bg transition-colors"
            >
              Try again
            </button>
          )}
        </div>
      )}
    </ModalShell>
  );
}

// ── Repo picker ────────────────────────────────────────────────────────────

function PickScreen({
  ghUser,
  projectId,
  onSuccess,
  onDisconnect,
  onClose,
}: {
  ghUser: string | null;
  projectId: string;
  onSuccess: (repo: string) => void;
  onDisconnect: () => void;
  onClose: () => void;
}) {
  const [repos, setRepos] = useState<Repo[]>([]);
  const [loading, setLoading] = useState(true);
  const [connecting, setConnecting] = useState<string | null>(null);
  const [search, setSearch] = useState("");
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    api("/github/repos")
      .then(setRepos)
      .catch((e) => setError(e.message))
      .finally(() => setLoading(false));
  }, []);

  const connectRepo = async (repo: Repo) => {
    setConnecting(repo.full_name);
    setError(null);
    try {
      await api(`/github/projects/${projectId}/connect`, {
        method: "POST",
        body: { repo_full_name: repo.full_name },
      });
      onSuccess(repo.full_name);
    } catch (e: unknown) {
      setError(e instanceof Error ? e.message : "Failed to connect repo");
      setConnecting(null);
    }
  };

  const filtered = repos.filter((r) =>
    r.full_name.toLowerCase().includes(search.toLowerCase())
  );

  return (
    <ModalShell
      title="Choose a repository"
      onClose={onClose}
      subtitle={
        ghUser ? (
          <span className="flex items-center gap-1.5 text-xs text-text-muted">
            <span className="w-1.5 h-1.5 rounded-full bg-success shrink-0" />
            {ghUser}
            <button
              onClick={onDisconnect}
              className="ml-1 hover:text-error transition-colors underline"
            >
              disconnect
            </button>
          </span>
        ) : null
      }
    >
      {connecting ? (
        <div className="py-10 text-center space-y-3">
          <Spinner />
          <p className="text-sm text-text-secondary">Cloning <strong>{connecting}</strong>...</p>
          <p className="text-xs text-text-muted">Large repos may take a moment</p>
        </div>
      ) : (
        <>
          <input
            autoFocus
            type="text"
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            placeholder="Search your repositories..."
            className="w-full h-9 bg-bg border border-border rounded-lg px-3 text-sm text-text placeholder:text-text-muted focus:outline-none focus:border-accent/50 transition-colors mb-3"
          />

          <div className="overflow-y-auto max-h-64 -mx-5 px-3">
            {loading ? (
              <div className="py-8 flex justify-center"><Spinner /></div>
            ) : filtered.length === 0 ? (
              <p className="py-6 text-sm text-text-muted text-center">
                {search ? "No repos match your search" : "No repositories found"}
              </p>
            ) : (
              filtered.map((repo) => (
                <button
                  key={repo.full_name}
                  onClick={() => connectRepo(repo)}
                  className="w-full flex items-start gap-3 px-2 py-2.5 hover:bg-surface-2 rounded-lg transition-colors text-left group"
                >
                  <GitHubIcon className="w-4 h-4 text-text-muted shrink-0 mt-0.5" />
                  <div className="min-w-0 flex-1">
                    <p className="text-sm text-text group-hover:text-accent transition-colors truncate">
                      {repo.full_name}
                      {repo.private && (
                        <span className="ml-1.5 text-[9px] border border-border rounded px-1 py-px text-text-muted align-middle">
                          private
                        </span>
                      )}
                    </p>
                    {repo.description && (
                      <p className="text-xs text-text-muted truncate mt-0.5">{repo.description}</p>
                    )}
                  </div>
                </button>
              ))
            )}
          </div>

          {error && <p className="text-xs text-error mt-2">{error}</p>}
        </>
      )}
    </ModalShell>
  );
}

// ── Shared layout ──────────────────────────────────────────────────────────

function ModalShell({
  title,
  subtitle,
  children,
  onClose,
  back,
}: {
  title: string;
  subtitle?: React.ReactNode;
  children: React.ReactNode;
  onClose: () => void;
  back?: () => void;
}) {
  return (
    <>
      <div className="px-5 py-4 border-b border-border flex items-center justify-between">
        <div className="flex items-center gap-2">
          {back && (
            <button
              onClick={back}
              className="w-6 h-6 flex items-center justify-center rounded text-text-muted hover:text-text hover:bg-surface-2 transition-colors"
            >
              <svg className="w-3.5 h-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                <path strokeLinecap="round" strokeLinejoin="round" d="M15 19l-7-7 7-7" />
              </svg>
            </button>
          )}
          <div>
            <h2 className="text-sm font-semibold text-text">{title}</h2>
            {subtitle && <div className="mt-0.5">{subtitle}</div>}
          </div>
        </div>
        <button
          onClick={onClose}
          className="w-6 h-6 flex items-center justify-center rounded text-text-muted hover:text-text hover:bg-surface-2 transition-colors"
        >
          <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
            <path strokeLinecap="round" strokeLinejoin="round" d="M6 18L18 6M6 6l12 12" />
          </svg>
        </button>
      </div>
      <div className="px-5 py-4">{children}</div>
    </>
  );
}

// ── Icons / utilities ──────────────────────────────────────────────────────

function GitHubIcon({ className }: { className?: string }) {
  return (
    <svg className={className} viewBox="0 0 24 24" fill="currentColor">
      <path d="M12 2C6.477 2 2 6.484 2 12.017c0 4.425 2.865 8.18 6.839 9.504.5.092.682-.217.682-.483 0-.237-.008-.868-.013-1.703-2.782.605-3.369-1.343-3.369-1.343-.454-1.158-1.11-1.466-1.11-1.466-.908-.62.069-.608.069-.608 1.003.07 1.531 1.032 1.531 1.032.892 1.53 2.341 1.088 2.91.832.092-.647.35-1.088.636-1.338-2.22-.253-4.555-1.113-4.555-4.951 0-1.093.39-1.988 1.029-2.688-.103-.253-.446-1.272.098-2.65 0 0 .84-.27 2.75 1.026A9.564 9.564 0 0112 6.844c.85.004 1.705.115 2.504.337 1.909-1.296 2.747-1.027 2.747-1.027.546 1.379.202 2.398.1 2.651.64.7 1.028 1.595 1.028 2.688 0 3.848-2.339 4.695-4.566 4.943.359.309.678.92.678 1.855 0 1.338-.012 2.419-.012 2.747 0 .268.18.58.688.482A10.019 10.019 0 0022 12.017C22 6.484 17.522 2 12 2z" />
    </svg>
  );
}

function Spinner() {
  return <div className="w-5 h-5 border-2 border-border border-t-accent rounded-full animate-spin" />;
}
