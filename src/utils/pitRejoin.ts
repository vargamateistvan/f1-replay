import type { Interval } from "@/api/types";
import type { PitLoss } from "@/data/circuitGeometryTypes";
import { interpolateXY, type LocationIndex } from "@/timeline/interpolate";
import { parseIntervalSeconds } from "@/utils/intervals";

export interface PitLossSeconds {
  normal: number;
  sc: number | null;
  vsc: number | null;
}

/** Baked pit-loss strings ("20.98") → seconds; null without a usable normal value. */
export function parsePitLoss(
  pitLoss: PitLoss | null | undefined,
): PitLossSeconds | null {
  const num = (value: string | undefined): number | null => {
    if (value == null) return null;
    const n = Number(value);
    return Number.isFinite(n) && n > 0 ? n : null;
  };
  const normal = num(pitLoss?.normal);
  if (normal === null) return null;
  return { normal, sc: num(pitLoss?.sc), vsc: num(pitLoss?.vsc) };
}

export type PitLossCondition = "normal" | "vsc" | "sc";

/** Pit loss for the current neutralisation; SC beats VSC beats green running. */
export function pitLossFor(
  loss: PitLossSeconds,
  track: { safetyCar?: boolean; vsc?: boolean } | null | undefined,
): { seconds: number; condition: PitLossCondition } {
  if (track?.safetyCar && loss.sc !== null)
    return { seconds: loss.sc, condition: "sc" };
  if (track?.vsc && loss.vsc !== null)
    return { seconds: loss.vsc, condition: "vsc" };
  return { seconds: loss.normal, condition: "normal" };
}

/**
 * Each driver's latest numeric gap to the leader at or before `cutoffUtcMs`.
 * The leader (OpenF1 reports `null` or `0`) maps to 0; lapped cars ("+1 LAP")
 * are omitted.
 */
export function latestGapsToLeader(
  intervals: readonly Interval[],
  cutoffUtcMs: number,
): Map<number, number> {
  const latest = new Map<
    number,
    { ms: number; gap: Interval["gap_to_leader"] }
  >();
  for (const iv of intervals) {
    const ms = new Date(iv.date).getTime();
    if (ms > cutoffUtcMs) continue;
    const prev = latest.get(iv.driver_number);
    if (!prev || ms > prev.ms) {
      latest.set(iv.driver_number, { ms, gap: iv.gap_to_leader });
    }
  }

  const gaps = new Map<number, number>();
  for (const [driverNumber, { gap }] of latest) {
    const seconds = gap === null ? 0 : parseIntervalSeconds(gap);
    if (seconds !== null) gaps.set(driverNumber, seconds);
  }
  return gaps;
}

export interface PitRejoinNeighbour {
  driverNumber: number;
  /** Seconds between the rejoining car and this neighbour (always ≥ 0). */
  gapS: number;
}

export interface PitRejoinProjection {
  /** Race position the driver would hold straight after the stop. */
  position: number;
  /** Car the driver would rejoin behind, or null when rejoining in the lead. */
  ahead: PitRejoinNeighbour | null;
  /** Car the driver would rejoin in front of, or null when rejoining last. */
  behind: PitRejoinNeighbour | null;
}

/**
 * Where `driverNumber` would rejoin if they pitted now and lost `lossS`
 * seconds, assuming everyone else keeps their current gap to the leader.
 * Null when the driver has no gap or the order is ambiguous (several cars
 * reading as leader, e.g. at the start).
 */
export function projectPitRejoin(
  gaps: ReadonlyMap<number, number>,
  driverNumber: number,
  lossS: number,
  excluded?: ReadonlySet<number>,
): PitRejoinProjection | null {
  const ownGap = gaps.get(driverNumber);
  if (ownGap === undefined) return null;

  const rivals: Array<[number, number]> = [];
  let leaders = ownGap === 0 ? 1 : 0;
  for (const [num, gap] of gaps) {
    if (num === driverNumber || excluded?.has(num)) continue;
    if (gap === 0) leaders++;
    rivals.push([num, gap]);
  }
  if (leaders > 1) return null;

  const projected = ownGap + lossS;
  let ahead: PitRejoinNeighbour | null = null;
  let behind: PitRejoinNeighbour | null = null;
  let carsAhead = 0;
  for (const [num, gap] of rivals) {
    // A tie goes to the car already on track.
    if (gap <= projected) {
      carsAhead++;
      const gapS = projected - gap;
      if (!ahead || gapS < ahead.gapS) ahead = { driverNumber: num, gapS };
    } else {
      const gapS = gap - projected;
      if (!behind || gapS < behind.gapS) behind = { driverNumber: num, gapS };
    }
  }
  return { position: carsAhead + 1, ahead, behind };
}

