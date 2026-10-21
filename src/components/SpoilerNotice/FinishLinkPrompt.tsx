import { EyeOff } from "lucide-react";

interface Props {
  /** "Dutch Grand Prix – Race", for the message. */
  sessionLabel: string;
  /** Race control is still loading, so it isn't known yet whether the link is past the finish. */
  checking: boolean;
  onStartOver: () => void;
  onReveal: () => void;
}

/**
 * Covers the replay when a shared `?t=` link would land after the finish of a
 * race the user hasn't seen yet (spoiler-free mode).
 */
export function FinishLinkPrompt({
  sessionLabel,
  checking,
  onStartOver,
  onReveal,
}: Readonly<Props>) {
  return (
    <div
      role="dialog"
      aria-modal="true"
      aria-labelledby="finish-link-prompt-title"
      className="fixed inset-0 z-50 flex items-center justify-center bg-track px-4"
    >
      <div className="w-full max-w-sm border border-panel bg-surface p-5 text-sm">
        <div className="flex items-center gap-2">
          <EyeOff className="h-4 w-4 shrink-0 text-muted" aria-hidden />
          <h2 id="finish-link-prompt-title" className="font-black text-white">
            {checking ? "Checking for spoilers…" : "This link starts after the finish"}
          </h2>
        </div>
        {!checking && (
          <>
            <p className="mt-2 text-xs text-muted">
              You haven&apos;t watched {sessionLabel} yet, and spoiler-free mode
              is on. Opening the link here would show the result.
            </p>
            <div className="mt-4 flex flex-wrap gap-2">
              <button
                type="button"
                onClick={onStartOver}
                className="bg-f1red px-3 py-1.5 text-[11px] font-bold uppercase tracking-wider text-white"
              >
                Start from the beginning
              </button>
              <button
                type="button"
                onClick={onReveal}
                className="border border-panel px-3 py-1.5 text-[11px] font-bold uppercase tracking-wider text-muted hover:text-white"
              >
                Show it anyway
              </button>
            </div>
          </>
        )}
      </div>
    </div>
  );
}
