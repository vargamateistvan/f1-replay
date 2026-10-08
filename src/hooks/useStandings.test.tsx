import { describe, expect, it, vi, beforeEach } from "vitest";
import { renderHook } from "@testing-library/react";
import { useStandings } from "./useStandings";

const mockUseQuery = vi.fn();

type QueryOptions = { queryKey: unknown[]; enabled?: boolean };

vi.mock("@tanstack/react-query", () => ({
  useQuery: (options: unknown) => mockUseQuery(options),
  useQueries: ({
    queries,
    combine,
  }: {
    queries: QueryOptions[];
    combine: (results: unknown[]) => unknown;
  }) => combine(queries.map((q) => mockUseQuery(q))),
}));

const sessions2023 = [
  {
    session_key: 9000,
    meeting_key: 1100,
    session_type: "Race",
    session_name: "Race",
    date_start: "2023-03-05T15:00:00Z",
    date_end: "2023-03-05T17:00:00Z",
  },
  {
    session_key: 9001,
    meeting_key: 1101,
    session_type: "Race",
    session_name: "Race",
    date_start: "2023-11-26T13:00:00Z",
    date_end: "2023-11-26T15:00:00Z",
  },
];

const result = (driver_number: number, position: number | null) => ({
  driver_number,
  position,
  dns: false,
  dsq: false,
  dnf: false,
  points: null,
});

const driver = (driver_number: number, name_acronym: string, team_name: string) => ({
  driver_number,
  name_acronym,
  full_name: name_acronym,
  team_name,
  team_colour: "3671C6",
});

const champ = (driver_number: number, position: number, points: number) => ({
  driver_number,
  position_current: position,
  position_start: position,
  points_current: points,
  points_start: points,
});

type Data = Record<string, unknown>;

function mockData(data: Data) {
  mockUseQuery.mockImplementation((options: QueryOptions) => {
    const key = options.queryKey.join(":");
    if (options.enabled === false) {
      return { data: undefined, isPending: true, isFetching: false, isError: false };
    }
    return {
      data: data[key],
      isPending: data[key] === undefined,
      isFetching: false,
      isError: false,
    };
  });
}

function queryKeysFor(name: string): unknown[][] {
  return mockUseQuery.mock.calls
    .map(([opts]) => (opts as QueryOptions).queryKey)
    .filter((key) => key[0] === name);
}

function championshipKey(): unknown {
  return queryKeysFor("championshipDrivers")[0]?.[1];
}

describe("useStandings", () => {
  beforeEach(() => {
    mockUseQuery.mockReset();
    mockData({ "sessions-year:2023": sessions2023 });
  });

  it("uses the latest race of the year when no session is preferred", () => {
    renderHook(() => useStandings(2023));
    expect(championshipKey()).toBe(9001);
  });

  it("honours a preferred session that belongs to the selected year", () => {
    renderHook(() => useStandings(2023, 9000));
    expect(championshipKey()).toBe(9000);
  });

  it("ignores a preferred session from another year", () => {
    renderHook(() => useStandings(2023, 9999));
    expect(championshipKey()).toBe(9001);
  });

  it("ignores a preferred meeting from another year", () => {
    renderHook(() => useStandings(2023, null, 4242));
    expect(championshipKey()).toBe(9001);
  });

  it("skips races that have not finished yet", () => {
    const future = new Date(Date.now() + 7 * 86_400_000).toISOString();
    mockData({
      "sessions-year:2023": [
        ...sessions2023,
        {
          session_key: 9002,
          meeting_key: 1102,
          session_type: "Race",
          session_name: "Race",
          date_start: future,
          date_end: future,
        },
      ],
    });
    renderHook(() => useStandings(2023));
    expect(championshipKey()).toBe(9001);
  });

  it("is not stuck loading when the season has no completed race", () => {
    const future = new Date(Date.now() + 7 * 86_400_000).toISOString();
    mockData({
      "sessions-year:2023": [
        { ...sessions2023[0], date_start: future, date_end: future },
      ],
    });
    const { result: hook } = renderHook(() => useStandings(2023));
    expect(championshipKey()).toBeNull();
    expect(hook.current.isLoading).toBe(false);
    expect(hook.current.driverStandings).toEqual([]);
  });

  it("only loads results for Grands Prix up to the selected session", () => {
    renderHook(() => useStandings(2023, 9000));
    expect(queryKeysFor("sessionResult")).toEqual([["sessionResult", 9000]]);
  });

  it("counts Grand Prix wins and podiums for drivers and constructors", () => {
    mockData({
      "sessions-year:2023": sessions2023,
      "sessionResult:9000": [result(1, 1), result(11, 2), result(44, 3)],
      "sessionResult:9001": [result(11, 1), result(1, 2), result(4, 4)],
      "drivers:9001": [
        driver(1, "VER", "Red Bull Racing"),
        driver(11, "PER", "Red Bull Racing"),
        driver(44, "HAM", "Mercedes"),
        driver(4, "NOR", "McLaren"),
      ],
      "championshipDrivers:9001": [
        champ(1, 1, 43),
        champ(11, 2, 43),
        champ(44, 3, 15),
        champ(4, 4, 12),
      ],
      "championshipTeams:9001": [
        { team_name: "Red Bull Racing", position_current: 1, position_start: 1, points_current: 86, points_start: 86 },
        { team_name: "Mercedes", position_current: 2, position_start: 2, points_current: 15, points_start: 15 },
      ],
    });

    const { result: hook } = renderHook(() => useStandings(2023));
    const byAcronym = Object.fromEntries(
      hook.current.driverStandings.map((d) => [d.acronym, d]),
    );
    expect(byAcronym.VER).toMatchObject({ wins: 1, podiums: 2 });
    expect(byAcronym.PER).toMatchObject({ wins: 1, podiums: 2 });
    expect(byAcronym.HAM).toMatchObject({ wins: 0, podiums: 1 });
    expect(byAcronym.NOR).toMatchObject({ wins: 0, podiums: 0 });
    expect(hook.current.constructorStandings).toMatchObject([
      { name: "Red Bull Racing", wins: 2, color: "#3671C6" },
      { name: "Mercedes", wins: 0 },
    ]);
    expect(hook.current.loadedRaces).toBe(2);
    expect(hook.current.totalRaces).toBe(2);
  });

  it("resolves drivers missing from the selected session via their last race", () => {
    mockData({
      "sessions-year:2023": sessions2023,
      "sessionResult:9000": [result(1, 1), result(3, 5)],
      "sessionResult:9001": [result(1, 1), result(40, 12)],
      "drivers:9001": [driver(1, "VER", "Red Bull Racing"), driver(40, "LAW", "AlphaTauri")],
      "drivers:9000": [driver(1, "VER", "Red Bull Racing"), driver(3, "RIC", "AlphaTauri")],
      "championshipDrivers:9001": [champ(1, 1, 50), champ(3, 2, 6)],
      "championshipTeams:9001": [],
    });

    const { result: hook } = renderHook(() => useStandings(2023));
    expect(queryKeysFor("drivers")).toContainEqual(["drivers", 9000]);
    expect(hook.current.driverStandings[1]).toMatchObject({
      acronym: "RIC",
      team: "AlphaTauri",
    });
  });
});
