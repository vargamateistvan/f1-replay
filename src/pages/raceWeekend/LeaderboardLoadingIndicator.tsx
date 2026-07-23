export function LeaderboardLoadingIndicator() {
  return (
    <div className="border-b border-panel bg-track px-3 py-2 sm:px-4">
      <div className="rounded-sm border border-panel bg-surface px-3 py-2">
        <div className="text-f1red text-[10px] font-black uppercase tracking-[0.14em] animate-pulse">
          Loading session data
        </div>
        <div className="mt-1 text-xs text-muted">
          Preparing timing and event feeds for this session.
        </div>
      </div>
    </div>
  );
}