export interface PitWindowRivals {
  /** Cars behind now that would be ahead if the driver pitted (losing `lossS`). */
  passedBy: number[];
  /** Cars ahead now that would drop behind the driver if they pitted instead. */
  dropBehind: number[];
}

/**
 * Who sits inside the driver's pit window, by gap to the leader. Ties go to
 * the car already on track, as in {@link projectPitRejoin}. Null without a
 * gap for the driver.
 */
export function pitWindowRivals(
  gaps: ReadonlyMap<number, number>,
  driverNumber: number,
  lossS: number,
  excluded?: ReadonlySet<number>,
): PitWindowRivals | null {
  const ownGap = gaps.get(driverNumber);
  if (ownGap === undefined) return null;
  const passedBy: Array<[number, number]> = [];
  const dropBehind: Array<[number, number]> = [];
  for (const [num, gap] of gaps) {
    if (num === driverNumber || excluded?.has(num)) continue;
    if (gap > ownGap && gap <= ownGap + lossS) passedBy.push([num, gap]);
    else if (gap < ownGap && gap >= ownGap - lossS) dropBehind.push([num, gap]);
  }
  const byGap = (a: [number, number], b: [number, number]) => a[1] - b[1];
  return {
    passedBy: passedBy.sort(byGap).map(([num]) => num),
    dropBehind: dropBehind.sort(byGap).map(([num]) => num),
  };
}

/** Pit losses for the conditions other than `current`, for markers on a pit window. */
export function alternativePitLosses(
  loss: PitLossSeconds,
  current: PitLossCondition,
): { condition: PitLossCondition; seconds: number }[] {
  const all: { condition: PitLossCondition; seconds: number | null }[] = [
    { condition: "normal", seconds: loss.normal },
    { condition: "vsc", seconds: loss.vsc },
    { condition: "sc", seconds: loss.sc },
  ];
  return all.flatMap(({ condition, seconds }) =>
    condition !== current && seconds !== null ? [{ condition, seconds }] : [],
  );
}

export interface PitRejoinView {
  projection: PitRejoinProjection;
  lossS: number;
  condition: PitLossCondition;
  /** Where the focused car was `lossS` ago (F1 frame), or null without coverage. */
  ghost: { x: number; y: number } | null;
}

/**
 * Pit rejoin for the focused car, shared by the 2D and 3D maps: rank after
 * adding the circuit's pit loss to its gap, and place a ghost where the car
 * was `loss` seconds ago — the cars around that spot now are the ones it would
 * rejoin among.
 */
export function pitRejoinView(args: {
  gaps: ReadonlyMap<number, number> | null | undefined;
  pitLoss: PitLossSeconds | null;
  track: { safetyCar?: boolean; vsc?: boolean } | null | undefined;
  focusDriver: number | null;
  excluded?: ReadonlySet<number>;
  /** Focused car's location index: session-relative ms + F1 x/y. */
  index: LocationIndex | undefined;
  t: number;
}): PitRejoinView | null {
  const { gaps, pitLoss, focusDriver, index, t } = args;
  if (!gaps || !pitLoss || focusDriver === null) return null;
  const loss = pitLossFor(pitLoss, args.track);
  const projection = projectPitRejoin(gaps, focusDriver, loss.seconds, args.excluded);
  if (!projection) return null;

  const lookBackT = t - loss.seconds * 1000;
  // interpolateXY clamps outside the index, so require real coverage.
  const covered = index != null && index.times.length > 0 && index.times[0]! <= lookBackT;
  const xy = covered ? interpolateXY(index, lookBackT) : null;
  // x = y = 0 is OpenF1's "not on track" placeholder (see isOffTrackPlaceholder).
  const ghost = xy && !(xy.x === 0 && xy.y === 0) ? xy : null;
  return { projection, lossS: loss.seconds, condition: loss.condition, ghost };
}
