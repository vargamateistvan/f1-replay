import { describe, expect, it } from "vitest";
import type { GridCell, ProgressionRound } from "@/utils/championship";
import {
  constructorFinishDistribution,
  constructorPath,
  constructorRoundPoints,
  constructorSeasonStats,
} from "./constructorProfile";

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

const rounds = [round(1), round(2, true), round(3), round(4)];
// Two drivers; driver B misses round 4 (replacement C runs it).
const a: (GridCell | null)[] = [
  cell({ position: 1, points: 25, pole: true, qualifying: 1 }),
  cell({ position: 1, points: 8 }),
  cell({ position: 4, points: 12, qualifying: 3 }),
  cell({ status: "dnf", qualifying: 5 }),
];
const b: (GridCell | null)[] = [
  cell({ position: 2, points: 18, qualifying: 2 }),
  cell({ position: 9 }),
  cell({ position: 12, qualifying: 10 }),
  null,
];
const c: (GridCell | null)[] = [null, null, null, cell({ position: 8, points: 4 })];

describe("constructorSeasonStats", () => {
  it("aggregates every car per round", () => {
    const stats = constructorSeasonStats(rounds, [a, b, c]);
    expect(stats).toMatchObject({
      races: 3,
      sprints: 1,
      wins: 1,
      oneTwos: 1,
      podiums: 2,
      poles: 1,
      sprintWins: 1,
      entries: 6,
      pointsFinishes: 4,
      // R1 both scored; R3 only one; R4 only one (A retired).
      doublePoints: 1,
      retirements: 1,
      racePoints: 59,
      sprintPoints: 8,
      bestFinish: 1,
    });
    expect(stats.pointsPerRace).toBeCloseTo(59 / 3);
    expect(stats.averageQualifying).toBeCloseTo(21 / 5);
  });

  it("returns nulls without entries", () => {
    const stats = constructorSeasonStats([round(1)], [[null]]);
    expect(stats.races).toBe(0);
    expect(stats.pointsPerRace).toBeNull();
    expect(stats.bestFinish).toBeNull();
  });
});

describe("constructorRoundPoints", () => {
  it("sums all cars per round", () => {
    expect(constructorRoundPoints(rounds, [a, b, c])).toEqual([43, 8, 12, 4]);
  });
});

describe("constructorFinishDistribution", () => {
  it("counts Grand Prix car finishes only", () => {
    expect(constructorFinishDistribution(rounds, [a, b, c])).toEqual({
      win: 1,
      podium: 1,
      points: 2,
      noPoints: 1,
      dnf: 1,
    });
  });
});

describe("constructorPath", () => {
  it("encodes team names", () => {
    expect(constructorPath("Kick Sauber")).toBe("/standings/team/Kick%20Sauber");
    expect(constructorPath("RB F1 Team")).toBe("/standings/team/RB%20F1%20Team");
  });
});
