/**
 * Reference lap profile for the time-based ring: how far into a lap (as a
 * fraction of lap *time*) a car is at each fraction of lap *distance*. Slow
 * corners take more of the circle, and the angle between two cars is the gap
 * between them in time.
 *
 * Built from cars' latest full laps in the loaded location data; laps within
 * `RING_REF_LAP_SPREAD` of the fastest are averaged (so slow laps, pit laps
 * and traffic don't skew it).
 */
import { RING_REF_LAP_GRID, RING_REF_LAP_SPREAD } from "@/constants";

export interface LapTimeProfile {
  /** Distance fractions 0…1 (grid). */
  readonly dist: Float64Array;
  /** Time fraction at each grid point, 0…1, non-decreasing. */
  readonly time: Float64Array;
  /** Reference lap time (mean of the averaged laps), ms. */
  readonly lapMs: number;
  /** Number of laps averaged. */
  readonly laps: number;
}

/** One sample of a car's trace: session ms and lap fraction (null = in the pits). */
export interface TraceSample {
  t: number;
  f: number | null;
}

/** One full lap, start line to start line: points as [distance, ms since the line]. */
export interface LapTrace {
  durationMs: number;
  points: [number, number][];
}

const CROSS_HI = 0.8;
const CROSS_LO = 0.2;
/** Crossings closer than this are GPS jitter at the line, not a new lap. */
const MIN_CROSSING_GAP_MS = 10_000;
/** Longest sampling gap allowed inside a reference lap. */
const MAX_SAMPLE_GAP_MS = 5_000;

/**
 * The latest complete lap in `samples` (oldest first): two consecutive
 * start-line crossings with no pit samples or long data gaps between them and
 * a plausible duration. Null when there is none.
 */
export function latestFullLap(
  samples: readonly TraceSample[],
  limits: { minMs: number; maxMs: number },
): LapTrace | null {
  // Start-line crossings: fraction wraps from near 1 to near 0.
  const crossings: { t: number; i: number }[] = [];
  for (let i = 1; i < samples.length; i++) {
    const a = samples[i - 1]!;
    const b = samples[i]!;
    if (a.f == null || b.f == null) continue;
    if (a.f > CROSS_HI && b.f < CROSS_LO) {
      const span = b.f + 1 - a.f;
      const t = a.t + ((1 - a.f) / span) * (b.t - a.t);
      const prev = crossings[crossings.length - 1];
      if (prev && t - prev.t < MIN_CROSSING_GAP_MS) continue;
      crossings.push({ t, i });
    }
  }

  for (let k = crossings.length - 1; k > 0; k--) {
    const start = crossings[k - 1]!;
    const end = crossings[k]!;
    const durationMs = end.t - start.t;
    if (durationMs < limits.minMs || durationMs > limits.maxMs) continue;

    const points: [number, number][] = [[0, 0]];
    let ok = true;
    let lastF = 0;
    let lastT = start.t;
    for (let i = start.i; i < end.i; i++) {
      const s = samples[i]!;
      if (s.f == null || s.t - lastT > MAX_SAMPLE_GAP_MS) {
        ok = false;
        break;
      }
      lastT = s.t;
      // Skip GPS jitter that steps backwards.
      if (s.f <= lastF) continue;
      lastF = s.f;
      points.push([s.f, s.t - start.t]);
    }
    if (!ok || end.t - lastT > MAX_SAMPLE_GAP_MS) continue;
    points.push([1, durationMs]);
    return { durationMs, points };
  }
  return null;
}

/** Time fraction at distance `f` along one lap trace (linear between points). */
function traceTimeAt(trace: LapTrace, f: number): number {
  const pts = trace.points;
  let lo = 0;
  let hi = pts.length - 1;
  while (hi - lo > 1) {
    const mid = (lo + hi) >> 1;
    if (pts[mid]![0] <= f) lo = mid;
    else hi = mid;
  }
  const [f0, t0] = pts[lo]!;
  const [f1, t1] = pts[hi]!;
  const u = f1 > f0 ? (f - f0) / (f1 - f0) : 0;
  return (t0 + (t1 - t0) * u) / trace.durationMs;
}

/** Average laps within `RING_REF_LAP_SPREAD` of the fastest into one profile. */
export function buildLapTimeProfile(traces: readonly LapTrace[]): LapTimeProfile | null {
  if (!traces.length) return null;
  const fastest = Math.min(...traces.map((tr) => tr.durationMs));
  const used = traces.filter((tr) => tr.durationMs <= fastest * (1 + RING_REF_LAP_SPREAD));
  const n = RING_REF_LAP_GRID;
  const dist = new Float64Array(n + 1);
  const time = new Float64Array(n + 1);
  for (let g = 0; g <= n; g++) {
    const f = g / n;
    dist[g] = f;
    let sum = 0;
    for (const tr of used) sum += traceTimeAt(tr, f);
    time[g] = sum / used.length;
  }
  time[0] = 0;
  time[n] = 1;
  const lapMs = used.reduce((a, tr) => a + tr.durationMs, 0) / used.length;
  return { dist, time, lapMs, laps: used.length };
}

/** Time fraction (0…1) at distance fraction `f` (0…1). */
export function timeAtDistance(profile: LapTimeProfile, f: number): number {
  const n = profile.dist.length - 1;
  const x = Math.min(Math.max(f, 0), 1) * n;
  const i = Math.min(n - 1, Math.floor(x));
  const u = x - i;
  return profile.time[i]! + (profile.time[i + 1]! - profile.time[i]!) * u;
}
