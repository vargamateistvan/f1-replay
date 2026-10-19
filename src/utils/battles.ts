import type { Interval } from "@/api/types";
import { parseIntervalSeconds } from "@/utils/intervals";

/** Each driver's latest interval to the car ahead (s) at or before `cutoffUtcMs`. */
export function latestIntervalSeconds(
  intervals: readonly Interval[],
  cutoffUtcMs: number,
): Map<number, number> {
  const latest = new Map<
    number,
    { ms: number; interval: number | string | null }
  >();

  for (const iv of intervals) {
    const ms = new Date(iv.date).getTime();
    if (ms > cutoffUtcMs) continue;
    const prev = latest.get(iv.driver_number);
    if (!prev || ms > prev.ms) {
      latest.set(iv.driver_number, { ms, interval: iv.interval });
    }
  }

  const seconds = new Map<number, number>();
  for (const [driverNumber, { interval }] of latest) {
    const gapSeconds = parseIntervalSeconds(interval);
    if (gapSeconds !== null) seconds.set(driverNumber, gapSeconds);
  }
  return seconds;
}

/** Drivers within `maxGapSeconds` of the car ahead, from `latestIntervalSeconds`. */
export function battlingFrom(
  intervalSeconds: ReadonlyMap<number, number>,
  maxGapSeconds = 1,
): ReadonlySet<number> {
  const battling = new Set<number>();
  for (const [driverNumber, gapSeconds] of intervalSeconds) {
    if (gapSeconds <= maxGapSeconds) battling.add(driverNumber);
  }
  return battling;
}

export function computeBattlingDrivers(
  intervals: Interval[],
  cutoffUtcMs: number,
  maxGapSeconds = 1,
): ReadonlySet<number> {
  return battlingFrom(latestIntervalSeconds(intervals, cutoffUtcMs), maxGapSeconds);
}
