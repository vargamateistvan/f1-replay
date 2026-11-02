import { describe, expect, it } from "vitest";
import type { CarData, Position, RaceControl } from "@/api/types";
import {
  STANDING_RESTART_MIN_STOP_MS,
  STANDING_RESTART_SEARCH_MS,
} from "@/constants";
import {
  detectLightsOut,
  leaderAt,
  standingRestartSearches,
} from "./standingRestart";

const at = (time: string) => `2026-11-01T${time}+00:00`;
const ms = (time: string) => Date.parse(at(time));

function rc(time: string, message: string, extra: Partial<RaceControl> = {}) {
  return { date: at(time), message, ...extra } as RaceControl;
}

// 2026 Mexico City GP: red flag on lap 45, standing restart on lap 47.
const MEXICO_RC = [
  rc("20:03:25.510", "SESSION STARTED", { category: "SessionStatus" }),
  rc("20:03:26", "RACE START"),
  rc("21:06:02.012", "SESSION ABORTED", { category: "SessionStatus" }),
  rc("21:06:02", "RED FLAG - RACE SUSPENDED"),
  rc("21:32:43", "RACE WILL RESUME AT 15:45"),
  rc("21:40:23", "SAFETY CAR LIGHTS ON"),
  rc("21:45:00.156", "SESSION STARTED", { category: "SessionStatus" }),
  rc("21:45:54", "STANDING START"),
  rc("22:40:00", "CHEQUERED FLAG", { flag: "CHEQUERED" }),
];

describe("standingRestartSearches", () => {
  it("searches from the standing start announcement after a red flag", () => {
    expect(standingRestartSearches(MEXICO_RC)).toEqual([
      {
        fromMs: ms("21:45:54"),
        toMs: ms("21:45:54") + STANDING_RESTART_SEARCH_MS,
      },
    ]);
  });

  it("waits for the resumption when the announcement comes first", () => {
    const searches = standingRestartSearches([
      rc("21:06:02", "RED FLAG", { flag: "RED" }),
      rc("21:30:00", "STANDING START"),
      rc("21:45:00", "SESSION STARTED"),
    ]);
    expect(searches.map((s) => s.fromMs)).toEqual([ms("21:45:00")]);
  });

  it("ignores red flags without a standing start and the race start", () => {
    expect(
      standingRestartSearches([
        rc("20:03:26", "STANDING START"),
        rc("21:00:00", "RED FLAG", { flag: "RED" }),
        rc("21:30:00", "SESSION STARTED"),
        rc("21:31:00", "ROLLING START"),
        rc("22:00:00", "CHEQUERED FLAG", { flag: "CHEQUERED" }),
      ]),
    ).toEqual([]);
  });

  it("handles one standing restart per red flag", () => {
    const searches = standingRestartSearches([
      rc("21:00:00", "RED FLAG", { flag: "RED" }),
      rc("21:20:00", "SESSION STARTED"),
      rc("21:20:30", "STANDING START"),
      rc("21:40:00", "RED FLAG", { flag: "RED" }),
      rc("22:00:00", "SESSION STARTED"),
      rc("22:00:30", "STANDING START"),
    ]);
    expect(searches.map((s) => s.fromMs)).toEqual([
      ms("21:20:30"),
      ms("22:00:30"),
    ]);
  });
});

describe("leaderAt", () => {
  const positions = [
    { date: at("20:00:00"), driver_number: 16, position: 1 },
    { date: at("20:30:00"), driver_number: 3, position: 1 },
    { date: at("20:30:00"), driver_number: 16, position: 2 },
    { date: at("22:00:00"), driver_number: 44, position: 1 },
  ] as Position[];

  it("is the latest P1 at or before the time", () => {
    expect(leaderAt(positions, ms("21:45:54"))).toBe(3);
    expect(leaderAt(positions, ms("20:10:00"))).toBe(16);
    expect(leaderAt(positions, ms("19:00:00"))).toBeNull();
  });
});

describe("detectLightsOut", () => {
  function samples(points: [string, number][]): CarData[] {
    return points.map(([time, speed]) => ({ date: at(time), speed }) as CarData);
  }

  it("is the last stationary sample before pulling away from the grid", () => {
    const rows = samples([
      ["21:47:00", 80],
      ["21:47:10", 30],
      ["21:47:21.471", 0],
      ["21:47:50", 0],
      ["21:48:12.900", 0],
      ["21:48:13.191", 6],
      ["21:48:14", 40],
    ]);
    expect(detectLightsOut(rows)).toBe(ms("21:48:12.900"));
  });

  it("ignores brief stops and works on unsorted rows", () => {
    const shortStop = STANDING_RESTART_MIN_STOP_MS - 1_000;
    const rows = samples([
      ["21:48:20", 50],
      ["21:46:00", 0],
      [new Date(ms("21:46:00") + shortStop).toISOString().slice(11, 23), 0],
      ["21:46:10", 20],
      ["21:48:00", 0],
      ["21:48:10", 0],
      ["21:48:11", 5],
    ]);
    expect(detectLightsOut(rows)).toBe(ms("21:48:10"));
  });

  it("is null when the car never leaves a standstill", () => {
    expect(detectLightsOut(samples([["21:48:00", 0], ["21:49:00", 0]]))).toBeNull();
    expect(detectLightsOut([])).toBeNull();
  });
});
