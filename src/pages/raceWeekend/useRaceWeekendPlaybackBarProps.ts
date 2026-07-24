import { useMemo } from "react";
import type { SharedPlaybackBarProps } from "@/components/PlaybackBar/RaceWeekendPlayback";

interface UseRaceWeekendPlaybackBarPropsArgs {
  durationMs: number;
  lapStarts: number[];
  pitTimes: number[];
  flagTimes: number[];
  safetyCarTimes: number[];
  overtakeTimes: number[];
  radioTimes: number[];
  raceControlMarkers: SharedPlaybackBarProps["raceControlMarkers"];
  markerSummary: SharedPlaybackBarProps["markerSummary"];
  canReplayCurrentIncident: boolean;
  onReplayCurrentIncident: () => void;
  canReplayNextIncident: boolean;
  onReplayNextIncident: () => void;
  incidentReplayHint: string | null;
  countdownMs: number | null;
  qualiPhase: string | null;
  q2StartMs: number | null;
  q3StartMs: number | null;
}

export function useRaceWeekendPlaybackBarProps({
  durationMs,
  lapStarts,
  pitTimes,
  flagTimes,
  safetyCarTimes,
  overtakeTimes,
  radioTimes,
  raceControlMarkers,
  markerSummary,
  canReplayCurrentIncident,
  onReplayCurrentIncident,
  canReplayNextIncident,
  onReplayNextIncident,
  incidentReplayHint,
  countdownMs,
  qualiPhase,
  q2StartMs,
  q3StartMs,
}: Readonly<UseRaceWeekendPlaybackBarPropsArgs>) {
  return useMemo(
    (): SharedPlaybackBarProps => ({
      durationMs,
      lapStarts,
      pitTimes,
      flagTimes,
      safetyCarTimes,
      overtakeTimes,
      radioTimes,
      raceControlMarkers,
      markerSummary,
      canReplayCurrentIncident,
      onReplayCurrentIncident,
      canReplayNextIncident,
      onReplayNextIncident,
      incidentReplayHint,
      countdownMs,
      qualiPhase,
      q2StartMs,
      q3StartMs,
    }),
    [
      durationMs,
      lapStarts,
      pitTimes,
      flagTimes,
      safetyCarTimes,
      overtakeTimes,
      radioTimes,
      raceControlMarkers,
      markerSummary,
      canReplayCurrentIncident,
      onReplayCurrentIncident,
      canReplayNextIncident,
      onReplayNextIncident,
      incidentReplayHint,
      countdownMs,
      qualiPhase,
      q2StartMs,
      q3StartMs,
    ],
  );
}
