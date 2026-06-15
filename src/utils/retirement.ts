import type { Lap, Position, RaceControl } from "@/api/types";

const RETIREMENT_GAP_MS = 5 * 60_000;
const RETIREMENT_MESSAGE_RE =
  /\b(retire(?:d|ment)?|stopp?ed|out of the session|did not finish|dnf)\b/i;

interface Params {
  positions: Position[];
  laps: Lap[];
  raceControl?: RaceControl[];
  currentT: number;
  isRaceSession: boolean;
}

export function deriveRetiredDrivers({
  positions,
  laps,
  raceControl = [],
  currentT,
  isRaceSession,
}: Params): ReadonlySet<number> {
  if (!isRaceSession || positions.length === 0) return new Set<number>();

  const lastMs = new Map<number, number>();
  for (const position of positions) {
    const ms = new Date(position.date).getTime();
    if (ms > currentT) continue;
    const prev = lastMs.get(position.driver_number) ?? 0;
    if (ms > prev) lastMs.set(position.driver_number, ms);
  }

  let maxMs = 0;
  for (const ms of lastMs.values()) if (ms > maxMs) maxMs = ms;

  const activeLappers = new Set<number>();
  for (const lap of laps) {
    if (!lap.date_start) continue;
    const lapStartMs = new Date(lap.date_start).getTime();
    if (lapStartMs <= currentT && maxMs - lapStartMs < RETIREMENT_GAP_MS) {
      activeLappers.add(lap.driver_number);
    }
  }

  const raceControlRetired = new Set<number>();
  for (const entry of raceControl) {
    if (entry.driver_number === null) continue;
    const ms = new Date(entry.date).getTime();
    if (ms > currentT) continue;
    if (RETIREMENT_MESSAGE_RE.test(entry.message)) {
      raceControlRetired.add(entry.driver_number);
    }
  }

  const retired = new Set<number>();
  for (const [driverNumber, ms] of lastMs) {
    if (
      raceControlRetired.has(driverNumber) ||
      (maxMs - ms > RETIREMENT_GAP_MS && !activeLappers.has(driverNumber))
    ) {
      retired.add(driverNumber);
    }
  }

  return retired;
}
