import { useMemo } from "react";
import type { RaceControl, Weather } from "@/api/types";
import type {
  ActiveTrackFlagState,
  ActiveTrackVehicles,
} from "@/components/TrackMap/TrackMap";
import { deriveTrackFlagState } from "@/timeline/raceControl";
import { lastAtOrBefore } from "@/utils/sortedTime";
import { weatherAtSessionTime } from "@/utils/weather";

interface TrackVehicleStatePoint {
  absMs: number;
  safetyCar: boolean;
  vsc: boolean;
  medicalCar: boolean;
}

interface UseRaceWeekendTrackStateArgs {
  isMapVisible: boolean;
  sessionStartMs: number;
  sessionTimeMs: number;
  sessionTimeMsSlow: number;
  weatherEntries: Weather[];
  raceControlEntries: RaceControl[];
  trackVehicleStateTimeline: TrackVehicleStatePoint[];
  isRaceSession: boolean;
  lightsOutMs: number | null;
}

export function useRaceWeekendTrackState({
  isMapVisible,
  sessionStartMs,
  sessionTimeMs,
  sessionTimeMsSlow,
  weatherEntries,
  raceControlEntries,
  trackVehicleStateTimeline,
  isRaceSession,
  lightsOutMs,
}: Readonly<UseRaceWeekendTrackStateArgs>) {
  const weatherAtT = useMemo(() => {
    return weatherAtSessionTime(weatherEntries, sessionStartMs, sessionTimeMs);
  }, [weatherEntries, sessionStartMs, sessionTimeMs]);

  const activeTrackFlagState = useMemo<ActiveTrackFlagState | null>(() => {
    if (!isMapVisible || !sessionStartMs) return null;
    return deriveTrackFlagState(
      raceControlEntries,
      sessionStartMs,
      sessionStartMs + sessionTimeMsSlow,
    );
  }, [raceControlEntries, sessionStartMs, sessionTimeMsSlow, isMapVisible]);

  const activeTrackVehicles = useMemo<ActiveTrackVehicles | null>(() => {
    if (!isMapVisible || !sessionStartMs) return null;

    const LIGHTS_SEQUENCE_MS = 5_000;
    const formationLap =
      isRaceSession &&
      lightsOutMs != null &&
      sessionTimeMsSlow >= 0 &&
      sessionTimeMsSlow < Math.max(0, lightsOutMs - LIGHTS_SEQUENCE_MS);

    const cutoff = sessionStartMs + sessionTimeMsSlow;
    const state =
      lastAtOrBefore(
        trackVehicleStateTimeline,
        cutoff,
        (point) => point.absMs,
      ) ?? null;

    const safetyCar = state?.safetyCar ?? false;
    const vsc = state?.vsc ?? false;
    const medicalCar = state?.medicalCar ?? false;

    if (!safetyCar && !vsc && !medicalCar && !formationLap) return null;
    return { safetyCar, vsc, medicalCar, formationLap };
  }, [
    trackVehicleStateTimeline,
    sessionStartMs,
    sessionTimeMsSlow,
    isRaceSession,
    lightsOutMs,
    isMapVisible,
  ]);

  return {
    weatherAtT,
    activeTrackFlagState,
    activeTrackVehicles,
  } as const;
}
