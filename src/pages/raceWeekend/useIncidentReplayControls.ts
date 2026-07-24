import { useCallback, useEffect, useState } from "react";

interface ReplayIncident {
  startMs: number;
  endMs: number;
}

interface UseIncidentReplayControlsArgs {
  sessionKey: number | null;
  sessionTimeMs: number;
  currentReplayIncident?: ReplayIncident;
  nextReplayIncident?: ReplayIncident;
  firstReplayIncident?: ReplayIncident;
  setTimelineT: (value: number) => void;
  setTimelinePlaying: (value: boolean) => void;
}

export function useIncidentReplayControls({
  sessionKey,
  sessionTimeMs,
  currentReplayIncident,
  nextReplayIncident,
  firstReplayIncident,
  setTimelineT,
  setTimelinePlaying,
}: Readonly<UseIncidentReplayControlsArgs>) {
  const [incidentReplayEndMs, setIncidentReplayEndMs] = useState<number | null>(
    null,
  );
  const [incidentReplayHint, setIncidentReplayHint] = useState<string | null>(
    null,
  );

  useEffect(() => {
    if (incidentReplayEndMs === null) return;
    if (sessionTimeMs < incidentReplayEndMs) return;
    setTimelinePlaying(false);
    setIncidentReplayEndMs(null);
  }, [incidentReplayEndMs, sessionTimeMs, setTimelinePlaying]);

  useEffect(() => {
    setIncidentReplayEndMs(null);
    setIncidentReplayHint(null);
  }, [sessionKey]);

  useEffect(() => {
    if (!incidentReplayHint) return;
    const id = window.setTimeout(() => setIncidentReplayHint(null), 2200);
    return () => window.clearTimeout(id);
  }, [incidentReplayHint]);

  const replayCurrentIncident = useCallback(() => {
    const chosen = currentReplayIncident;
    if (!chosen) return;
    setIncidentReplayHint("Replaying current incident");
    setTimelineT(chosen.startMs);
    setIncidentReplayEndMs(chosen.endMs);
    setTimelinePlaying(true);
  }, [currentReplayIncident, setTimelinePlaying, setTimelineT]);

  const replayNextIncident = useCallback(() => {
    const chosen = nextReplayIncident ?? firstReplayIncident;
    if (!chosen) return;
    if (!nextReplayIncident && firstReplayIncident) {
      setIncidentReplayHint("Wrapped to first incident");
    }
    setTimelineT(chosen.startMs);
    setIncidentReplayEndMs(chosen.endMs);
    setTimelinePlaying(true);
  }, [
    firstReplayIncident,
    nextReplayIncident,
    setTimelinePlaying,
    setTimelineT,
  ]);

  return {
    incidentReplayEndMs,
    setIncidentReplayEndMs,
    incidentReplayHint,
    replayCurrentIncident,
    replayNextIncident,
  } as const;
}
