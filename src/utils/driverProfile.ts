import type { GridCell, ProgressionRound } from "@/utils/championship";

export interface DriverSeasonStats {
  /** Grand Prix entries (including DNS). */
  races: number;
  sprints: number;
  /** Grand Prix wins / podiums / poles. */
  wins: number;
  podiums: number;
  poles: number;
  sprintWins: number;
  /** Grand Prix finishes in the points. */
  pointsFinishes: number;
  dnfs: number;
  dns: number;
  dsq: number;
  racePoints: number;
  sprintPoints: number;
  /** Grand Prix points per entry; null without entries. */
  pointsPerRace: number | null;
  /** Grand Prix classified finishes only. */
  bestFinish: number | null;
  averageFinish: number | null;
  bestQualifying: number | null;
  averageQualifying: number | null;
  /** Average places gained from qualifying to the flag (classified GPs). */
  averagePositionsGained: number | null;
}

export type FinishBucket = "win" | "podium" | "points" | "noPoints" | "dnf";

export const FINISH_BUCKETS: FinishBucket[] = [
  "win",
  "podium",
  "points",
  "noPoints",
  "dnf",
];

const average = (values: number[]): number | null =>
  values.length === 0
    ? null
    : values.reduce((sum, v) => sum + v, 0) / values.length;

const best = (values: number[]): number | null =>
  values.length === 0 ? null : Math.min(...values);

// DNS / DSQ / unclassified all count as "dnf" here — not a finish.
export function finishBucket(cell: GridCell): FinishBucket {
  if (cell.status !== "finished" || cell.position === null) return "dnf";
  if (cell.position === 1) return "win";
  if (cell.position <= 3) return "podium";
  return cell.points > 0 ? "points" : "noPoints";
}

// Season summary for one driver from their row of the results grid
// (cells aligned with `rounds`; null = did not take part).
export function driverSeasonStats(
  rounds: ProgressionRound[],
  cells: (GridCell | null)[],
): DriverSeasonStats {
  const stats: DriverSeasonStats = {
    races: 0,
    sprints: 0,
    wins: 0,
    podiums: 0,
    poles: 0,
    sprintWins: 0,
    pointsFinishes: 0,
    dnfs: 0,
    dns: 0,
    dsq: 0,
    racePoints: 0,
    sprintPoints: 0,
    pointsPerRace: null,
    bestFinish: null,
    averageFinish: null,
    bestQualifying: null,
    averageQualifying: null,
    averagePositionsGained: null,
  };
  const finishes: number[] = [];
  const qualifying: number[] = [];
  const gained: number[] = [];

  rounds.forEach((round, i) => {
    const cell = cells[i];
    if (!cell) return;
    const classified = cell.status === "finished" && cell.position !== null;

    if (round.isSprint) {
      stats.sprints += 1;
      stats.sprintPoints += cell.points;
      if (classified && cell.position === 1) stats.sprintWins += 1;
      return;
    }

    stats.races += 1;
    stats.racePoints += cell.points;
    if (cell.pole) stats.poles += 1;
    if (cell.qualifying !== undefined) qualifying.push(cell.qualifying);
    if (cell.status === "dnf") stats.dnfs += 1;
    else if (cell.status === "dns") stats.dns += 1;
    else if (cell.status === "dsq") stats.dsq += 1;
    if (!classified || cell.position === null) return;

    finishes.push(cell.position);
    if (cell.position === 1) stats.wins += 1;
    if (cell.position <= 3) stats.podiums += 1;
    if (cell.points > 0) stats.pointsFinishes += 1;
    if (cell.qualifying !== undefined)
      gained.push(cell.qualifying - cell.position);
  });

  stats.pointsPerRace =
    stats.races === 0 ? null : stats.racePoints / stats.races;
  stats.bestFinish = best(finishes);
  stats.averageFinish = average(finishes);
  stats.bestQualifying = best(qualifying);
  stats.averageQualifying = average(qualifying);
  stats.averagePositionsGained = average(gained);
  return stats;
}

// Grand Prix finishes per bucket, in FINISH_BUCKETS order.
export function finishDistribution(
  rounds: ProgressionRound[],
  cells: (GridCell | null)[],
): Record<FinishBucket, number> {
  const out: Record<FinishBucket, number> = {
    win: 0,
    podium: 0,
    points: 0,
    noPoints: 0,
    dnf: 0,
  };
  rounds.forEach((round, i) => {
    const cell = cells[i];
    if (round.isSprint || !cell) return;
    out[finishBucket(cell)] += 1;
  });
  return out;
}

// Championship position after each round from cumulative totals. Equal
// totals share a position (no countback — the results grid lacks the full
// finishing record of every rival).
export function championshipPositions<K>(
  totals: Map<K, number[]>,
  key: K,
): (number | null)[] {
  const own = totals.get(key);
  if (!own) return [];
  const rivals = [...totals.entries()].filter(([k]) => k !== key);
  return own.map(
    (points, i) =>
      1 + rivals.filter(([, values]) => (values[i] ?? 0) > points).length,
  );
}

export const driverPath = (driverNumber: number): string =>
  `/standings/driver/${driverNumber}`;
