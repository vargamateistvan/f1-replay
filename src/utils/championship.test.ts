import { describe, expect, it } from "vitest";
import type { SessionResult } from "@/api/types";
import {
  headToHead,
  isMainQualifyingSession,
  maxSessionPoints,
  pointsProgression,
  remainingPoints,
  resultsGrid,
  teammatePairs,
  titleOutlook,
} from "./championship";

function res(p: Partial<SessionResult>): SessionResult {
  return {
    position: null,
    driver_number: 0,
    number_of_laps: null,
    points: null,
    dnf: false,
    dns: false,
    dsq: false,
    duration: null,
    gap_to_leader: null,
    meeting_key: 0,
    session_key: 0,
    ...p,
  };
}

const session = (
  session_key: number,
  session_name: string,
  date_start: string,
  extra: Record<string, unknown> = {},
) => ({
  session_key,
  session_type: session_name === "Sprint" ? "Race" : session_name,
  session_name,
  date_start,
  circuit_short_name: `C${session_key}`,
  ...extra,
});

describe("pointsProgression", () => {
  it("accumulates race and sprint points per competitor", () => {
    const { rounds, totals } = pointsProgression(
      [
        session(1, "Race", "2025-03-01T00:00:00Z"),
        session(2, "Sprint", "2025-03-08T00:00:00Z"),
        session(3, "Race", "2025-03-09T00:00:00Z"),
      ],
      [
        [res({ driver_number: 1, position: 1, points: 25 }), res({ driver_number: 4, position: 2, points: 18 })],
        [res({ driver_number: 4, position: 1 }), res({ driver_number: 1, position: 2 })],
        [res({ driver_number: 1, position: null, dnf: true, points: 0 }), res({ driver_number: 4, position: 1, points: 25 })],
      ],
      (num) => num,
    );
    expect(rounds.map((r) => r.label)).toEqual(["C1", "C2 (S)", "C3"]);
    expect(totals.get(1)).toEqual([25, 32, 32]);
    expect(totals.get(4)).toEqual([18, 26, 51]);
  });

  it("groups by team and skips rounds that have not loaded", () => {
    const team = (num: number) => (num === 99 ? null : num < 10 ? "A" : "B");
    const { rounds, totals } = pointsProgression(
      [session(1, "Race", "2025-03-01T00:00:00Z"), session(2, "Race", "2025-03-08T00:00:00Z")],
      [
        undefined,
        [
          res({ driver_number: 1, position: 1 }),
          res({ driver_number: 2, position: 2 }),
          res({ driver_number: 11, position: 3 }),
          res({ driver_number: 99, position: 4 }),
        ],
      ],
      team,
    );
    expect(rounds).toHaveLength(1);
    expect(Object.fromEntries(totals)).toEqual({ A: [43], B: [15] });
  });
});

describe("maxSessionPoints", () => {
  it("includes the fastest-lap point only up to 2024", () => {
    expect(maxSessionPoints(2024, false, "driver")).toBe(26);
    expect(maxSessionPoints(2025, false, "driver")).toBe(25);
    expect(maxSessionPoints(2024, false, "team")).toBe(44);
    expect(maxSessionPoints(2025, false, "team")).toBe(43);
  });

  it("uses the sprint table for sprints", () => {
    expect(maxSessionPoints(2024, true, "driver")).toBe(8);
    expect(maxSessionPoints(2024, true, "team")).toBe(15);
  });
});

describe("remainingPoints", () => {
  it("counts races and sprints that start after the cut-off", () => {
    const out = remainingPoints(
      [
        session(1, "Race", "2025-10-01T00:00:00Z"),
        session(2, "Sprint", "2025-10-10T00:00:00Z"),
        session(3, "Race", "2025-10-11T00:00:00Z"),
        session(4, "Qualifying", "2025-10-10T12:00:00Z"),
        session(5, "Race", "2025-10-20T00:00:00Z", { is_cancelled: true }),
      ],
      Date.parse("2025-10-01T00:00:00Z"),
      2025,
    );
    expect(out).toEqual({ races: 1, sprints: 1, driver: 33, team: 58 });
  });
});

