import { useCallback } from "react";
import { trackEvent } from "@/lib/analytics";

export type CommentaryTimeMode = "elapsed" | "all";

interface UseCommentaryInteractionsArgs {
  commentaryTimeMode: CommentaryTimeMode;
  setCommentaryTimeMode: (value: CommentaryTimeMode) => void;
  setTimelineT: (value: number) => void;
  setIncidentReplayEndMs: (value: number | null) => void;
  setTimelinePlaying: (value: boolean) => void;
}

export function useCommentaryInteractions({
  commentaryTimeMode,
  setCommentaryTimeMode,
  setTimelineT,
  setIncidentReplayEndMs,
  setTimelinePlaying,
}: Readonly<UseCommentaryInteractionsArgs>) {
  const handleCommentaryTimeModeToggle = useCallback(() => {
    const nextValue = commentaryTimeMode === "all" ? "elapsed" : "all";
    trackEvent("raceweekend_commentary_time_mode_changed", {
      mode: nextValue,
    });
    setCommentaryTimeMode(nextValue);
  }, [commentaryTimeMode, setCommentaryTimeMode]);

  const handleCommentaryPlayWindow = useCallback(
    (startMs: number, endMs: number) => {
      trackEvent("raceweekend_commentary_play_window", {
        start_ms: Math.round(startMs),
        end_ms: Math.round(endMs),
      });
      setTimelineT(startMs);
      setIncidentReplayEndMs(endMs);
      setTimelinePlaying(true);
    },
    [setIncidentReplayEndMs, setTimelinePlaying, setTimelineT],
  );

  return {
    handleCommentaryTimeModeToggle,
    handleCommentaryPlayWindow,
  };
}
