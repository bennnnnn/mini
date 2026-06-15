"use client";

import { useState } from "react";

interface NewProjectModalProps {
  onClose: () => void;
  onCreate: (name: string, description: string) => Promise<{ id: string; name: string }>;
  onConnectGitHub: (projectId: string) => void;
}

export function NewProjectModal({ onClose, onCreate, onConnectGitHub }: NewProjectModalProps) {
  const [name, setName] = useState("");
  const [description, setDescription] = useState("");
  const [loading, setLoading] = useState(false);
  const [created, setCreated] = useState<{ id: string; name: string } | null>(null);
  const [error, setError] = useState("");

  const handleCreate = async () => {
    if (!name.trim()) return;
    setLoading(true);
    setError("");
    try {
      const project = await onCreate(name.trim(), description.trim());
      setCreated(project);
    } catch (e: unknown) {
      setError(e instanceof Error ? e.message : "Failed to create project");
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="fixed inset-0 bg-black/70 backdrop-blur-sm flex items-center justify-center z-50 p-4" onClick={onClose}>
      <div className="bg-surface border border-border rounded-2xl w-full max-w-md shadow-2xl" onClick={e => e.stopPropagation()}>

        {!created ? (
          <>
            {/* Header */}
            <div className="px-6 py-5 border-b border-border">
              <h2 className="text-base font-semibold text-text">New project</h2>
              <p className="text-xs text-text-muted mt-0.5">Give the agent context about what you're building</p>
            </div>

            {/* Form */}
            <div className="px-6 py-5 space-y-4">
              <div className="space-y-1.5">
                <label className="text-xs font-medium text-text-secondary">Project name</label>
                <input
                  autoFocus
                  type="text"
                  value={name}
                  onChange={e => setName(e.target.value)}
                  onKeyDown={e => e.key === "Enter" && !e.shiftKey && handleCreate()}
                  placeholder="e.g. Africana Mobile App"
                  className="w-full h-9 bg-bg border border-border rounded-lg px-3 text-sm text-text placeholder:text-text-muted focus:outline-none focus:border-accent/50 focus:ring-1 focus:ring-accent/20 transition-colors"
                />
              </div>

              <div className="space-y-1.5">
                <label className="text-xs font-medium text-text-secondary">
                  Description <span className="text-text-muted font-normal">— helps the agent understand your project</span>
                </label>
                <textarea
                  value={description}
                  onChange={e => setDescription(e.target.value)}
                  placeholder="e.g. A React Native app for the African community. Uses Expo, TypeScript, Supabase for the backend, and Tailwind for styling. Target users are 18–35 year olds in West Africa."
                  rows={4}
                  className="w-full bg-bg border border-border rounded-lg px-3 py-2.5 text-sm text-text placeholder:text-text-muted resize-none focus:outline-none focus:border-accent/50 focus:ring-1 focus:ring-accent/20 transition-colors leading-relaxed"
                />
                <p className="text-[11px] text-text-muted">
                  Include: tech stack, target users, key features, any constraints. The more context, the smarter the agent.
                </p>
              </div>

              {error && <p className="text-xs text-error">{error}</p>}
            </div>

            {/* Actions */}
            <div className="px-6 pb-5 flex gap-2">
              <button onClick={onClose} className="flex-1 h-9 rounded-lg border border-border text-sm text-text-secondary hover:bg-surface-2 transition-colors">
                Cancel
              </button>
              <button
                onClick={handleCreate}
                disabled={!name.trim() || loading}
                className="flex-1 h-9 rounded-lg bg-accent text-white text-sm font-medium hover:bg-accent-hover disabled:opacity-40 disabled:cursor-not-allowed transition-colors"
              >
                {loading ? "Creating..." : "Create project"}
              </button>
            </div>
          </>
        ) : (
          <>
            {/* Success state — offer GitHub options */}
            <div className="px-6 py-5 border-b border-border">
              <div className="flex items-center gap-2 mb-1">
                <svg className="w-4 h-4 text-success" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}><path strokeLinecap="round" strokeLinejoin="round" d="M9 12.75L11.25 15 15 9.75M21 12a9 9 0 11-18 0 9 9 0 0118 0z" /></svg>
                <h2 className="text-base font-semibold text-text">"{created.name}" created</h2>
              </div>
              <p className="text-xs text-text-muted">Would you like to connect a GitHub repository?</p>
            </div>

            <div className="px-6 py-5 space-y-3">
              {/* Connect existing repo */}
              <button
                onClick={() => { onConnectGitHub(created.id); onClose(); }}
                className="w-full flex items-center gap-3 px-4 py-3.5 bg-surface-2 border border-border rounded-xl hover:border-border-strong transition-colors text-left group"
              >
                <div className="w-8 h-8 rounded-lg bg-bg border border-border flex items-center justify-center shrink-0">
                  <GitHubIcon className="w-4 h-4 text-text-secondary" />
                </div>
                <div>
                  <p className="text-sm font-medium text-text">Clone an existing repo</p>
                  <p className="text-xs text-text-muted">Pull code from your GitHub account</p>
                </div>
                <svg className="w-4 h-4 text-text-muted ml-auto" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}><path strokeLinecap="round" strokeLinejoin="round" d="M9 5l7 7-7 7" /></svg>
              </button>

              {/* Start fresh */}
              <button
                onClick={onClose}
                className="w-full flex items-center gap-3 px-4 py-3.5 bg-surface-2 border border-border rounded-xl hover:border-border-strong transition-colors text-left"
              >
                <div className="w-8 h-8 rounded-lg bg-bg border border-border flex items-center justify-center shrink-0">
                  <svg className="w-4 h-4 text-text-secondary" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.5}><path strokeLinecap="round" strokeLinejoin="round" d="M12 4.5v15m7.5-7.5h-15" /></svg>
                </div>
                <div>
                  <p className="text-sm font-medium text-text">Start from scratch</p>
                  <p className="text-xs text-text-muted">Let the agent create the project structure</p>
                </div>
                <svg className="w-4 h-4 text-text-muted ml-auto" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}><path strokeLinecap="round" strokeLinejoin="round" d="M9 5l7 7-7 7" /></svg>
              </button>
            </div>
          </>
        )}
      </div>
    </div>
  );
}

function GitHubIcon({ className }: { className?: string }) {
  return (
    <svg className={className} viewBox="0 0 24 24" fill="currentColor">
      <path d="M12 2C6.477 2 2 6.484 2 12.017c0 4.425 2.865 8.18 6.839 9.504.5.092.682-.217.682-.483 0-.237-.008-.868-.013-1.703-2.782.605-3.369-1.343-3.369-1.343-.454-1.158-1.11-1.466-1.11-1.466-.908-.62.069-.608.069-.608 1.003.07 1.531 1.032 1.531 1.032.892 1.53 2.341 1.088 2.91.832.092-.647.35-1.088.636-1.338-2.22-.253-4.555-1.113-4.555-4.951 0-1.093.39-1.988 1.029-2.688-.103-.253-.446-1.272.098-2.65 0 0 .84-.27 2.75 1.026A9.564 9.564 0 0112 6.844c.85.004 1.705.115 2.504.337 1.909-1.296 2.747-1.027 2.747-1.027.546 1.379.202 2.398.1 2.651.64.7 1.028 1.595 1.028 2.688 0 3.848-2.339 4.695-4.566 4.943.359.309.678.92.678 1.855 0 1.338-.012 2.419-.012 2.747 0 .268.18.58.688.482A10.019 10.019 0 0022 12.017C22 6.484 17.522 2 12 2z" />
    </svg>
  );
}
