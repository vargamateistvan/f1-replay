import { useMemo } from "react";
import type { Lap, Overtake, Pit, RaceControl, TeamRadio } from "@/api/types";
import {
  lapStartTimes,
  pitTimes,
  flagTimes,
  safetyCarTimes,
  overtakeTimes,
  radioTimes,
} from "@/timeline/events";

interface UseRaceWeekendTimelineMarksArgs {
  laps: Lap[];
  pits: Pit[];
  raceControl: RaceControl[];
  overtakes: Overtake[];
  teamRadio: TeamRadio[];
  sessionStartMs: number;
  sessionTimeMs: number;
}

export function useRaceWeekendTimelineMarks({
  laps,
  pits,
  raceControl,
  overtakes,
  teamRadio,
  sessionStartMs,
  sessionTimeMs,
}: Readonly<UseRaceWeekendTimelineMarksArgs>) {
  const lapMarks = useMemo(
    () => lapStartTimes(laps, sessionStartMs),
    [laps, sessionStartMs],
  );

  const currentLap = useMemo(() => {
    let lap = 0;
    for (let i = 0; i < lapMarks.length; i++) {
      if (lapMarks[i]! <= sessionTimeMs) lap = i + 1;
    }
    return lap;
  }, [lapMarks, sessionTimeMs]);

  const pitMarks = useMemo(
    () => pitTimes(pits, sessionStartMs),
    [pits, sessionStartMs],
  );

  const flagMarks = useMemo(
    () => flagTimes(raceControl, sessionStartMs),
    [raceControl, sessionStartMs],
  );

  const safetyCarMarks = useMemo(
    () => safetyCarTimes(raceControl, sessionStartMs),
    [raceControl, sessionStartMs],
  );

  const overtakeMarks = useMemo(
    () => overtakeTimes(overtakes, sessionStartMs),
    [overtakes, sessionStartMs],
  );

  const radioMarks = useMemo(
    () => radioTimes(teamRadio, sessionStartMs),
    [teamRadio, sessionStartMs],
  );

  const keyMomentMarks = useMemo(() => {
    return [
      ...new Set([...flagMarks, ...pitMarks, ...overtakeMarks, ...radioMarks]),
    ]
      .filter((ms) => ms >= 0)
      .sort((a, b) => a - b);
  }, [flagMarks, pitMarks, overtakeMarks, radioMarks]);

  return {
    lapMarks,
    currentLap,
    pitMarks,
    flagMarks,
    safetyCarMarks,
    overtakeMarks,
    radioMarks,
    keyMomentMarks,
  } as const;
}
