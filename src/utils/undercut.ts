import type { Interval, Lap, Pit } from "@/api/types";
import { UNDERCUT_MAX_GAP_S, UNDERCUT_MAX_LAG_LAPS, UNDERCUT_MIN_STOP_LAP } from "@/constants";
import { latestPerDriverAt, type DriverTimeIndex } from "@/utils/driverTimeIndex";
import { parseIntervalSeconds } from "@/utils/intervals";
import type { NeutralisedWindow } from "@/utils/racePace";

/**
 * undercut: the car behind stops first to jump the car ahead.
 * overcut: the car ahead stops first and the car behind stays out to jump it.
 * Either way the attacker is the car that started behind.
 */
export type PitBattleKind = "undercut" | "overcut";

export interface PitBattle {
  id: string;
  kind: PitBattleKind;
  attacker: number;
  defender: number;
  firstStopper: number;
  firstStopLap: number;
  /** Session ms of the first stop. */
  firstStopMs: number;
  /** Seconds the attacker was behind the defender as the first stopper began its in-lap. */
  attackerDeficitS: number;
  /** Null until the rival's stop has happened (by the playhead). */
  rivalStopLap: number | null;
  /** pending: rival still out, or on its out-lap. resolved: both stops done. */
  status: "pending" | "resolved";
  /** Position headline: did the attacker end up ahead? Null while pending. */
  attackerAheadAfter: boolean | null;
  /** Seconds the attacker gained on the defender (+ = gained). Null while pending. */
  attackerGainS: number | null;
  /** Session ms at which the battle resolved (end of the rival's out-lap). */
  resolvedMs: number | null;
  /** A Safety Car, VSC or red flag overlapped the battle, so the verdict is unreliable. */
  neutralised: boolean;
}

/**
 * Pairs each pit stop with the car directly ahead and the car directly behind
 * on track (when within `UNDERCUT_MAX_GAP_S` and still on older tyres), and scores the
 * swap once both have stopped. Only data up to `cutoffMs` (session ms) is used:
 * a pending battle never reveals whether, or when, the rival will stop.
 */
