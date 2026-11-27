import type { Lap, Overtake, Pit, RaceControl, TeamRadio } from "@/api/types";
import {
  normalizeRaceControl,
  type NormalizedRaceControlEvent,
} from "@/timeline/raceControl";
import { deletedLapKeys, lapKey, parseLapDeletions } from "./lapDeletions";
import type { PitBattle } from "./undercut";

type TimedEvent = { id: string; ms: number };
export type DriverEvent = TimedEvent & (
  | { kind: "race_control"; entry: NormalizedRaceControlEvent }
  | { kind: "pit"; entry: Pit }
  | { kind: "overtake"; entry: Overtake }
  | { kind: "radio"; entry: TeamRadio }
  | { kind: "lap"; entry: Lap; lapTime: number; fastest: boolean }
  | { kind: "pit_battle"; entry: PitBattle }
);

export function extractInvolvedDriverNumbers(description: string): number[] {
  const sections = description.matchAll(
    /\bCARS?\s+(\d{1,3}(?:\s*\([^)]*\))?(?:\s*(?:,|&|AND)\s*(?:CARS?\s+)?\d{1,3}(?:\s*\([^)]*\))?)*)/gi,
  );
  const found = new Set<number>();
  for (const section of sections) {
    const matches = section[1].replace(/\([^)]*\)/g, "").match(/\b\d{1,3}\b/g) ?? [];
    for (const value of matches) found.add(Number(value));
  }
  return [...found];
}

export function buildDriverEvents({
  driverNumber,
  raceControl,
  pits,
  overtakes,
  radios,
  laps,
  pitBattles = [],
  sessionStartMs,
  sessionTimeMs,
  lapStartCutoffMs = Infinity,
}: {
  driverNumber: number;
  raceControl: RaceControl[];
  pits: Pit[];
  overtakes: Overtake[];
  radios: TeamRadio[];
  laps: Lap[];
  pitBattles?: PitBattle[];
  sessionStartMs: number;
  sessionTimeMs: number;
  lapStartCutoffMs?: number;
}): DriverEvent[] {
  if (!sessionStartMs) return [];
  const events: DriverEvent[] = [];
  const elapsed = (ms: number) => Number.isFinite(ms) && ms >= 0 && ms <= sessionTimeMs;

  for (const entry of normalizeRaceControl(raceControl, sessionStartMs)) {
    if (!elapsed(entry.ms)) continue;
    if (
      entry.driverNumber !== driverNumber &&
      !extractInvolvedDriverNumbers(entry.description).includes(driverNumber)
    ) continue;
    events.push({ id: `rc-${entry.id}`, ms: entry.ms, kind: "race_control", entry });
  }
  for (const entry of pits) {
    const ms = Date.parse(entry.date) - sessionStartMs;
    if (entry.driver_number === driverNumber && elapsed(ms)) {
      events.push({ id: `pit-${entry.date}-${entry.driver_number}`, ms, kind: "pit", entry });
    }
  }
  for (const entry of overtakes) {
    const ms = Date.parse(entry.date) - sessionStartMs;
    if (
      elapsed(ms) &&
      (entry.overtaking_driver_number === driverNumber || entry.overtaken_driver_number === driverNumber)
    ) {
      events.push({
        id: `pass-${entry.date}-${entry.overtaking_driver_number}-${entry.overtaken_driver_number}`,
        ms, kind: "overtake", entry,
      });
    }
  }
  for (const entry of radios) {
    const ms = Date.parse(entry.date) - sessionStartMs;
    if (entry.driver_number === driverNumber && elapsed(ms)) {
      events.push({ id: `radio-${entry.date}-${entry.driver_number}`, ms, kind: "radio", entry });
    }
  }
  for (const entry of pitBattles) {
    if (
      entry.firstStopper !== driverNumber &&
      (entry.attacker === driverNumber || entry.defender === driverNumber) &&
      elapsed(entry.firstStopMs)
    ) {
      events.push({ id: entry.id, ms: entry.firstStopMs, kind: "pit_battle", entry });
    }
  }

  const deleted = deletedLapKeys(
    parseLapDeletions(raceControl).filter((entry) => entry.ms <= sessionStartMs + sessionTimeMs),
    laps,
  );
  const completed = laps.flatMap((entry) => {
    const duration = entry.lap_duration;
    if (duration === null || !Number.isFinite(duration) || duration <= 0 ||
      entry.is_pit_out_lap || deleted.has(lapKey(entry))) return [];
    const startMs = Date.parse(entry.date_start) - sessionStartMs;
    if (startMs >= lapStartCutoffMs) return [];
    const ms = startMs + duration * 1000;
    return elapsed(ms) ? [{ entry, ms, duration }] : [];
  }).sort((a, b) => a.ms - b.ms);
  const personalBests = new Map<number, number>();
  let sessionBest = Infinity;
  for (const { entry, ms, duration } of completed) {
    const fastest = duration < sessionBest;
    sessionBest = Math.min(sessionBest, duration);
    if (duration >= (personalBests.get(entry.driver_number) ?? Infinity)) continue;
    personalBests.set(entry.driver_number, duration);
    if (entry.driver_number === driverNumber) {
      events.push({
        id: `lap-${driverNumber}-${entry.lap_number}`,
        ms, kind: "lap", entry, lapTime: duration, fastest,
      });
    }
  }
  return events.sort((a, b) => b.ms - a.ms || a.id.localeCompare(b.id));
}
