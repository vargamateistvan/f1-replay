import type { Interval } from "@/api/types";
import { parseIntervalSeconds } from "@/utils/intervals";

export function computeBattlingDrivers(
  intervals: Interval[],
  cutoffUtcMs: number,
  maxGapSeconds = 1,
): ReadonlySet<number> {
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

  const battling = new Set<number>();
  for (const [driverNumber, { interval }] of latest) {
    const gapSeconds = parseIntervalSeconds(interval);
    if (gapSeconds !== null && gapSeconds <= maxGapSeconds) {
      battling.add(driverNumber);
    }
  }

  return battling;
}
