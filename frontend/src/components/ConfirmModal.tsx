"use client";

interface ConfirmModalProps {
  message: string;
  tool: string;
  onApprove: () => void;
  onReject: () => void;
}

export function ConfirmModal({ message, tool, onApprove, onReject }: ConfirmModalProps) {
  return (
    <div className="fixed inset-0 bg-black/70 backdrop-blur-sm flex items-center justify-center z-50 p-4">
      <div className="bg-surface border border-error/40 rounded-2xl w-full max-w-sm shadow-2xl overflow-hidden">
        {/* Header */}
        <div className="px-5 py-4 border-b border-border flex items-center gap-3">
          <div className="w-8 h-8 rounded-full bg-error/10 border border-error/30 flex items-center justify-center shrink-0">
            <svg className="w-4 h-4 text-error" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
              <path strokeLinecap="round" strokeLinejoin="round" d="M12 9v3.75m-9.303 3.376c-.866 1.5.217 3.374 1.948 3.374h14.71c1.73 0 2.813-1.874 1.948-3.374L13.949 3.378c-.866-1.5-3.032-1.5-3.898 0L2.697 16.126zM12 15.75h.007v.008H12v-.008z" />
            </svg>
          </div>
          <div>
            <h2 className="text-sm font-semibold text-text">Confirm destructive action</h2>
            <p className="text-[11px] text-text-muted mt-0.5 uppercase tracking-wider">{tool}</p>
          </div>
        </div>

        {/* Message */}
        <div className="px-5 py-4">
          <p className="text-sm text-text-secondary leading-relaxed">{message}</p>
        </div>

        {/* Actions */}
        <div className="px-5 pb-5 flex items-center gap-2">
          <button
            onClick={onReject}
            className="flex-1 h-9 rounded-lg border border-border text-sm text-text-secondary hover:bg-surface-2 transition-colors"
          >
            Cancel
          </button>
          <button
            onClick={onApprove}
            className="flex-1 h-9 rounded-lg bg-error text-white text-sm font-medium hover:opacity-90 transition-opacity"
          >
            Confirm
          </button>
        </div>
      </div>
    </div>
  );
}
