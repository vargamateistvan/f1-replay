import type { Lap, Pit, Stint } from "@/api/types";
import { RACE_PACE_MIN_LAPS, RACE_PACE_OUTLIER_PCT } from "@/constants";
import type { IncidentWindow } from "@/timeline/raceControl";
import { tyreForLap } from "@/utils/lapContext";

export interface PaceLap {
  driverNumber: number;
  lapNumber: number;
  lapS: number;
  /** Tyre age in laps at the start of the lap. */
  tyreAge: number;
  compound: Stint["compound"];
  stintNumber: number;
}

/** Safety Car / VSC / red flag period, session-relative ms (endMs null = still active). */
export interface NeutralisedWindow {
  startMs: number;
  endMs: number | null;
}

/** Safety Car, VSC and red flag periods; local yellows don't slow the whole field. */
export function neutralisedWindows(incidents: readonly IncidentWindow[]): NeutralisedWindow[] {
  return incidents
    .filter((w) => w.kind !== "yellow_flag")
    .map((w) => ({ startMs: w.startMs, endMs: w.endMs }));
}

/**
 * Laps that show a car's real race pace, finished by `cutoffMs` (session ms) so
 * a replay never reveals laps the playhead hasn't reached. Drops lap 1, pit
 * in/out laps, laps touching a neutralised window, and laps much slower than
 * their stint's median (traffic, mistakes).
 */
export function cleanRaceLaps(args: {
  laps: readonly Lap[];
  stints: readonly Stint[];
  pits: readonly Pit[];
  neutralised: readonly NeutralisedWindow[];
  sessionStartMs: number;
  cutoffMs: number;
}): PaceLap[] {
  const { stints, neutralised, sessionStartMs, cutoffMs } = args;
  const inLaps = new Set(args.pits.map((p) => `${p.driver_number}:${p.lap_number}`));

  const candidates: PaceLap[] = [];
  for (const lap of args.laps) {
    const lapS = lap.lap_duration;
    if (lapS === null || lapS <= 0 || lap.lap_number <= 1 || lap.is_pit_out_lap) continue;
    if (inLaps.has(`${lap.driver_number}:${lap.lap_number}`)) continue;

    const startMs = Date.parse(lap.date_start) - sessionStartMs;
    const endMs = startMs + lapS * 1000;
    if (!Number.isFinite(startMs) || endMs > cutoffMs) continue;
    if (neutralised.some((w) => startMs < (w.endMs ?? cutoffMs) && endMs > w.startMs)) continue;

    const tyre = tyreForLap(stints, lap.driver_number, lap.lap_number);
    if (!tyre) continue;
    candidates.push({
      driverNumber: lap.driver_number,
      lapNumber: lap.lap_number,
      lapS,
      tyreAge: tyre.age,
      compound: tyre.compound,
      stintNumber: tyre.stintNumber,
    });
  }

  const out: PaceLap[] = [];
  for (const group of groupByStint(candidates).values()) {
    const limit = median(group.map((l) => l.lapS)) * (1 + RACE_PACE_OUTLIER_PCT);
    for (const lap of group) if (lap.lapS <= limit) out.push(lap);
  }
  return out.sort((a, b) => a.driverNumber - b.driverNumber || a.lapNumber - b.lapNumber);
}

export interface StintPace {
  driverNumber: number;
  stintNumber: number;
  compound: Stint["compound"];
  /** Fitted lap time on new tyres (tyre age 0), seconds. */
  baseS: number;
  /** Lap time lost per lap of tyre age, seconds (+ = getting slower). */
  degSPerLap: number;
  /** Goodness of fit, 0–1. */
  r2: number;
  laps: PaceLap[];
}

/**
 * Least-squares fit of lap time against tyre age for every stint with at least
 * `RACE_PACE_MIN_LAPS` clean laps. `fuelSPerLap` adds back the time a lighter
 * car gains each lap, which otherwise hides part of the wear.
 */
export function fitStintPace(
  paceLaps: readonly PaceLap[],
  options: { fuelSPerLap?: number } = {},
): StintPace[] {
  const fuel = options.fuelSPerLap ?? 0;
  const fits: StintPace[] = [];
  for (const group of groupByStint(paceLaps).values()) {
    if (group.length < RACE_PACE_MIN_LAPS) continue;
    const xs = group.map((l) => l.tyreAge);
    const ys = group.map((l) => l.lapS + fuel * (l.lapNumber - 1));
    const fit = linearFit(xs, ys);
    if (!fit) continue;
    const first = group[0]!;
    fits.push({
      driverNumber: first.driverNumber,
      stintNumber: first.stintNumber,
      compound: first.compound,
      baseS: fit.intercept,
      degSPerLap: fit.slope,
      r2: fit.r2,
      laps: group,
    });
  }
  return fits.sort((a, b) => a.driverNumber - b.driverNumber || a.stintNumber - b.stintNumber);
}

function groupByStint(laps: readonly PaceLap[]): Map<string, PaceLap[]> {
  const groups = new Map<string, PaceLap[]>();
  for (const lap of laps) {
    const key = `${lap.driverNumber}:${lap.stintNumber}`;
    let group = groups.get(key);
    if (!group) groups.set(key, (group = []));
    group.push(lap);
  }
  return groups;
}

function median(values: number[]): number {
  const sorted = [...values].sort((a, b) => a - b);
  const mid = sorted.length >> 1;
  return sorted.length % 2 ? sorted[mid]! : (sorted[mid - 1]! + sorted[mid]!) / 2;
}

function linearFit(
  xs: number[],
  ys: number[],
): { slope: number; intercept: number; r2: number } | null {
  const n = xs.length;
  const meanX = xs.reduce((a, b) => a + b, 0) / n;
  const meanY = ys.reduce((a, b) => a + b, 0) / n;
  let sxx = 0;
  let sxy = 0;
  let syy = 0;
  for (let i = 0; i < n; i++) {
    const dx = xs[i]! - meanX;
    const dy = ys[i]! - meanY;
    sxx += dx * dx;
    sxy += dx * dy;
    syy += dy * dy;
  }
  // Every lap at the same tyre age: no slope to fit.
  if (sxx === 0) return null;
  const slope = sxy / sxx;
  const r2 = syy === 0 ? 1 : (sxy * sxy) / (sxx * syy);
  return { slope, intercept: meanY - slope * meanX, r2 };
}

export interface CompoundPace {
  compound: Stint["compound"];
  /** Median degradation across every fitted stint on this compound (s/lap). */
  medianDegSPerLap: number;
  stints: number;
  /** Lowest-degradation stint on the compound. */
  best: StintPace;
}

/** Field-wide degradation per compound, softest first. */
export function compoundPaceSummary(fits: readonly StintPace[]): CompoundPace[] {
  const byCompound = new Map<Stint["compound"], StintPace[]>();
  for (const fit of fits) {
    const list = byCompound.get(fit.compound) ?? [];
    list.push(fit);
    byCompound.set(fit.compound, list);
  }
  return COMPOUND_ORDER.filter((c) => byCompound.has(c)).map((compound) => {
    const list = byCompound.get(compound)!;
    return {
      compound,
      medianDegSPerLap: median(list.map((f) => f.degSPerLap)),
      stints: list.length,
      best: list.reduce((a, b) => (b.degSPerLap < a.degSPerLap ? b : a)),
    };
  });
}

const COMPOUND_ORDER: Stint["compound"][] = [
  "SOFT",
  "MEDIUM",
  "HARD",
  "INTERMEDIATE",
  "WET",
  "UNKNOWN",
];
