import { describe, expect, it } from "vitest";
import type { GridCell, ProgressionRound } from "@/utils/championship";
import {
  championshipPositions,
  driverSeasonStats,
  finishBucket,
  finishDistribution,
} from "./driverProfile";

const round = (sessionKey: number, isSprint = false): ProgressionRound => ({
  sessionKey,
  label: `R${sessionKey}`,
  code: "XXX",
  isSprint,
});

const cell = (p: Partial<GridCell>): GridCell => ({
  position: null,
  points: 0,
  status: "finished",
  ...p,
});

describe("finishBucket", () => {
  it("classifies finishes", () => {
    expect(finishBucket(cell({ position: 1, points: 25 }))).toBe("win");
    expect(finishBucket(cell({ position: 3, points: 15 }))).toBe("podium");
    expect(finishBucket(cell({ position: 7, points: 6 }))).toBe("points");
    expect(finishBucket(cell({ position: 14 }))).toBe("noPoints");
    expect(finishBucket(cell({ status: "dnf" }))).toBe("dnf");
    expect(finishBucket(cell({ status: "dsq", position: 2 }))).toBe("dnf");
  });
});

describe("driverSeasonStats", () => {
  const rounds = [round(1), round(2, true), round(3), round(4), round(5)];
  const cells: (GridCell | null)[] = [
    cell({ position: 1, points: 25, pole: true, qualifying: 1 }),
    cell({ position: 1, points: 8 }),
    cell({ position: 5, points: 10, qualifying: 9 }),
    cell({ status: "dnf", qualifying: 4 }),
    null,
  ];

  it("splits Grand Prix and Sprint results", () => {
    const stats = driverSeasonStats(rounds, cells);
    expect(stats).toMatchObject({
      races: 3,
      sprints: 1,
      wins: 1,
      podiums: 1,
      poles: 1,
      sprintWins: 1,
      pointsFinishes: 2,
      dnfs: 1,
      racePoints: 35,
      sprintPoints: 8,
      bestFinish: 1,
      averageFinish: 3,
      bestQualifying: 1,
    });
    expect(stats.pointsPerRace).toBeCloseTo(35 / 3);
    expect(stats.averageQualifying).toBeCloseTo(14 / 3);
    // P1→P1 (0) and P9→P5 (+4); the DNF is excluded.
    expect(stats.averagePositionsGained).toBe(2);
  });

  it("returns nulls without entries", () => {
    const stats = driverSeasonStats([round(1)], [null]);
    expect(stats.races).toBe(0);
    expect(stats.pointsPerRace).toBeNull();
    expect(stats.averageFinish).toBeNull();
    expect(stats.averagePositionsGained).toBeNull();
  });
});

describe("finishDistribution", () => {
  it("counts Grand Prix results only", () => {
    expect(
      finishDistribution(
        [round(1), round(2, true), round(3)],
        [
          cell({ position: 2, points: 18 }),
          cell({ position: 1, points: 8 }),
          cell({ status: "dns" }),
        ],
      ),
    ).toEqual({ win: 0, podium: 1, points: 0, noPoints: 0, dnf: 1 });
  });
});

describe("championshipPositions", () => {
  it("ranks by cumulative points with shared ties", () => {
    const totals = new Map([
      [1, [25, 25, 43]],
      [2, [18, 43, 43]],
      [3, [15, 30, 50]],
    ]);
    expect(championshipPositions(totals, 1)).toEqual([1, 3, 2]);
    expect(championshipPositions(totals, 2)).toEqual([2, 1, 2]);
    expect(championshipPositions(totals, 4)).toEqual([]);
  });
});
