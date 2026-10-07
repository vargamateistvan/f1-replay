import type { Lap } from "@/api/types";
import { CHEQUERED_LEADER_SEARCH_MS } from "@/constants";

interface Params {
  laps: Lap[];
  /** Absolute UTC ms of the race-control chequered flag, or null when not shown. */
  chequeredAbsMs: number | null;
  /** Absolute UTC ms of the current playhead. */
  currentT: number;
  isRaceSession: boolean;
  retiredDrivers?: ReadonlySet<number>;
}

interface LineCrossing {
  driverNumber: number;
  ms: number;
  /** Number of laps completed at this crossing. */
  lapsCompleted: number;
}

/**
 * Every start/finish line crossing implied by the lap data. A crossing is the
 * end of a timed lap or the start of the next one, so it is still found when
 * the final lap has no recorded duration.
 */
function lineCrossings(laps: Lap[]): LineCrossing[] {
  const crossings: LineCrossing[] = [];
  for (const lap of laps) {
    if (!lap.date_start) continue;
    const startMs = new Date(lap.date_start).getTime();
    if (!Number.isFinite(startMs)) continue;
    if (lap.lap_number > 1) {
      crossings.push({
        driverNumber: lap.driver_number,
        ms: startMs,
        lapsCompleted: lap.lap_number - 1,
      });
    }
    if (lap.lap_duration !== null) {
      crossings.push({
        driverNumber: lap.driver_number,
        ms: startMs + lap.lap_duration * 1000,
        lapsCompleted: lap.lap_number,
      });
    }
  }
  return crossings;
}

/**
 * The moment the race leader takes the chequered flag. The race-control
 * timestamp is only approximate, so this picks the crossing near the flag
 * with the most laps completed — lapped cars crossing just before the
 * leader can't be mistaken for it. Falls back to the flag time.
 */
export function findLeaderFinishMs(
  laps: Lap[],
  chequeredAbsMs: number,
): number {
  let best: LineCrossing | null = null;
  for (const crossing of lineCrossings(laps)) {
    if (Math.abs(crossing.ms - chequeredAbsMs) > CHEQUERED_LEADER_SEARCH_MS)
      continue;
    if (
      best === null ||
      crossing.lapsCompleted > best.lapsCompleted ||
      (crossing.lapsCompleted === best.lapsCompleted && crossing.ms < best.ms)
    ) {
      best = crossing;
    }
  }
  return best?.ms ?? chequeredAbsMs;
}

/**
 * Drivers who have finished the race: once the leader takes the chequered
 * flag, every car — including lapped ones — finishes on its next crossing of
 * the start/finish line.
 */
export function deriveFinishedDrivers({
  laps,
  chequeredAbsMs,
  currentT,
  isRaceSession,
  retiredDrivers,
}: Params): ReadonlySet<number> {
  const finished = new Set<number>();
  if (!isRaceSession || chequeredAbsMs === null) return finished;

  const leaderFinishMs = findLeaderFinishMs(laps, chequeredAbsMs);
  if (currentT < leaderFinishMs) return finished;

  for (const crossing of lineCrossings(laps)) {
    if (retiredDrivers?.has(crossing.driverNumber)) continue;
    if (crossing.ms >= leaderFinishMs && crossing.ms <= currentT) {
      finished.add(crossing.driverNumber);
    }
  }

  return finished;
}
