import { useMemo } from "react";
import type { Lap, Overtake, TeamRadio } from "@/api/types";

type TimedRow<T> = { row: T; absMs: number; relMs: number };

interface UseRaceWeekendSessionTimelineArgs {
  laps: Lap[];
  overtakes: Overtake[];
  teamRadio: TeamRadio[];
  sessionStartMs: number;
}

export function useRaceWeekendSessionTimeline({
  laps,
  overtakes,
  teamRadio,
  sessionStartMs,
}: Readonly<UseRaceWeekendSessionTimelineArgs>) {
  const timedLaps = useMemo((): TimedRow<Lap>[] => {
    if (!sessionStartMs || !laps.length) return [];
    return laps
      .filter((lap) => Boolean(lap.date_start))
      .map((lap) => {
        const absMs = new Date(lap.date_start as string).getTime();
        return { row: lap, absMs, relMs: absMs - sessionStartMs };
      })
      .sort((a, b) => a.absMs - b.absMs);
  }, [laps, sessionStartMs]);

  const timedOvertakes = useMemo((): TimedRow<Overtake>[] => {
    if (!sessionStartMs || !overtakes.length) return [];
    return overtakes
      .map((entry) => {
        const absMs = new Date(entry.date).getTime();
        return { row: entry, absMs, relMs: absMs - sessionStartMs };
      })
      .sort((a, b) => a.absMs - b.absMs);
  }, [overtakes, sessionStartMs]);

  const timedTeamRadio = useMemo((): TimedRow<TeamRadio>[] => {
    if (!sessionStartMs || !teamRadio.length) return [];
    return teamRadio
      .map((entry) => {
        const absMs = new Date(entry.date).getTime();
        return { row: entry, absMs, relMs: absMs - sessionStartMs };
      })
      .sort((a, b) => a.absMs - b.absMs);
  }, [teamRadio, sessionStartMs]);

  // Session-relative ms of lights out = earliest lap-1 start across all drivers.
  const lightsOutMs = useMemo(() => {
    if (!timedLaps.length) return null;
    let min = Infinity;
    for (const { row: lap, relMs } of timedLaps) {
      if (lap.lap_number !== 1 || !lap.date_start) continue;
      if (relMs < min) min = relMs;
    }
    return min === Infinity ? null : min;
  }, [timedLaps]);

  return {
    timedLaps,
    timedOvertakes,
    timedTeamRadio,
    lightsOutMs,
  } as const;
}
