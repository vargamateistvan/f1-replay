interface CommentaryStatusBarProps {
  lapLabel: string;
  timeMode: "elapsed" | "all";
  onToggleTimeMode: () => void;
}

export function CommentaryStatusBar({
  lapLabel,
  timeMode,
  onToggleTimeMode,
}: Readonly<CommentaryStatusBarProps>) {
  const isAllMode = timeMode === "all";

  return (
    <div className="shrink-0 border-b border-panel bg-surface/70 px-3 py-1.5">
      <div className="flex items-center gap-3">
        <span className="text-[10px] font-black uppercase tracking-[0.12em] text-muted">
          Lap <span className="text-white tabular-nums">{lapLabel}</span>
        </span>
        <button
          type="button"
          onClick={onToggleTimeMode}
          className={`h-5 px-2 text-[9px] font-black uppercase tracking-widest border transition-colors ${
            isAllMode
              ? "border-f1red bg-f1red text-white"
              : "border-panel bg-track text-muted hover:text-white"
          }`}
          title={
            isAllMode
              ? "Showing all commentary items"
              : "Showing elapsed commentary items"
          }
        >
          {isAllMode ? "All" : "Elapsed"}
        </button>
      </div>
    </div>
  );
}
