/**
 * Reference lap profile for the time-based ring: how far into a lap (as a
 * fraction of lap *time*) a car is at each fraction of lap *distance*. Slow
 * corners take more of the circle, and the angle between two cars is the gap
 * between them in time.
 *
 * Built from full laps traced in the loaded location data. Laps within
 * `RING_REF_LAP_SPREAD` of the fastest are combined with a per-point median, so
 * slow laps, pit laps, traffic and odd GPS traces don't skew it. The ring keeps
 * a pool of the session's laps (`LapPool`) so the shape stays put as the
 * playhead moves; only fast laps ever join the shape.
 */
import { RING_REF_LAP_GRID, RING_REF_LAP_SPREAD } from "@/constants";

export interface LapTimeProfile {
  /** Distance fractions 0…1 (grid). */
  readonly dist: Float64Array;
  /** Time fraction at each grid point, 0…1, non-decreasing. */
  readonly time: Float64Array;
  /** Reference lap time, ms. */
  readonly lapMs: number;
  /** Number of laps combined. */
  readonly laps: number;
}

/** One sample of a car's trace: session ms and lap fraction (null = in the pits). */
export interface TraceSample {
  t: number;
  f: number | null;
}

/** One full lap, start line to start line: points as [distance, ms since the line]. */
export interface LapTrace {
  /** Session ms of the start-line crossing. */
  startMs: number;
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
 * Every complete lap in `samples` (oldest first): two consecutive start-line
 * crossings with no pit samples or long data gaps between them and a plausible
 * duration.
 */
export function fullLaps(
  samples: readonly TraceSample[],
  limits: { minMs: number; maxMs: number },
): LapTrace[] {
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

  const laps: LapTrace[] = [];
  for (let k = 1; k < crossings.length; k++) {
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
    laps.push({ startMs: start.t, durationMs, points });
  }
  return laps;
}

/** The latest complete lap in `samples` (see `fullLaps`), or null. */
export function latestFullLap(
  samples: readonly TraceSample[],
  limits: { minMs: number; maxMs: number },
): LapTrace | null {
  const laps = fullLaps(samples, limits);
  return laps[laps.length - 1] ?? null;
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

/** A lap resampled onto the profile grid (time fraction per grid point). */
export interface GridLap {
  startMs: number;
  durationMs: number;
  time: Float32Array;
}

export function toGridLap(trace: LapTrace): GridLap {
  const n = RING_REF_LAP_GRID;
  const time = new Float32Array(n + 1);
  for (let g = 0; g <= n; g++) time[g] = traceTimeAt(trace, g / n);
  return { startMs: trace.startMs, durationMs: trace.durationMs, time };
}

/** Median per grid point of the laps within `RING_REF_LAP_SPREAD` of the fastest. */
export function profileFromGridLaps(laps: readonly GridLap[]): LapTimeProfile | null {
  if (!laps.length) return null;
  const fastest = Math.min(...laps.map((l) => l.durationMs));
  const used = laps.filter((l) => l.durationMs <= fastest * (1 + RING_REF_LAP_SPREAD));
  const n = RING_REF_LAP_GRID;
  const dist = new Float64Array(n + 1);
  const time = new Float64Array(n + 1);
  const column = new Float64Array(used.length);
  let prev = 0;
  for (let g = 0; g <= n; g++) {
    dist[g] = g / n;
    for (let i = 0; i < used.length; i++) column[i] = used[i]!.time[g]!;
    // Medians per point can dip below their neighbour; keep time non-decreasing.
    prev = Math.max(prev, median(column));
    time[g] = prev;
  }
  time[0] = 0;
  time[n] = 1;
  const lapMs = median(Float64Array.from(used, (l) => l.durationMs));
  return { dist, time, lapMs, laps: used.length };
}

/** Combine laps within `RING_REF_LAP_SPREAD` of the fastest into one profile. */
export function buildLapTimeProfile(traces: readonly LapTrace[]): LapTimeProfile | null {
  return profileFromGridLaps(traces.map(toGridLap));
}

/** Sorts `values` in place. */
function median(values: Float64Array): number {
  values.sort();
  const mid = values.length >> 1;
  return values.length % 2 ? values[mid]! : (values[mid - 1]! + values[mid]!) / 2;
}

/** Laps seen so far in a session, keyed by driver and start time. */
export type LapPool = Map<string, GridLap>;

export function addToLapPool(pool: LapPool, driver: number, laps: readonly LapTrace[]): void {
  for (const lap of laps) {
    const key = `${driver}:${Math.round(lap.startMs / 1000)}`;
    if (!pool.has(key)) pool.set(key, toGridLap(lap));
  }
}

/** The `max` fastest pooled laps finished by `tNow` (nothing from the future). */
export function poolLapsAt(pool: LapPool, tNow: number, max: number): GridLap[] {
  const done: GridLap[] = [];
  for (const lap of pool.values()) {
    if (lap.startMs + lap.durationMs <= tNow) done.push(lap);
  }
  return done.sort((a, b) => a.durationMs - b.durationMs).slice(0, max);
}

/** Time fraction (0…1) at distance fraction `f` (0…1). */
export function timeAtDistance(profile: LapTimeProfile, f: number): number {
  const n = profile.dist.length - 1;
  const x = Math.min(Math.max(f, 0), 1) * n;
  const i = Math.min(n - 1, Math.floor(x));
  const u = x - i;
  return profile.time[i]! + (profile.time[i + 1]! - profile.time[i]!) * u;
}
