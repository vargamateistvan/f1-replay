/**
 * Pit-lane path extraction from one car's GPS trace through a pit stop, in
 * the F1 frame. Used by scripts/fetch-pit-lanes.mjs to bake pit lanes, since
 * the baked circuit geometry has none.
 *
 * OpenF1 `pit.date` is not the pit entry time, so rather than trusting
 * timestamps we take a generous window around the stop and keep the longest
 * run of samples that sit off the racing line.
 *
 * This module has no imports so the Node bake script can load it directly.
 */

export interface TracePoint {
  t: number;
  x: number;
  y: number;
}

/** Distance from (x, y) to the closed polyline, in the polyline's units. */
export function distanceToLoop(
  xs: readonly number[],
  ys: readonly number[],
  x: number,
  y: number,
): number {
  const n = xs.length;
  let best = Infinity;
  for (let i = 0; i < n; i++) {
    const ax = xs[i]!;
    const ay = ys[i]!;
    const bx = xs[(i + 1) % n]!;
    const by = ys[(i + 1) % n]!;
    const dx = bx - ax;
    const dy = by - ay;
    const len2 = dx * dx + dy * dy;
    const u = len2 === 0 ? 0 : Math.max(0, Math.min(1, ((x - ax) * dx + (y - ay) * dy) / len2));
    const d = (x - (ax + u * dx)) ** 2 + (y - (ay + u * dy)) ** 2;
    if (d < best) best = d;
  }
  return Math.sqrt(best);
}

/**
 * The longest contiguous run of trace points further than `offTrack` from the
 * centerline, padded by one sample each side so the path meets the track.
 * Returns null when the run lasts less than `minDurationMs`.
 */
export function extractPitLane(
  trace: readonly TracePoint[],
  centerX: readonly number[],
  centerY: readonly number[],
  { offTrack = 50, minDurationMs = 8_000 } = {},
): TracePoint[] | null {
  const sorted = [...trace].sort((a, b) => a.t - b.t);
  let bestStart = -1;
  let bestEnd = -1;
  let start = -1;
  for (let i = 0; i <= sorted.length; i++) {
    const p = sorted[i];
    const off = p ? distanceToLoop(centerX, centerY, p.x, p.y) > offTrack : false;
    if (off && start < 0) start = i;
    if (!off && start >= 0) {
      if (bestStart < 0 || i - 1 - start > bestEnd - bestStart) {
        bestStart = start;
        bestEnd = i - 1;
      }
      start = -1;
    }
  }
  if (bestStart < 0) return null;
  const from = Math.max(0, bestStart - 1);
  const to = Math.min(sorted.length - 1, bestEnd + 1);
  if (sorted[to]!.t - sorted[from]!.t < minDurationMs) return null;
  return sorted.slice(from, to + 1);
}
