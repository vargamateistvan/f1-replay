import type { GridCell, ProgressionRound } from "@/utils/championship";
import { finishBucket, type FinishBucket } from "@/utils/driverProfile";

export interface ConstructorSeasonStats {
  /** Grand Prix / Sprint rounds where at least one car took part. */
  races: number;
  sprints: number;
  /** Grand Prix wins / car podiums / poles. */
  wins: number;
  podiums: number;
  poles: number;
  sprintWins: number;
  /** Grand Prix 1-2 finishes. */
  oneTwos: number;
  /** Grand Prix rounds where every entered car scored. */
  doublePoints: number;
  /** Grand Prix car finishes in the points. */
  pointsFinishes: number;
  /** Grand Prix car starts (entries). */
  entries: number;
  /** Grand Prix DNF + DNS + DSQ, per car. */
  retirements: number;
  racePoints: number;
  sprintPoints: number;
  /** Grand Prix points per round; null without rounds. */
  pointsPerRace: number | null;
  /** Best classified Grand Prix finish by either car. */
  bestFinish: number | null;
  /** Average qualifying position of all cars. */
  averageQualifying: number | null;
}

const isClassified = (cell: GridCell): cell is GridCell & { position: number } =>
  cell.status === "finished" && cell.position !== null;

// Season summary for a team from its drivers' rows of the results grid
// (each row aligned with `rounds`; null = that driver did not take part).
export function constructorSeasonStats(
  rounds: ProgressionRound[],
  rows: (GridCell | null)[][],
): ConstructorSeasonStats {
  const stats: ConstructorSeasonStats = {
    races: 0,
    sprints: 0,
    wins: 0,
    podiums: 0,
    poles: 0,
    sprintWins: 0,
    oneTwos: 0,
    doublePoints: 0,
    pointsFinishes: 0,
    entries: 0,
    retirements: 0,
    racePoints: 0,
    sprintPoints: 0,
    pointsPerRace: null,
    bestFinish: null,
    averageQualifying: null,
  };
  const qualifying: number[] = [];

  rounds.forEach((round, i) => {
    const cells = rows
      .map((row) => row[i])
      .filter((c): c is GridCell => c != null);
    if (cells.length === 0) return;
    const classified = cells.filter(isClassified).map((c) => c.position);
    const points = cells.reduce((sum, c) => sum + c.points, 0);

    if (round.isSprint) {
      stats.sprints += 1;
      stats.sprintPoints += points;
      if (classified.includes(1)) stats.sprintWins += 1;
      return;
    }

    stats.races += 1;
    stats.racePoints += points;
    stats.entries += cells.length;
    if (classified.includes(1)) stats.wins += 1;
    if (classified.includes(1) && classified.includes(2)) stats.oneTwos += 1;
    stats.podiums += classified.filter((p) => p <= 3).length;
    stats.poles += cells.filter((c) => c.pole).length;
    stats.retirements += cells.filter((c) => !isClassified(c)).length;
    const scorers = cells.filter((c) => c.points > 0).length;
    stats.pointsFinishes += scorers;
    if (cells.length > 1 && scorers === cells.length) stats.doublePoints += 1;
    for (const c of cells) {
      if (c.qualifying !== undefined) qualifying.push(c.qualifying);
    }
    for (const p of classified) {
      if (stats.bestFinish === null || p < stats.bestFinish) stats.bestFinish = p;
    }
  });

  stats.pointsPerRace =
    stats.races === 0 ? null : stats.racePoints / stats.races;
  stats.averageQualifying =
    qualifying.length === 0
      ? null
      : qualifying.reduce((sum, q) => sum + q, 0) / qualifying.length;
  return stats;
}

// Team points scored in each round (all cars), aligned with `rounds`.
export function constructorRoundPoints(
  rounds: ProgressionRound[],
  rows: (GridCell | null)[][],
): number[] {
  return rounds.map((_, i) =>
    rows.reduce((sum, row) => sum + (row[i]?.points ?? 0), 0),
  );
}

// Grand Prix car finishes per bucket across all of the team's drivers.
export function constructorFinishDistribution(
  rounds: ProgressionRound[],
  rows: (GridCell | null)[][],
): Record<FinishBucket, number> {
  const out: Record<FinishBucket, number> = {
    win: 0,
    podium: 0,
    points: 0,
    noPoints: 0,
    dnf: 0,
  };
  rounds.forEach((round, i) => {
    if (round.isSprint) return;
    for (const row of rows) {
      const cell = row[i];
      if (cell) out[finishBucket(cell)] += 1;
    }
  });
  return out;
}

// Team names go in the URL path; dots/spaces/ampersands are encoded.
export const constructorPath = (name: string): string =>
  `/standings/team/${encodeURIComponent(name)}`;