export function detectPitBattles(args: {
  pits: readonly Pit[];
  laps: readonly Lap[];
  /** Intervals by driver (`buildDriverTimeIndex`, UTC ms); built once by the caller. */
  intervals: DriverTimeIndex<Interval>;
  neutralised: readonly NeutralisedWindow[];
  sessionStartMs: number;
  cutoffMs: number;
}): PitBattle[] {
  const { laps, intervals, neutralised, sessionStartMs, cutoffMs } = args;

  const lapTimes = new Map<string, { startMs: number; endMs: number | null }>();
  const currentLap = new Map<number, number>();
  for (const lap of laps) {
    const startMs = Date.parse(lap.date_start) - sessionStartMs;
    if (!Number.isFinite(startMs)) continue;
    const endMs = lap.lap_duration ? startMs + lap.lap_duration * 1000 : null;
    lapTimes.set(`${lap.driver_number}:${lap.lap_number}`, { startMs, endMs });
    if (startMs <= cutoffMs && lap.lap_number > (currentLap.get(lap.driver_number) ?? 0)) {
      currentLap.set(lap.driver_number, lap.lap_number);
    }
  }

  const stops = args.pits
    .map((p) => ({ driver: p.driver_number, lap: p.lap_number, ms: Date.parse(p.date) - sessionStartMs }))
    .filter((s) => Number.isFinite(s.ms) && s.ms <= cutoffMs)
    .sort((a, b) => a.ms - b.ms);
  const stopsByDriver = new Map<number, typeof stops>();
  for (const stop of stops) {
    const list = stopsByDriver.get(stop.driver) ?? [];
    list.push(stop);
    stopsByDriver.set(stop.driver, list);
  }

  const gapsAt = (ms: number) => gapsToLeader(intervals, sessionStartMs + ms);
  const overlapsNeutralised = (fromMs: number, toMs: number) =>
    neutralised.some((w) => fromMs < (w.endMs ?? cutoffMs) && toMs > w.startMs);

  const battles: PitBattle[] = [];
  for (const first of stops) {
    if (first.lap < UNDERCUT_MIN_STOP_LAP) continue;
    const inLap = lapTimes.get(`${first.driver}:${first.lap}`);
    if (!inLap) continue;
    const before = gapsAt(inLap.startMs);
    const firstGap = before.get(first.driver);
    if (firstGap === undefined) continue;

    for (const rival of adjacentCars(before, first.driver)) {
      // + = first stopper ahead of the rival.
      const leadBefore = before.get(rival)! - firstGap;
      if (Math.abs(leadBefore) > UNDERCUT_MAX_GAP_S) continue;

      const rivalStops = stopsByDriver.get(rival) ?? [];
      // A rival that stopped on this lap or just before is the first stopper of its own pair.
      if (rivalStops.some((s) => s.lap <= first.lap && s.lap >= first.lap - UNDERCUT_MAX_LAG_LAPS)) {
        continue;
      }
      const rivalStop = rivalStops.find((s) => s.lap > first.lap) ?? null;
      if (rivalStop && rivalStop.lap > first.lap + UNDERCUT_MAX_LAG_LAPS) continue;
      if (!rivalStop && (currentLap.get(first.driver) ?? 0) > first.lap + UNDERCUT_MAX_LAG_LAPS) {
        continue;
      }

      const kind: PitBattleKind = leadBefore < 0 ? "undercut" : "overcut";
      const attacker = kind === "undercut" ? first.driver : rival;
      const battle: PitBattle = {
        id: `pit-battle-${first.driver}-${rival}-${first.lap}`,
        kind,
        attacker,
        defender: kind === "undercut" ? rival : first.driver,
        firstStopper: first.driver,
        firstStopLap: first.lap,
        firstStopMs: first.ms,
        attackerDeficitS: Math.abs(leadBefore),
        rivalStopLap: rivalStop?.lap ?? null,
        status: "pending",
        attackerAheadAfter: null,
        attackerGainS: null,
        resolvedMs: null,
        neutralised: overlapsNeutralised(inLap.startMs, cutoffMs),
      };

      const outLapEnd = rivalStop ? lapTimes.get(`${rival}:${rivalStop.lap + 1}`)?.endMs : null;
      if (outLapEnd != null && outLapEnd <= cutoffMs) {
        const after = gapsAt(outLapEnd);
        const firstAfter = after.get(first.driver);
        const rivalAfter = after.get(rival);
        if (firstAfter === undefined || rivalAfter === undefined) continue;
        const firstGain = rivalAfter - firstAfter - leadBefore;
        const attackerGain = attacker === first.driver ? firstGain : -firstGain;
        battle.status = "resolved";
        battle.attackerGainS = attackerGain;
        battle.attackerAheadAfter = attackerGain > battle.attackerDeficitS;
        battle.resolvedMs = outLapEnd;
        battle.neutralised = overlapsNeutralised(inLap.startMs, outLapEnd);
      }
      battles.push(battle);
    }
  }
  return battles;
}

/** The cars directly ahead of and behind `driver` by gap to the leader. */
function adjacentCars(gaps: ReadonlyMap<number, number>, driver: number): number[] {
  const own = gaps.get(driver)!;
  let ahead: [number, number] | null = null;
  let behind: [number, number] | null = null;
  for (const [num, gap] of gaps) {
    if (num === driver) continue;
    if (gap <= own && (!ahead || gap > ahead[1])) ahead = [num, gap];
    if (gap > own && (!behind || gap < behind[1])) behind = [num, gap];
  }
  return [ahead?.[0], behind?.[0]].filter((n): n is number => n !== undefined);
}

/** Same reading as `latestGapsToLeader`: leader (null / 0) → 0, lapped cars omitted. */
function gapsToLeader(index: DriverTimeIndex<Interval>, cutoffUtcMs: number): Map<number, number> {
  const gaps = new Map<number, number>();
  for (const [driverNumber, row] of latestPerDriverAt(index, cutoffUtcMs)) {
    const seconds = row.gap_to_leader === null ? 0 : parseIntervalSeconds(row.gap_to_leader);
    if (seconds !== null) gaps.set(driverNumber, seconds);
  }
  return gaps;
}

/** "Undercut worked" / "Overcut failed" / "Undercut on" (pending). */
export function pitBattleHeadline(battle: Pick<PitBattle, "kind" | "attackerAheadAfter">): string {
  const name = battle.kind === "undercut" ? "Undercut" : "Overcut";
  if (battle.attackerAheadAfter === null) return `${name} on`;
  return `${name} ${battle.attackerAheadAfter ? "worked" : "failed"}`;
}

/** Signed seconds the attacker gained, e.g. "+2.3 s" / "−0.8 s". */
export function formatBattleGain(gainS: number): string {
  const rounded = Math.round(gainS * 10) / 10;
  if (rounded === 0) return "±0.0 s";
  return `${rounded > 0 ? "+" : "−"}${Math.abs(rounded).toFixed(1)} s`;
}