describe("titleOutlook", () => {
  const standings = [
    { key: "VER", points: 300 },
    { key: "NOR", points: 260 },
    { key: "LEC", points: 240 },
    { key: "HAM", points: 200 },
  ];

  it("marks rivals who can still catch the leader as contenders", () => {
    const out = titleOutlook(standings, 60);
    expect(out.get("VER")).toEqual({ status: "leader", maxPoints: 360 });
    expect(out.get("NOR")?.status).toBe("contender");
    // Can only draw level — still in it on countback.
    expect(out.get("LEC")).toEqual({ status: "contender", maxPoints: 300 });
    expect(out.get("HAM")).toEqual({ status: "eliminated", maxPoints: 260 });
  });

  it("declares the champion once the lead exceeds the points left", () => {
    const out = titleOutlook(standings, 39);
    expect(out.get("VER")?.status).toBe("champion");
    expect(out.get("NOR")?.status).toBe("eliminated");
  });

  it("does not clinch when the runner-up can draw level", () => {
    expect(titleOutlook(standings, 40).get("VER")?.status).toBe("leader");
  });

  it("crowns the leader when no points remain, even on a tie", () => {
    const out = titleOutlook(
      [
        { key: "A", points: 100 },
        { key: "B", points: 100 },
      ],
      0,
    );
    expect(out.get("A")?.status).toBe("champion");
    expect(out.get("B")?.status).toBe("eliminated");
  });

  it("handles empty and single-entry standings", () => {
    expect(titleOutlook([], 10).size).toBe(0);
    expect(titleOutlook([{ key: "A", points: 0 }], 10).get("A")?.status).toBe(
      "champion",
    );
  });
});

describe("isMainQualifyingSession", () => {
  it("excludes sprint qualifying and shootouts", () => {
    expect(isMainQualifyingSession({ session_type: "Qualifying", session_name: "Qualifying" })).toBe(true);
    expect(isMainQualifyingSession({ session_type: "Qualifying", session_name: "Sprint Qualifying" })).toBe(false);
    expect(isMainQualifyingSession({ session_type: "Qualifying", session_name: "Sprint Shootout" })).toBe(false);
    expect(isMainQualifyingSession({ session_type: "Race", session_name: "Race" })).toBe(false);
  });
});

describe("headToHead", () => {
  it("credits the better classified driver and skips double non-finishes", () => {
    const score = headToHead(
      [
        [res({ driver_number: 1, position: 1 }), res({ driver_number: 2, position: 3 })],
        [res({ driver_number: 1, position: 5 }), res({ driver_number: 2, position: 4 })],
        [res({ driver_number: 1, position: null, dnf: true }), res({ driver_number: 2, position: 9 })],
        [res({ driver_number: 1, position: 2, dsq: true }), res({ driver_number: 2, position: null, dnf: true })],
        [res({ driver_number: 1, position: 6 })],
        undefined,
      ],
      1,
      2,
    );
    expect(score).toEqual({ a: 2, b: 2 });
  });
});

describe("teammatePairs", () => {
  it("pairs each team's top two scorers, higher scorer first", () => {
    const pairs = teammatePairs(
      [
        { driver_number: 1, team_name: "Red Bull" },
        { driver_number: 22, team_name: "Red Bull" },
        { driver_number: 30, team_name: "Red Bull" },
        { driver_number: 44, team_name: "Ferrari" },
        { driver_number: 16, team_name: "Ferrari" },
        { driver_number: 99, team_name: "Solo" },
      ],
      new Map([
        [1, 300],
        [22, 10],
        [30, 20],
        [44, 100],
        [16, 150],
      ]),
    );
    expect(pairs).toEqual([
      { team: "Red Bull", a: 1, b: 30 },
      { team: "Ferrari", a: 16, b: 44 },
    ]);
  });
});

describe("resultsGrid", () => {
  it("records each driver's classification per round", () => {
    const { rounds, cells } = resultsGrid(
      [
        session(1, "Race", "2025-03-01T00:00:00Z", { country_code: "bhr" }),
        session(2, "Sprint", "2025-03-08T00:00:00Z", { country_code: "CHN" }),
        session(3, "Race", "2025-03-09T00:00:00Z"),
      ],
      [
        [
          res({ driver_number: 1, position: 1, points: 25 }),
          res({ driver_number: 4, position: null, dnf: true }),
        ],
        [res({ driver_number: 1, position: 3 }), res({ driver_number: 4, position: 2, dsq: true })],
        undefined,
      ],
    );
    expect(rounds.map((r) => [r.code, r.isSprint])).toEqual([
      ["BHR", false],
      ["CHN", true],
    ]);
    expect(cells.get(1)).toEqual([
      { position: 1, points: 25, status: "finished" },
      { position: 3, points: 6, status: "finished" },
    ]);
    expect(cells.get(4)).toEqual([
      { position: null, points: 0, status: "dnf" },
      { position: 2, points: 0, status: "dsq" },
    ]);
  });

  it("leaves a gap for rounds a driver missed", () => {
    const { cells } = resultsGrid(
      [session(1, "Race", "2025-03-01T00:00:00Z"), session(2, "Race", "2025-03-08T00:00:00Z")],
      [[res({ driver_number: 1, position: 1 })], [res({ driver_number: 40, position: 9 })]],
    );
    expect(cells.get(1)?.[1]).toBeNull();
    expect(cells.get(40)?.[0]).toBeNull();
  });
});
