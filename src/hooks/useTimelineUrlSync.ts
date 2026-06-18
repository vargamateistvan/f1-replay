import { useEffect, useRef } from "react";
import { useSearchParams } from "react-router-dom";
import { useTimeline } from "@/timeline/clock";

// Throttle URL writes so scrubbing/playback doesn't spam history (we use replace,
// so this only bounds churn, not back-stack growth).
const PERSIST_THROTTLE_MS = 2000;

// Keeps the playhead (`t`, in whole seconds) and `speed` in the URL so a Race
// Weekend view is shareable/reloadable. Restores once from a deep link, then
// resets the clock whenever the user manually switches sessions.
export function useTimelineUrlSync(sessionKey: number | null, ready: boolean) {
  const [, setParams] = useSearchParams();
  const didRestore = useRef(false);
  const prevSession = useRef<number | null>(null);

  useEffect(() => {
    if (sessionKey === null) return;

    // Manual session switch after mount → start fresh and don't restore a stale
    // playhead from the previous session onto the new one.
    if (prevSession.current !== null && prevSession.current !== sessionKey) {
      useTimeline.getState().reset();
      didRestore.current = true;
    }
    prevSession.current = sessionKey;

    if (!ready || didRestore.current) return;
    didRestore.current = true;

    const sp = new URLSearchParams(window.location.search);
    const store = useTimeline.getState();
    if (sp.get("t") !== null) {
      const tSec = Number(sp.get("t"));
      if (!Number.isNaN(tSec)) store.setT(tSec * 1000);
    }
    if (sp.get("speed") !== null) {
      const speed = Number(sp.get("speed"));
      if (!Number.isNaN(speed)) store.setSpeed(speed);
    }
  }, [ready, sessionKey]);

  // Persist t + speed back to the URL, throttled, via a vanilla store subscription
  // (no React re-render per frame).
  useEffect(() => {
    if (sessionKey === null) return;
    let last = 0;
    let lastT = -1;
    let lastSpeed = -1;

    const unsub = useTimeline.subscribe((s) => {
      const now = Date.now();
      if (now - last < PERSIST_THROTTLE_MS) return;
      const tSec = Math.round(s.t / 1000);
      if (tSec === lastT && s.speed === lastSpeed) return;
      last = now;
      lastT = tSec;
      lastSpeed = s.speed;

      setParams(
        (prev) => {
          const p = new URLSearchParams(prev);
          if (tSec > 0) p.set("t", String(tSec));
          else p.delete("t");
          if (s.speed !== 1) p.set("speed", String(s.speed));
          else p.delete("speed");
          return p;
        },
        { replace: true },
      );
    });
    return unsub;
  }, [sessionKey, setParams]);
}
