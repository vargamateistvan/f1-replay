import type { Pit } from "@/api/types";

/**
 * Time the car was in the pit lane (seconds). OpenF1 renamed `pit_duration` to
 * `lane_duration`; older sessions only have the former, so fall back.
 */
export function laneDuration(p: Pit): number | null {
  return p.lane_duration ?? p.pit_duration ?? null;
}

/**
 * Format a pit-stop duration as mm:ss:mmm.
 */
export function formatPitDuration(seconds: number | null): string | null {
  if (seconds === null || !Number.isFinite(seconds)) return null;

  const totalTenths = Math.round(seconds * 10);
  const minutes = Math.floor(totalTenths / 600);
  const remainingTenths = totalTenths % 600;
  const secs = Math.floor(remainingTenths / 10);
  const tenths = remainingTenths % 10;

  if (minutes === 0) {
    return `${String(secs)}:${String(tenths)}`;
  }

  return `${String(minutes)}:${String(secs)}:${String(tenths)}`;
}

/**
 * Best available "pit stop" time to show the user, in seconds.
 * Prefers the stationary `stop_duration` (the number commentators quote, e.g.
 * 2.4s), falling back to total pit-lane time for sessions before the 2024 US GP.
 */
export function pitStopTime(p: Pit): number | null {
  return p.stop_duration ?? laneDuration(p);
}
