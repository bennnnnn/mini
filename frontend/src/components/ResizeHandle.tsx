"use client";

interface ResizeHandleProps {
  onMouseDown: (e: React.MouseEvent) => void;
}

export function ResizeHandle({ onMouseDown }: ResizeHandleProps) {
  return (
    <div
      onMouseDown={onMouseDown}
      className="group relative w-1 shrink-0 cursor-col-resize bg-border hover:bg-accent/60 active:bg-accent transition-colors"
      title="Drag to resize"
    >
      {/* Wider invisible hit area so the cursor is easy to grab */}
      <div className="absolute inset-y-0 -left-1.5 -right-1.5" />

      {/* Drag indicator dots */}
      <div className="absolute inset-y-0 left-1/2 -translate-x-1/2 flex flex-col items-center justify-center gap-1 opacity-0 group-hover:opacity-100 transition-opacity pointer-events-none">
        <span className="w-0.5 h-0.5 rounded-full bg-accent" />
        <span className="w-0.5 h-0.5 rounded-full bg-accent" />
        <span className="w-0.5 h-0.5 rounded-full bg-accent" />
      </div>
    </div>
  );
}
