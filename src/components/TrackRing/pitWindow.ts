/**
 * Pit window pieces shared by the ring view and the 2D / 3D maps: where a
 * focused car that is already in the pit lane rejoins, and a per-stop cache
 * of when it left the track.
 */
import type { LocationIndex } from "@/timeline/interpolate";
import {
  pitLossFor,
  rankAtGap,
  type PitLossCondition,
  type PitLossSeconds,
  type PitRejoinProjection,
} from "@/utils/pitRejoin";
import type { TrackGeometry } from "../TrackMap/trackGeometry";
import { findPitEntry, gapAtTimeFraction, type RingModel } from "./ringModel";

export interface PitEntry {
  /** Session ms of the car's last on-track sample. */
  t: number;
  /** Lap distance fraction there. */
  fraction: number;
}

/** The focused car's pit entry, so the location scan runs once per stop. */
export interface PitEntryCache {
  current: {
    driver: number;
    index: LocationIndex;
    model: RingModel;
    scannedAt: number;
    entry: PitEntry | null;
  } | null;
}

export function createPitEntryCache(): PitEntryCache {
  return { current: null };
}

/**
 * When and where `driver` (now in the pits) left the track, reusing the last
 * scan while it still covers `t`. Null when it has been in the pits for longer
 * than `lookbackMs` (garage) or data runs out.
 */
export function cachedPitEntry(
  cache: PitEntryCache,
  model: RingModel,
  geom: TrackGeometry,
  driver: number,
  index: LocationIndex,
  t: number,
  lookbackMs: number,
): PitEntry | null {
  const cached = cache.current;
  const since = cached ? (cached.entry?.t ?? cached.scannedAt) : 0;
  const reuse =
    cached !== null &&
    cached.driver === driver &&
    cached.index === index &&
    cached.model === model &&
    t >= since &&
    t - since <= lookbackMs;
  if (reuse) return cached.entry;
  const entry = findPitEntry(model, geom, index, t, lookbackMs);
  cache.current = { driver, index, model, scannedAt: t, entry };
  return entry;
}

export interface InPitRejoin {
  projection: PitRejoinProjection;
  /** Lap time fractions (unwrapped) of the car had it stayed out, and of its rejoin point. */
  carTf: number;
  behindTf: number;
  lossS: number;
  condition: PitLossCondition;
}

/**
 * Where a car already in the pits rejoins: its pit entry, moved on at field
 * speed, minus the pit loss. That point holds still against the field until
 * the car rejoins; its gap to the leader is read off the nearest car on track.
 */
export function inPitRejoin(args: {
  driver: number;
  entry: PitEntry;
  /** Lap time fraction of the entry point. */
  entryTf: number;
  t: number;
  lapMs: number;
  pitLoss: PitLossSeconds;
  track: { safetyCar?: boolean; vsc?: boolean } | null | undefined;
  /** Lap time fraction of every car on track. */
  timeFractions: ReadonlyMap<number, number>;
  gaps: ReadonlyMap<number, number>;
  excluded?: ReadonlySet<number>;
}): InPitRejoin | null {
  const { driver, entry, lapMs, gaps } = args;
  if (!gaps.has(driver) || lapMs <= 0) return null;
  const { seconds: lossS, condition } = pitLossFor(args.pitLoss, args.track);
  const carTf = args.entryTf + (args.t - entry.t) / lapMs;
  const behindTf = carTf - (lossS * 1000) / lapMs;
  const gapS = gapAtTimeFraction(behindTf, args.timeFractions, gaps, lapMs);
  const projection = gapS === null ? null : rankAtGap(gaps, driver, gapS, args.excluded);
  return projection ? { projection, carTf, behindTf, lossS, condition } : null;
}

/**
 * Stale 0 s gaps on cars that don't lead would make the rejoin order
 * ambiguous (projectPitRejoin then gives up): drop them.
 */
export function cleanRejoinGaps(
  gaps: ReadonlyMap<number, number> | null | undefined,
  leaderNumber: number | null,
): ReadonlyMap<number, number> | null {
  if (!gaps) return null;
  if (leaderNumber === null) return gaps;
  const out = new Map<number, number>();
  for (const [num, gap] of gaps) {
    if (gap > 0 || num === leaderNumber) out.set(num, gap);
  }
  return out;
}
