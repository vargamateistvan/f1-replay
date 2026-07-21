import type { Lap } from "@/api/types";
import { upperBoundByValue } from "@/utils/sortedTime";

export type LapLookupPoint = {
  lapNumber: number;
  startMs: number;
};

export function buildLapLookup(
  laps: readonly Lap[],
  sessionStartMs: number,
): LapLookupPoint[] {
  const earliestByLap = new Map<number, number>();

  for (const lap of laps) {
    if (!lap.date_start) continue;
    const startMs = new Date(lap.date_start).getTime() - sessionStartMs;
    const current = earliestByLap.get(lap.lap_number);
    if (current === undefined || startMs < current) {
      earliestByLap.set(lap.lap_number, startMs);
    }
  }

  return [...earliestByLap.entries()]
    .map(([lapNumber, startMs]) => ({ lapNumber, startMs }))
    .filter((point) => Number.isFinite(point.startMs) && point.startMs >= 0)
    .sort((a, b) => a.startMs - b.startMs);
}

export function lapNumberAtMs(
  lookup: readonly LapLookupPoint[],
  eventMs: number,
): number | null {
  const idx = upperBoundByValue(lookup, eventMs, (point) => point.startMs) - 1;
  return idx >= 0 ? (lookup[idx]?.lapNumber ?? null) : null;
}
