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

  it("uses the last race before a preferred non-points session", () => {
    const sprintQualifying = {
      session_key: 9050,
      meeting_key: 1101,
      session_type: "Qualifying",
      session_name: "Sprint Qualifying",
      date_start: "2023-11-24T13:00:00Z",
      date_end: "2023-11-24T14:00:00Z",
    };
    mockData({ "sessions-year:2023": [...sessions2023, sprintQualifying] });
    renderHook(() => useStandings(2023, 9050));
    expect(championshipKey()).toBe(9000);
    expect(queryKeysFor("championshipDrivers")).not.toContainEqual([
      "championshipDrivers",
      9050,
    ]);
  });

  it("has no standings for a session before the season's first race", () => {
    mockData({
      "sessions-year:2023": [
        ...sessions2023,
        {
          session_key: 8990,
          meeting_key: 1100,
          session_type: "Practice",
          session_name: "Practice 1",
          date_start: "2023-03-03T11:30:00Z",
          date_end: "2023-03-03T12:30:00Z",
        },
      ],
    });
    const { result: hook } = renderHook(() => useStandings(2023, 8990));
    expect(championshipKey()).toBeNull();
    expect(hook.current.isLoading).toBe(false);
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

  describe("season insights", () => {
    const sessions = [
      { ...sessions2023[0], circuit_short_name: "Sakhir" },
      {
        session_key: 8999,
        meeting_key: 1100,
        session_type: "Qualifying",
        session_name: "Qualifying",
        date_start: "2023-03-04T15:00:00Z",
        date_end: "2023-03-04T16:00:00Z",
      },
      {
        session_key: 9100,
        meeting_key: 1101,
        session_type: "Race",
        session_name: "Sprint",
        date_start: "2023-03-11T15:00:00Z",
        date_end: "2023-03-11T16:00:00Z",
        circuit_short_name: "Jeddah",
      },
      { ...sessions2023[1], circuit_short_name: "Yas Marina" },
    ];

    const data = {
      "sessions-year:2023": sessions,
      "sessionResult:9000": [result(1, 1), result(11, 2), result(44, 3)],
      "sessionResult:9100": [result(11, 1), result(1, 2)],
      "sessionResult:9001": [result(11, 1), result(1, 2), result(44, 3)],
      "sessionResult:8999": [result(11, 1), result(1, 2), result(44, 3), result(63, 4)],
      "drivers:9001": [
        driver(1, "VER", "Red Bull Racing"),
        driver(11, "PER", "Red Bull Racing"),
        driver(44, "HAM", "Mercedes"),
        driver(63, "RUS", "Mercedes"),
      ],
      "championshipDrivers:9001": [
        champ(1, 1, 50),
        champ(11, 2, 51),
        champ(44, 3, 30),
        champ(63, 4, 0),
      ],
      "championshipTeams:9001": [
        { team_name: "Red Bull Racing", position_current: 1, position_start: 1, points_current: 101, points_start: 101 },
        { team_name: "Mercedes", position_current: 2, position_start: 2, points_current: 30, points_start: 30 },
      ],
    };

    it("builds cumulative race + sprint progression for drivers and teams", () => {
      mockData(data);
      const { result: hook } = renderHook(() => useStandings(2023));
      const { rounds, totals } = hook.current.driverProgression;
      expect(rounds.map((r) => r.label)).toEqual(["Sakhir", "Jeddah (S)", "Yas Marina"]);
      expect(totals.get(1)).toEqual([25, 32, 50]);
      expect(totals.get(11)).toEqual([18, 26, 51]);
      expect(hook.current.constructorProgression.totals.get("Red Bull Racing")).toEqual([43, 58, 101]);
      expect(hook.current.resultsGrid.rounds.map((r) => r.isSprint)).toEqual([false, true, false]);
      expect(hook.current.resultsGrid.cells.get(44)).toEqual([
        { position: 3, points: 15, status: "finished" },
        null,
        { position: 3, points: 15, status: "finished" },
      ]);
    });

    it("marks the champion once the season is over", () => {
      mockData(data);
      const { result: hook } = renderHook(() => useStandings(2023));
      expect(hook.current.remaining).toMatchObject({ races: 0, sprints: 0 });
      expect(hook.current.driverStandings[0].title?.status).toBe("champion");
      expect(hook.current.driverStandings[1].title?.status).toBe("eliminated");
    });

    it("reports title contenders mid-season", () => {
      mockData({
        ...data,
        "championshipDrivers:9000": [champ(1, 1, 25), champ(11, 2, 18), champ(44, 3, 15)],
        "championshipTeams:9000": [],
        "drivers:9000": data["drivers:9001"],
      });
      const { result: hook } = renderHook(() => useStandings(2023, 9000));
      expect(hook.current.remaining).toEqual({ races: 1, sprints: 1, driver: 34, team: 59 });
      expect(hook.current.driverStandings.map((d) => d.title?.status)).toEqual([
        "leader",
        "contender",
        "contender",
      ]);
    });

    it("only fetches qualifying results when teammates are requested", () => {
      mockData(data);
      renderHook(() => useStandings(2023));
      expect(queryKeysFor("sessionResult")).not.toContainEqual(["sessionResult", 8999]);

      mockUseQuery.mockClear();
      const { result: hook } = renderHook(() =>
        useStandings(2023, null, null, { includeQualifying: true }),
      );
      expect(queryKeysFor("sessionResult")).toContainEqual(["sessionResult", 8999]);
      expect(hook.current.teammates).toMatchObject([
        {
          team: "Red Bull Racing",
          a: { acronym: "PER" },
          b: { acronym: "VER" },
          qualifying: { a: 1, b: 0 },
          race: { a: 1, b: 1 },
        },
        {
          team: "Mercedes",
          a: { acronym: "HAM" },
          b: { acronym: "RUS" },
          qualifying: { a: 1, b: 0 },
          race: { a: 2, b: 0 },
        },
      ]);
    });

    it("marks pole and fastest lap on Grand Prix columns when requested", () => {
      mockData(data);
      renderHook(() => useStandings(2023));
      expect(queryKeysFor("fastest-lap")).toEqual([]);

      mockUseQuery.mockClear();
      mockData({
        ...data,
        "fastest-lap:9000": { driverNumber: 44, lapNumber: 51, time: 93.1 },
        "fastest-lap:9001": { driverNumber: 1, lapNumber: 40, time: 86.7 },
      });
      const { result: hook } = renderHook(() =>
        useStandings(2023, null, null, { includeResultMarkers: true }),
      );
      // Sprints (9100) get no markers; 9001 has no qualifying but still loads.
      expect(queryKeysFor("fastest-lap")).toEqual([
        ["fastest-lap", 9000],
        ["fastest-lap", 9001],
      ]);
      const cells = hook.current.resultsGrid.cells;
      expect(cells.get(11)?.[0]).toMatchObject({ pole: true });
      expect(cells.get(44)?.[0]).toMatchObject({ fastestLap: true });
      expect(cells.get(1)?.[2]).toMatchObject({ fastestLap: true });
      expect(cells.get(1)?.[0]).not.toHaveProperty("pole");
    });
  });
});
