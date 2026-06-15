"use client";

import { Component, type ReactNode } from "react";

interface Props {
  children: ReactNode;
  fallback?: ReactNode;
}

interface State {
  hasError: boolean;
  error: Error | null;
}

export class ErrorBoundary extends Component<Props, State> {
  constructor(props: Props) {
    super(props);
    this.state = { hasError: false, error: null };
  }

  static getDerivedStateFromError(error: Error): State {
    return { hasError: true, error };
  }

  componentDidCatch(error: Error, info: { componentStack: string }) {
    console.error("[ErrorBoundary] Uncaught error:", error);
    console.error("[ErrorBoundary] Component stack:", info.componentStack);
  }

  render() {
    if (this.state.hasError) {
      if (this.props.fallback) return this.props.fallback;
      return <DefaultFallback error={this.state.error} onReset={() => this.setState({ hasError: false, error: null })} />;
    }
    return this.props.children;
  }
}

function DefaultFallback({ error, onReset }: { error: Error | null; onReset: () => void }) {
  return (
    <div className="min-h-screen bg-[#0a0a0b] flex items-center justify-center p-8">
      <div className="max-w-md text-center space-y-4">
        <div className="w-12 h-12 mx-auto rounded-xl bg-error/10 border border-error/20 flex items-center justify-center">
          <svg className="w-6 h-6 text-error" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.5}>
            <path strokeLinecap="round" strokeLinejoin="round" d="M12 9v3.75m-9.303 3.376c-.866 1.5.217 3.374 1.948 3.374h14.71c1.73 0 2.813-1.874 1.948-3.374L13.949 3.378c-.866-1.5-3.032-1.5-3.898 0L2.697 16.126zM12 15.75h.007v.008H12v-.008z" />
          </svg>
        </div>
        <h2 className="text-lg font-semibold text-white">Something went wrong</h2>
        {error && (
          <p className="text-sm text-zinc-500 font-mono break-all">{error.message}</p>
        )}
        <button
          onClick={onReset}
          className="h-9 px-4 rounded-lg bg-white text-black text-sm font-medium hover:bg-zinc-200 transition-colors"
        >
          Try again
        </button>
      </div>
    </div>
  );
}
