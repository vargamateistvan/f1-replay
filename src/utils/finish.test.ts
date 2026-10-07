import { describe, expect, it } from "vitest";
import type { Lap } from "@/api/types";
import { deriveFinishedDrivers, findLeaderFinishMs } from "./finish";

const BASE = Date.parse("2024-01-01T00:00:00.000Z");
const at = (sec: number) => BASE + sec * 1000;

function lap(
  driver_number: number,
  lap_number: number,
  startSec: number,
  lap_duration: number | null,
): Lap {
  return {
    date_start: new Date(at(startSec)).toISOString(),
    driver_number,
    lap_duration,
    lap_number,
  } as Lap;
}

// Leader (1) completes lap 10 at t=100s; P2 (2) at t=105s on the same lap;
// lapped car (3) is on lap 9 and crosses at t=98s (just before the leader)
// and again at t=190s.
const RACE_LAPS = [
  lap(1, 10, 10, 90),
  lap(2, 10, 15, 90),
  lap(3, 9, 8, 90),
  lap(3, 10, 98, 92),
];

function finished(chequeredSec: number | null, currentSec: number, laps = RACE_LAPS) {
  return [
    ...deriveFinishedDrivers({
      laps,
      chequeredAbsMs: chequeredSec === null ? null : at(chequeredSec),
      currentT: at(currentSec),
      isRaceSession: true,
    }),
  ].sort((a, b) => a - b);
}

describe("findLeaderFinishMs", () => {
  it("anchors on the leader's crossing when the flag message is early", () => {
    expect(findLeaderFinishMs(RACE_LAPS, at(98.5))).toBe(at(100));
  });

  it("anchors on the leader's crossing when the flag message is late", () => {
    expect(findLeaderFinishMs(RACE_LAPS, at(100.8))).toBe(at(100));
  });

  it("uses the next lap start when the final lap has no duration", () => {
    const laps = [lap(1, 10, 10, null), lap(1, 11, 100, null)];
    expect(findLeaderFinishMs(laps, at(99))).toBe(at(100));
  });

  it("falls back to the flag time when no crossing is nearby", () => {
    expect(findLeaderFinishMs([], at(100))).toBe(at(100));
  });
});

describe("deriveFinishedDrivers", () => {
  it("returns nothing outside race sessions or without a chequered flag", () => {
    expect(finished(null, 300)).toEqual([]);
    expect(
      deriveFinishedDrivers({
        laps: RACE_LAPS,
        chequeredAbsMs: at(99),
        currentT: at(300),
        isRaceSession: false,
      }).size,
    ).toBe(0);
  });

  it("returns nothing until the leader crosses the line", () => {
    expect(finished(99, 99.9)).toEqual([]);
  });

  it("marks the leader even when the flag message comes after its crossing", () => {
    expect(finished(100.8, 100.8)).toEqual([1]);
  });

  it("does not finish a lapped car that crossed just before the leader", () => {
    expect(finished(97.5, 110)).toEqual([1, 2]);
  });

  it("finishes a lapped car on its next crossing after the leader", () => {
    expect(finished(97.5, 190)).toEqual([1, 2, 3]);
  });

  it("excludes retired drivers", () => {
    const result = deriveFinishedDrivers({
      laps: RACE_LAPS,
      chequeredAbsMs: at(99),
      currentT: at(300),
      isRaceSession: true,
      retiredDrivers: new Set([2]),
    });
    expect(result.has(2)).toBe(false);
    expect(result.has(1)).toBe(true);
  });
});
