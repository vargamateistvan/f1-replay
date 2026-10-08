import { describe, it, expect } from "vitest";
import { canonicalTeamName } from "./identity";
import {
  completedPointsSessions,
  computeStandings,
  tallyGrandPrixPodiums,
  type DriverInfo,
} from "./standings";
import type { SessionResult } from "@/api/types";

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

// 1 VER / Red Bull, 44 HAM / Mercedes, 4 NOR / McLaren, 11 PER / Red Bull
const info: DriverInfo = {
  acronym: new Map([
    [1, "VER"],
    [44, "HAM"],
    [4, "NOR"],
    [11, "PER"],
  ]),
  fullName: new Map([
    [1, "Max Verstappen"],
    [44, "Lewis Hamilton"],
    [4, "Lando Norris"],
    [11, "Sergio Perez"],
  ]),
  team: new Map([
    [1, "Red Bull"],
    [44, "Mercedes"],
    [4, "McLaren"],
    [11, "Red Bull"],
  ]),
  color: new Map([
    [1, "#1"],
    [44, "#44"],
    [4, "#4"],
    [11, "#11"],
  ]),
};

const sessions = [
  { session_type: "Race", session_name: "Race" }, // positional fallback points
  { session_type: "Race", session_name: "Race" }, // API-provided points
  { session_type: "Race", session_name: "Sprint" }, // positional fallback (sprint table)
  { session_type: "Race", session_name: "Race" }, // results not loaded
];

const results: (SessionResult[] | undefined)[] = [
  [
    res({ driver_number: 1, position: 1 }),
    res({ driver_number: 44, position: 2 }),
    res({ driver_number: 4, position: 3 }),
    res({ driver_number: 11, position: 4 }),
  ],
  [
    res({ driver_number: 44, position: 1, points: 25 }),
    res({ driver_number: 1, position: 2, points: 18 }),
    res({ driver_number: 11, position: 3, dsq: true }), // disqualified
    res({ driver_number: 4, dns: true }), // did not start
  ],
  [
    res({ driver_number: 1, position: 1 }),
    res({ driver_number: 4, position: 2 }),
  ],
  undefined, // session_result not loaded yet
];

const { driverStandings, constructorStandings } = computeStandings(
  sessions,
  results,
  info,
);
const driver = (n: number) =>
  driverStandings.find((d) => d.driverNumber === n)!;

describe("computeStandings — drivers", () => {
  it("sums positional + API + sprint points", () => {
    expect(driver(1).points).toBe(25 + 18 + 8); // R1 P1, R2 P2, Sprint P1
    expect(driver(44).points).toBe(18 + 25); // R1 P2, R2 P1
    expect(driver(4).points).toBe(15 + 7); // R1 P3, Sprint P2 (DNS in R2)
  });

  it("gives a DSQ driver no points from position", () => {
    expect(driver(11).points).toBe(12); // only R1 P4; R2 DSQ → 0
  });

  it("counts wins (P1, not DSQ)", () => {
    expect(driver(1).wins).toBe(2); // R1 + Sprint
    expect(driver(44).wins).toBe(1); // R2
    expect(driver(11).wins).toBe(0);
  });

  it("counts podiums (P1–3, not DSQ)", () => {
    expect(driver(1).podiums).toBe(3);
    expect(driver(44).podiums).toBe(2);
    expect(driver(11).podiums).toBe(0); // P4 in R1, DSQ in R2
  });

  it("ranks by points and assigns positions", () => {
    expect(driverStandings.map((d) => d.driverNumber)).toEqual([1, 44, 4, 11]);
    expect(driverStandings.map((d) => d.position)).toEqual([1, 2, 3, 4]);
  });

  it("ignores sessions whose results are not loaded", () => {
    // session 4 is undefined; totals above already exclude it
    expect(driverStandings).toHaveLength(4);
  });
});

describe("computeStandings — constructors", () => {
  it("aggregates both cars per team", () => {
    const rb = constructorStandings.find((c) => c.name === "Red Bull")!;
    expect(rb.points).toBe(driver(1).points + driver(11).points);
    expect(rb.wins).toBe(2);
  });

  it("ranks teams by points", () => {
    expect(constructorStandings.map((c) => c.name)).toEqual([
      "Red Bull",
      "Mercedes",
      "McLaren",
    ]);
  });

  it("resolves constructor aliases against known team names", () => {
    expect(
      canonicalTeamName("Visa Cash App RB", ["Racing Bulls", "Ferrari"]),
    ).toBe("Racing Bulls");
    expect(canonicalTeamName("Alfa Romeo Racing", ["Sauber", "Ferrari"])).toBe(
      "Sauber",
    );
    expect(
      canonicalTeamName("Oracle Red Bull Racing", ["Red Bull", "Ferrari"]),
    ).toBe("Red Bull");
  });
});

describe("completedPointsSessions", () => {
  const now = Date.parse("2025-06-01T00:00:00Z");
  const s = (
    key: number,
    session_type: string,
    date_start: string,
    extra: Record<string, unknown> = {},
  ) => ({
    session_key: key,
    session_type,
    session_name: session_type,
    date_start,
    date_end: date_start,
    ...extra,
  });

  it("keeps finished Race/Sprint sessions in chronological order", () => {
    const out = completedPointsSessions(
      [
        s(3, "Race", "2025-05-20T00:00:00Z"),
        s(1, "Sprint", "2025-05-01T00:00:00Z"),
        s(2, "Qualifying", "2025-05-10T00:00:00Z"),
      ],
      now,
    );
    expect(out.map((x) => x.session_key)).toEqual([1, 3]);
  });

  it("drops upcoming, in-progress and cancelled sessions", () => {
    const out = completedPointsSessions(
      [
        s(1, "Race", "2025-05-01T00:00:00Z"),
        s(2, "Race", "2025-06-10T00:00:00Z"),
        s(3, "Race", "2025-05-31T23:00:00Z", {
          date_end: "2025-06-01T01:00:00Z",
        }),
        s(4, "Race", "2025-05-15T00:00:00Z", { is_cancelled: true }),
      ],
      now,
    );
    expect(out.map((x) => x.session_key)).toEqual([1]);
  });
});

describe("tallyGrandPrixPodiums", () => {
  it("counts Grand Prix wins/podiums and ignores sprints, DSQ and DNS", () => {
    const { wins, podiums } = tallyGrandPrixPodiums(
      [
        { session_type: "Race", session_name: "Race" },
        { session_type: "Race", session_name: "Sprint" },
        { session_type: "Race", session_name: "Race" },
      ],
      [
        [res({ driver_number: 1, position: 1 }), res({ driver_number: 44, position: 2 }), res({ driver_number: 4, position: 4 })],
        [res({ driver_number: 4, position: 1 })],
        [
          res({ driver_number: 44, position: 1, dsq: true }),
          res({ driver_number: 1, position: 2 }),
          res({ driver_number: 11, position: 3 }),
        ],
      ],
    );
    expect(Object.fromEntries(wins)).toEqual({ 1: 1 });
    expect(Object.fromEntries(podiums)).toEqual({ 1: 2, 44: 1, 11: 1 });
  });

  it("tolerates results that have not loaded yet", () => {
    const { wins, podiums } = tallyGrandPrixPodiums(
      [{ session_type: "Race", session_name: "Race" }],
      [undefined],
    );
    expect(wins.size).toBe(0);
    expect(podiums.size).toBe(0);
  });
});
