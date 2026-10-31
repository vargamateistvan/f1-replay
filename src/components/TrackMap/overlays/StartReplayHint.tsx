import { Loader2, Play } from "lucide-react";
import { FOCUS_RING } from "@/components/Button/buttonClass";
import { trackEvent } from "@/lib/analytics";
import { useTimeline } from "@/timeline/clock";

/**
 * Centred map card shown while no car positions are on screen: a play call to
 * action when paused, a quiet waiting state while playback runs.
 */
export function StartReplayHint() {
  const playing = useTimeline((s) => s.playing);
  const setPlaying = useTimeline((s) => s.setPlaying);

  return (
    <div className="pointer-events-none absolute inset-0 z-10 flex items-center justify-center p-4">
      <div
        className="pointer-events-auto flex items-center gap-3 rounded-sm border border-panel border-l-2 border-l-f1red bg-gradient-to-br from-panel/45 to-track/95 to-55% py-2.5 pl-2.5 pr-4 shadow-md"
        style={{ backdropFilter: "blur(4px)" }}
      >
        {playing ? (
          <>
            <span className="flex h-9 w-9 shrink-0 items-center justify-center border border-panel text-muted">
              <Loader2
                size={16}
                strokeWidth={2.2}
                className="animate-spin motion-reduce:animate-none"
                aria-hidden="true"
              />
            </span>
            <div role="status" className="flex flex-col gap-0.5">
              <span className="text-micro font-bold uppercase tracking-eyebrow text-f1red-fg">
                Replay running
              </span>
              <span className="text-compact font-black uppercase tracking-caps text-fg">
                Waiting for car positions
              </span>
            </div>
          </>
        ) : (
          <>
            <button
              type="button"
              onClick={() => {
                trackEvent("playback_toggle", {
                  action: "play",
                  current_ms: Math.round(useTimeline.getState().t),
                  source: "map_hint",
                });
                setPlaying(true);
              }}
              className={`flex h-9 w-9 shrink-0 items-center justify-center bg-f1red text-white transition-colors hover:bg-f1red-hover ${FOCUS_RING}`}
              aria-label="Start replay"
              title="Play (Space)"
            >
              <Play size={16} strokeWidth={2.4} aria-hidden="true" />
            </button>
            <div className="flex flex-col gap-0.5">
              <span className="text-micro font-bold uppercase tracking-eyebrow text-f1red-fg">
                Replay ready
              </span>
              <span className="text-compact font-black uppercase tracking-caps text-fg">
                Press play to start
              </span>
              <span className="hidden items-center gap-1 text-caption text-muted md:flex">
                or hit
                <kbd className="border border-panel bg-track px-1.5 py-px font-mono text-tiny font-bold text-fg">
                  Space
                </kbd>
              </span>
            </div>
          </>
        )}
      </div>
    </div>
  );
}
