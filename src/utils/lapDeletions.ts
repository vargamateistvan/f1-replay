import type { Lap, RaceControl } from "@/api/types";

export interface LapDeletionEvent {
  /** Absolute UTC ms of the race-control message. */
  ms: number;
  driverNumber: number;
  /** Deleted lap time in seconds. */
  lapTime: number;
  kind: "deleted" | "reinstated";
}

// "CAR 3 (VER) TIME 1:35.860 DELETED - TRACK LIMITS AT TURN 19 LAP 15 13:07:21"
// "CAR 27 (HUL) TIME 8:42.988 WILL BE REINSTATED"
// The message's LAP number is the FIA count, one ahead of OpenF1's
// lap_number, so laps are matched on driver + lap time instead. Timeless
// "LAP DELETED ... (NEXT LAP PIT)" messages are ignored: they hit pit laps
// that never count as a best time.
const DELETION_RE =
  /\bCAR (\d+)\b.*?\bTIME (\d+):(\d{2}\.\d{1,3})\s+(DELETED|WILL BE REINSTATED|REINSTATED)\b/;

/** Lap-time deletions and reinstatements, sorted by message time. */
export function parseLapDeletions(
  raceControl: readonly RaceControl[],
): LapDeletionEvent[] {
  const events: LapDeletionEvent[] = [];
  for (const entry of raceControl) {
    const match = DELETION_RE.exec(entry.message ?? "");
    if (!match) continue;
    const ms = new Date(entry.date).getTime();
    if (!Number.isFinite(ms)) continue;
    events.push({
      ms,
      driverNumber: Number(match[1]),
      lapTime: Number(match[2]) * 60 + Number(match[3]),
      kind: match[4] === "DELETED" ? "deleted" : "reinstated",
    });
  }
  return events.sort((a, b) => a.ms - b.ms);
}

export function lapKey(lap: Pick<Lap, "driver_number" | "lap_number">) {
  return `${lap.driver_number}:${lap.lap_number}`;
}

// Race control prints lap times to the millisecond.
const LAP_TIME_TOLERANCE_S = 0.0005;

/**
 * Keys (`lapKey`) of the laps whose time stands deleted after `events`
 * (pass only the events already shown at the playhead).
 */
export function deletedLapKeys(
  events: readonly LapDeletionEvent[],
  laps: readonly Lap[],
): ReadonlySet<string> {
  const deleted = new Set<string>();
  if (!events.length) return deleted;

  const lapsByDriver = new Map<number, Lap[]>();
  for (const lap of laps) {
    if (lap.lap_duration === null) continue;
    const list = lapsByDriver.get(lap.driver_number) ?? [];
    list.push(lap);
    lapsByDriver.set(lap.driver_number, list);
  }

  for (const event of events) {
    // Same time twice is rare; prefer the latest such lap started before
    // the message.
    let lap: Lap | undefined;
    for (const l of lapsByDriver.get(event.driverNumber) ?? []) {
      if (Math.abs((l.lap_duration ?? 0) - event.lapTime) > LAP_TIME_TOLERANCE_S)
        continue;
      const startMs = l.date_start ? new Date(l.date_start).getTime() : NaN;
      if (lap === undefined || startMs <= event.ms) lap = l;
    }
    if (!lap) continue;
    if (event.kind === "deleted") deleted.add(lapKey(lap));
    else deleted.delete(lapKey(lap));
  }
  return deleted;
}
