import { useEffect, useRef, useState } from "react";
import { trackEvent } from "@/lib/analytics";

interface ReplayStartup {
  sessionKey: number | null;
  sessionReady: boolean;
  timingReady: boolean;
  coreSettled: boolean;
  needsLocation: boolean;
  locationSettled: boolean;
  locationReady: boolean;
  live: boolean;
}

/** Stages startup without blocking secondary feeds again on a seek or view change. */
export function useReplayStartup({
  sessionKey,
  sessionReady,
  timingReady,
  coreSettled,
  needsLocation,
  locationSettled,
  locationReady,
  live,
}: ReplayStartup) {
  const [releasedSession, setReleasedSession] = useState<number | null>(null);
  const load = useRef({
    sessionKey,
    startedAt: performance.now(),
    milestones: new Set<string>(),
  });
  const canRelease =
    sessionKey !== null && coreSettled && (!needsLocation || locationSettled);
  const secondaryEnabled =
    sessionKey !== null && (releasedSession === sessionKey || canRelease);

  useEffect(() => {
    if (canRelease) setReleasedSession(sessionKey);
    else if (releasedSession !== sessionKey) setReleasedSession(null);
  }, [canRelease, releasedSession, sessionKey]);

  useEffect(() => {
    if (load.current.sessionKey !== sessionKey) {
      // Include discovery time on a fresh landing, before a session is selected.
      if (load.current.sessionKey !== null) {
        load.current.startedAt = performance.now();
        load.current.milestones.clear();
      }
      load.current.sessionKey = sessionKey;
    }
    if (sessionKey === null) return;

    function milestone(name: string, ready: boolean) {
      if (!ready || load.current.milestones.has(name)) return;
      load.current.milestones.add(name);
      trackEvent(name, {
        session_key: sessionKey ?? undefined,
        elapsed_ms: Math.round(performance.now() - load.current.startedAt),
        live,
        needs_location: needsLocation,
      });
    }

    milestone("replay_load_started", true);
    milestone("replay_session_ready", sessionReady);
    milestone("replay_timing_ready", timingReady);
    milestone("replay_location_ready", needsLocation && locationReady);
    milestone(
      "replay_data_ready",
      timingReady && (!needsLocation || locationReady),
    );
  }, [sessionKey, sessionReady, timingReady, needsLocation, locationReady, live]);

  return secondaryEnabled;
}
