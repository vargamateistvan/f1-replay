import { useState, useEffect } from "react";
import { useTimeline } from "@/timeline/clock";

// Returns `t` (session-relative ms) throttled to at most once per `intervalMs`.
// Use this in step-based panels (LiveTiming, StrategyBar, Weather, etc.) so they
// reconcile at ~10 Hz instead of 60 Hz. TrackMap handles its own 60 Hz subscription
// independently via its own useTimeline() call inside the component.
export function useCoarseTime(intervalMs = 100): number {
  const [coarse, setCoarse] = useState(() => {
    try {
      return useTimeline.getState().t;
    } catch {
      return 0;
    }
  });

  useEffect(() => {
    let lastUpdate = 0;
    let trailing: ReturnType<typeof setTimeout> | null = null;
    const unsubscribe = useTimeline.subscribe?.((s) => {
      const now = Date.now();
      if (now - lastUpdate >= intervalMs) {
        if (trailing) clearTimeout(trailing);
        trailing = null;
        lastUpdate = now;
        setCoarse(s.t);
        return;
      }
      // Throttled: still deliver the latest value at the end of the window.
      // Without this a seek while paused (e.g. restoring ?t= right after the
      // session loads) can be dropped and never corrected.
      const latest = s.t;
      if (trailing) clearTimeout(trailing);
      trailing = setTimeout(() => {
        trailing = null;
        lastUpdate = Date.now();
        setCoarse(latest);
      }, intervalMs - (now - lastUpdate));
    });
    return () => {
      if (trailing) clearTimeout(trailing);
      unsubscribe?.();
    };
  }, [intervalMs]);

  return coarse;
}
