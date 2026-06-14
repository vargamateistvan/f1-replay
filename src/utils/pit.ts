import type { Pit } from "@/api/types";

/**
 * Time the car was in the pit lane (seconds). OpenF1 renamed `pit_duration` to
 * `lane_duration`; older sessions only have the former, so fall back.
 */
export function laneDuration(p: Pit): number | null {
  return p.lane_duration ?? p.pit_duration ?? null;
}

/**
 * Best available "pit stop" time to show the user, in seconds.
 * Prefers the stationary `stop_duration` (the number commentators quote, e.g.
 * 2.4s), falling back to total pit-lane time for sessions before the 2024 US GP.
 */
export function pitStopTime(p: Pit): number | null {
  return p.stop_duration ?? laneDuration(p);
}
