"use client";

import { GoogleLogin } from "@react-oauth/google";
import toast from "react-hot-toast";

interface AuthModalProps {
  theme: "dark" | "light";
  onClose: () => void;
  onLogin: (credential: string) => Promise<void>;
}

export function AuthModal({ theme, onClose, onLogin }: AuthModalProps) {
  const handleSuccess = async (credential: string) => {
    try {
      await onLogin(credential);
      onClose();
    } catch (e: unknown) {
      toast.error(e instanceof Error ? e.message : "Login failed");
    }
  };

  return (
    /* Backdrop */
    <div
      className="fixed inset-0 bg-black/70 flex items-center justify-center z-50 p-4 backdrop-blur-sm"
      onClick={onClose}
    >
      {/* Card — stop propagation so clicks inside don't close */}
      <div
        className="bg-surface border border-border rounded-2xl p-8 w-full max-w-sm space-y-6 shadow-2xl"
        onClick={(e) => e.stopPropagation()}
      >
        {/* Logo + heading */}
        <div className="text-center space-y-3">
          <div className="w-10 h-10 rounded-xl bg-accent/10 border border-accent/20 flex items-center justify-center mx-auto">
            <svg className="w-5 h-5 text-accent" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.5}>
              <path strokeLinecap="round" strokeLinejoin="round" d="M9.813 15.904L9 18.75l-.813-2.846a4.5 4.5 0 00-3.09-3.09L2.25 12l2.846-.813a4.5 4.5 0 003.09-3.09L9 5.25l.813 2.846a4.5 4.5 0 003.09 3.09L15.75 12l-2.846.813a4.5 4.5 0 00-3.09 3.09z" />
            </svg>
          </div>
          <div>
            <h2 className="text-lg font-semibold text-text">Sign in to Mini Cursor</h2>
            <p className="text-sm text-text-secondary mt-1">
              Save your projects and connect GitHub
            </p>
          </div>
        </div>

        {/* Google OAuth button */}
        <div className="flex justify-center">
          <GoogleLogin
            onSuccess={(res) => {
              if (res.credential) handleSuccess(res.credential);
            }}
            onError={() => toast.error("Google login failed")}
            theme={theme === "dark" ? "filled_black" : "outline"}
            size="large"
            text="signin_with"
            shape="rectangular"
          />
        </div>

        {/* Dismiss */}
        <button
          onClick={onClose}
          className="w-full text-sm text-text-muted hover:text-text-secondary transition-colors py-1"
        >
          Continue without signing in
        </button>
      </div>
    </div>
  );
}
