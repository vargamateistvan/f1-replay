import { useMemo } from "react";
import type { RaceControl } from "@/api/types";
import {
  buildRaceControlMarkers,
  buildIncidentWindows,
  clusterRaceControlMarkers,
  normalizeRaceControl,
  summarizeMarkers,
} from "@/timeline/raceControl";
import {
  getSafetyControlPhase,
  isTrackClearSignal,
} from "@/utils/raceControlFlags";
import { lastAtOrBefore, upperBoundByValue } from "@/utils/sortedTime";

type TimedRaceControlSignal = {
  row: RaceControl;
  absMs: number;
  relMs: number;
  phase: ReturnType<typeof getSafetyControlPhase>;
  messageUpper: string;
  clearsTrack: boolean;
};

type TrackVehicleStatePoint = {
  absMs: number;
  safetyCar: boolean;
  vsc: boolean;
  medicalCar: boolean;
};

type ClosedIncidentWindow = ReturnType<typeof buildIncidentWindows>[number] & {
  endMs: number;
};

function isClosedIncidentWindow(
  window: ReturnType<typeof buildIncidentWindows>[number],
): window is ClosedIncidentWindow {
  return window.endMs !== null;
}

interface UseRaceWeekendRaceControlStateArgs {
  raceControlEntries: RaceControl[];
  sessionStartMs: number;
  sessionTimeMsSlow: number;
}

export function useRaceWeekendRaceControlState({
  raceControlEntries,
  sessionStartMs,
  sessionTimeMsSlow,
}: Readonly<UseRaceWeekendRaceControlStateArgs>) {
  const timedRaceControl = useMemo(() => {
    if (!sessionStartMs || !raceControlEntries.length) return [];
    return raceControlEntries
      .map((entry) => {
        const absMs = new Date(entry.date).getTime();
        return { row: entry, absMs, relMs: absMs - sessionStartMs };
      })
      .sort((a, b) => a.absMs - b.absMs);
  }, [raceControlEntries, sessionStartMs]);

  const timedRaceControlSignals = useMemo((): TimedRaceControlSignal[] => {
    if (!timedRaceControl.length) return [];
    return timedRaceControl.map(({ row, absMs, relMs }) => ({
      row,
      absMs,
      relMs,
      phase: getSafetyControlPhase(row),
      messageUpper: (row.message ?? "").toUpperCase(),
      clearsTrack: isTrackClearSignal(row),
    }));
  }, [timedRaceControl]);

  const trackVehicleStateTimeline = useMemo((): TrackVehicleStatePoint[] => {
    if (!timedRaceControlSignals.length) return [];

    let safetyCar = false;
    let vsc = false;
    let medicalCar = false;
    const timeline: TrackVehicleStatePoint[] = [];

    for (const signal of timedRaceControlSignals) {
      const { absMs, phase, messageUpper, clearsTrack } = signal;

      if (clearsTrack) {
        safetyCar = false;
        vsc = false;
        medicalCar = false;
      }

      if (phase === "safety_car_start") {
        safetyCar = true;
        vsc = false;
      } else if (phase === "safety_car_end") {
        safetyCar = false;
      }

      if (phase === "vsc_start") {
        vsc = true;
        safetyCar = false;
      } else if (phase === "vsc_end") {
        vsc = false;
      }

      if (messageUpper.includes("MEDICAL CAR")) {
        if (
          messageUpper.includes("IN THIS LAP") ||
          messageUpper.includes("ENDING") ||
          messageUpper.includes("HAS ENDED") ||
          messageUpper.includes("RETURN") ||
          messageUpper.includes("WITHDRAW")
        ) {
          medicalCar = false;
        } else {
          medicalCar = true;
        }
      }

      timeline.push({ absMs, safetyCar, vsc, medicalCar });
    }

    return timeline;
  }, [timedRaceControlSignals]);

  const normalizedRcEvents = useMemo(
    () => normalizeRaceControl(raceControlEntries, sessionStartMs),
    [raceControlEntries, sessionStartMs],
  );

  const raceControlMarkers = useMemo(() => {
    const raw = buildRaceControlMarkers(normalizedRcEvents);
    return clusterRaceControlMarkers(raw);
  }, [normalizedRcEvents]);

  const markerSummary = useMemo(
    () => summarizeMarkers(raceControlMarkers),
    [raceControlMarkers],
  );

  const incidentWindows = useMemo(
    () => buildIncidentWindows(normalizedRcEvents),
    [normalizedRcEvents],
  );

  const closedIncidentWindows = useMemo(
    () => incidentWindows.filter(isClosedIncidentWindow),
    [incidentWindows],
  );

  const chequeredMs = useMemo(() => {
    if (!timedRaceControl.length) return null;
    let lastChequered: number | null = null;
    for (const { row: entry, relMs } of timedRaceControl) {
      if (entry.flag !== "CHEQUERED") continue;
      lastChequered = relMs;
    }
    return lastChequered;
  }, [timedRaceControl]);

  const nextReplayIncident = useMemo(() => {
    const MIN_AHEAD_MS = 250;
    const nextIdx = upperBoundByValue(
      closedIncidentWindows,
      sessionTimeMsSlow + MIN_AHEAD_MS,
      (window) => window.startMs,
    );
    return closedIncidentWindows[nextIdx];
  }, [closedIncidentWindows, sessionTimeMsSlow]);

  const currentReplayIncident = useMemo(() => {
    const currentWindow = lastAtOrBefore(
      closedIncidentWindows,
      sessionTimeMsSlow,
      (window) => window.startMs,
    );
    if (!currentWindow) return undefined;
    return currentWindow.endMs >= sessionTimeMsSlow ? currentWindow : undefined;
  }, [closedIncidentWindows, sessionTimeMsSlow]);

  const firstReplayIncident = useMemo(
    () => closedIncidentWindows[0],
    [closedIncidentWindows],
  );

  return {
    timedRaceControl,
    trackVehicleStateTimeline,
    raceControlMarkers,
    markerSummary,
    incidentWindows,
    chequeredMs,
    nextReplayIncident,
    currentReplayIncident,
    firstReplayIncident,
  } as const;
}
