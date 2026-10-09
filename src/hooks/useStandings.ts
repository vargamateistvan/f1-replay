import { useMemo } from "react";
import { useQueries, useQuery, type UseQueryResult } from "@tanstack/react-query";
import { api } from "@/api/endpoints";
import type { Driver } from "@/api/types";
import { CURRENT_SEASON_STALE_MS } from "@/utils/live";
import { FASTEST_LAP_FILTER_RATIO } from "@/constants";
import { teamColor } from "@/utils/color";
import { canonicalTeamName } from "@/utils/identity";
import {
  completedPointsSessions,
  isGrandPrixSession,
  isPointsSession,
  tallyGrandPrixPodiums,
  type ConstructorStanding,
  type DriverInfo,
  type DriverStanding,
} from "@/utils/standings";
import {
  fastestLapOf,
  headToHead,
  isMainQualifyingSession,
  poleFromQualifying,
  pointsProgression,
  remainingPoints,
  resultsGrid,
  teammatePairs,
  titleOutlook,
  type HeadToHead,
  type PointsProgression,
  type RemainingPoints,
  type ResultsGrid,
  type RoundMarkers,
} from "@/utils/championship";
import {
  useChampionshipDrivers,
  useChampionshipTeams,
  useDrivers,
} from "@/hooks/useSession";

// Re-exported for existing import sites (pages/Standings.tsx).
export type { DriverStanding, ConstructorStanding } from "@/utils/standings";

export interface TeammateComparison {
  team: string;
  color: string;
  a: DriverStanding;
  b: DriverStanding;
  qualifying: HeadToHead;
  race: HeadToHead;
}

export interface StandingsOptions {
  /** Fetch qualifying results for the teammate comparison (one request per round). */
  includeQualifying?: boolean;
  /** Fetch pole positions and fastest laps for the results grid. */
  includeResultMarkers?: boolean;
}

type FastestLap = NonNullable<ReturnType<typeof fastestLapOf>>;

// Module-level so useQueries can memoise the combined result between renders.
function combineResults<T>(queries: UseQueryResult<T>[]) {
  return {
    data: queries.map((q) => q.data),
    /** False while a query has neither data nor an error yet. */
    settled: queries.map((q) => !q.isPending),
    loaded: queries.filter((q) => q.data !== undefined).length,
    isFetching: queries.some((q) => q.isFetching),
  };
}

// Narrows the request to laps near pole pace (a fraction of the ~0.5 MB full
// lap list); the overall fastest lap is always inside that window when it is
// non-empty. Only the winning lap is cached.
async function fetchFastestLap(
  sessionKey: number,
  poleTime: number | null,
  disqualified: ReadonlySet<number>,
): Promise<FastestLap | null> {
  if (poleTime !== null) {
    const limit = Math.round(poleTime * FASTEST_LAP_FILTER_RATIO * 1000) / 1000;
    const near = await api.laps(sessionKey, undefined, {
      "lap_duration<": limit,
    });
    const best = fastestLapOf(near, disqualified);
    if (best) return best;
  }
  return fastestLapOf(await api.laps(sessionKey), disqualified);
}

function combineDrivers(queries: UseQueryResult<Driver[]>[]) {
  return {
    data: queries.flatMap((q) => q.data ?? []),
    isFetching: queries.some((q) => q.isFetching),
  };
}

function sessionResultQuery(sessionKey: number) {
  return {
    queryKey: ["sessionResult", sessionKey],
    queryFn: () => api.sessionResult(sessionKey),
    staleTime: Infinity,
  };
}

export function useStandings(
  year: number,
  preferredSessionKey: number | null = null,
  preferredMeetingKey: number | null = null,
  { includeQualifying = false, includeResultMarkers = false }: StandingsOptions = {},
) {
  const isCurrentYear = year === new Date().getFullYear();

  const sessionsQ = useQuery({
    queryKey: ["sessions-year", year],
    queryFn: () => api.sessionsByYear(year),
    staleTime: isCurrentYear ? CURRENT_SEASON_STALE_MS : Infinity,
  });

  const raceSessions = useMemo(
    () => completedPointsSessions(sessionsQ.data ?? [], Date.now()),
    [sessionsQ.data],
  );

  const latestKey = raceSessions.at(-1)?.session_key ?? null;
  const meetingKeyOverride =
    preferredMeetingKey != null
      ? raceSessions
          .filter((session) => session.meeting_key === preferredMeetingKey)
          .at(-1)?.session_key ?? null
      : null;
  // Only honour a preferred session if it belongs to the selected year —
  // otherwise a stale ?session= from another season would override the year.
  const selectedSession =
    preferredSessionKey != null
      ? (sessionsQ.data ?? []).find((s) => s.session_key === preferredSessionKey)
      : undefined;
  // Championship tables only exist for Races and Sprints, so a practice or
  // qualifying session shows the standings after the last one before it.
  const selectedKey = selectedSession
    ? isPointsSession(selectedSession)
      ? selectedSession.session_key
      : raceSessions
          .filter(
            (s) =>
              Date.parse(s.date_start) < Date.parse(selectedSession.date_start),
          )
          .at(-1)?.session_key ?? null
    : meetingKeyOverride ?? latestKey;

  const selectedStartMs = useMemo(() => {
    const session = (sessionsQ.data ?? []).find(
      (s) => s.session_key === selectedKey,
    );
    return session ? Date.parse(session.date_start) : null;
  }, [sessionsQ.data, selectedKey]);

  // Races and Sprints up to and including the selected session.
  const pointsSessions = useMemo(
    () =>
      selectedStartMs === null
        ? []
        : raceSessions.filter(
            (s) => Date.parse(s.date_start) <= selectedStartMs,
          ),
    [raceSessions, selectedStartMs],
  );

  const qualifyingSessions = useMemo(() => {
    if (!(includeQualifying || includeResultMarkers) || selectedStartMs === null)
      return [];
    const nowMs = Date.now();
    return (sessionsQ.data ?? [])
      .filter(
        (s) =>
          !s.is_cancelled &&
          isMainQualifyingSession(s) &&
          Date.parse(s.date_start) <= selectedStartMs &&
          Date.parse(s.date_end ?? s.date_start) <= nowMs,
      )
      .sort((a, b) => Date.parse(a.date_start) - Date.parse(b.date_start));
  }, [includeQualifying, includeResultMarkers, sessionsQ.data, selectedStartMs]);

  const results = useQueries({
    queries: pointsSessions.map((s) => sessionResultQuery(s.session_key)),
    combine: combineResults,
  });

  const qualifyingResults = useQueries({
    queries: qualifyingSessions.map((s) => sessionResultQuery(s.session_key)),
    combine: combineResults,
  });

  // Pole and fastest lap are marked on Grand Prix columns only.
  const markerRaceIndexes = useMemo(
    () =>
      includeResultMarkers
        ? pointsSessions.flatMap((s, i) => (isGrandPrixSession(s) ? [i] : []))
        : [],
    [includeResultMarkers, pointsSessions],
  );
  const markerRaces = useMemo(
    () => markerRaceIndexes.map((i) => pointsSessions[i]),
    [markerRaceIndexes, pointsSessions],
  );

  // Per race: undefined until its result has loaded.
  const disqualifiedPerRace = useMemo(
    () =>
      markerRaceIndexes.map((i) => {
        const result = results.data[i];
        if (!result) return results.settled[i] ? new Set<number>() : undefined;
        return new Set(result.filter((r) => r.dsq).map((r) => r.driver_number));
      }),
    [markerRaceIndexes, results],
  );

  // Per race: undefined while its qualifying is loading, null when unknown.
  const polePerRace = useMemo(() => {
    const qualifyingIndex = new Map(
      qualifyingSessions.map((s, i) => [s.meeting_key, i]),
    );
    return markerRaces.map((race) => {
      const i = qualifyingIndex.get(race.meeting_key);
      if (i === undefined) return null;
      if (!qualifyingResults.settled[i]) return undefined;
      const result = qualifyingResults.data[i];
      return result ? poleFromQualifying(result) : null;
    });
  }, [markerRaces, qualifyingSessions, qualifyingResults]);

  const fastestLaps = useQueries({
    queries: markerRaces.map((race, i) => ({
      queryKey: ["fastest-lap", race.session_key],
      queryFn: () =>
        fetchFastestLap(
          race.session_key,
          polePerRace[i]?.time ?? null,
          disqualifiedPerRace[i] ?? new Set(),
        ),
      staleTime: Infinity,
      // Wait for qualifying (to narrow the lap request by pole time) and the
      // race result (to skip disqualified drivers).
      enabled:
        polePerRace[i] !== undefined && disqualifiedPerRace[i] !== undefined,
    })),
    combine: combineResults<FastestLap | null>,
  });

  const driversQ = useDrivers(selectedKey);
  const championshipDriversQ = useChampionshipDrivers(selectedKey, isCurrentYear);
  const championshipTeamsQ = useChampionshipTeams(selectedKey, isCurrentYear);

  // Drivers in the standings who did not take part in the selected session
  // (mid-season replacements) are resolved from their most recent race.
  const fallbackDriverSessionKeys = useMemo(() => {
    if (!driversQ.data) return [];
    const known = new Set(driversQ.data.map((d) => d.driver_number));
    const keys = new Set<number>();
    for (const { driver_number } of championshipDriversQ.data ?? []) {
      if (known.has(driver_number)) continue;
      for (let i = pointsSessions.length - 1; i >= 0; i--) {
        if (results.data[i]?.some((r) => r.driver_number === driver_number)) {
          keys.add(pointsSessions[i].session_key);
          break;
        }
      }
    }
    return [...keys];
  }, [driversQ.data, championshipDriversQ.data, pointsSessions, results.data]);

  const fallbackDrivers = useQueries({
    queries: fallbackDriverSessionKeys.map((key) => ({
      queryKey: ["drivers", key],
      queryFn: () => api.drivers(key),
      staleTime: Infinity,
    })),
    combine: combineDrivers,
  });

  const driverByNumber = useMemo(() => {
    const byNumber = new Map<number, Driver>();
    // Selected-session entries are applied last so they take precedence.
    for (const d of [...fallbackDrivers.data, ...(driversQ.data ?? [])]) {
      byNumber.set(d.driver_number, d);
    }
    return byNumber;
  }, [fallbackDrivers.data, driversQ.data]);

  const knownTeamNames = useMemo(
    () => [...new Set([...driverByNumber.values()].map((d) => d.team_name))],
    [driverByNumber],
  );

  const driverInfo = useMemo<DriverInfo>(() => {
    const acronym = new Map<number, string>();
    const fullName = new Map<number, string>();
    const team = new Map<number, string>();
    const color = new Map<number, string>();
    for (const d of driverByNumber.values()) {
      acronym.set(d.driver_number, d.name_acronym);
      fullName.set(d.driver_number, d.full_name);
      team.set(d.driver_number, d.team_name);
      color.set(d.driver_number, teamColor(d.team_colour));
    }
    return { acronym, fullName, team, color };
  }, [driverByNumber]);

  const teamColorByName = useMemo(() => {
    const byCanonicalName = new Map<string, string>();
    for (const d of driverByNumber.values()) {
      byCanonicalName.set(
        canonicalTeamName(d.team_name, knownTeamNames),
        teamColor(d.team_colour),
      );
    }
    return byCanonicalName;
  }, [driverByNumber, knownTeamNames]);

  const tally = useMemo(
    () => tallyGrandPrixPodiums(pointsSessions, results.data),
    [pointsSessions, results.data],
  );

  // Team results are credited to each driver's latest team; mid-season swaps
  // are rare enough that fetching every session's driver list isn't worth it.
  const teamOf = useMemo(
    () => (driverNumber: number) => {
      const team = driverInfo.team.get(driverNumber);
      return team ? canonicalTeamName(team, knownTeamNames) : null;
    },
    [driverInfo, knownTeamNames],
  );

  const teamWins = useMemo(() => {
    const wins = new Map<string, number>();
    for (const [num, count] of tally.wins) {
      const name = teamOf(num);
      if (name) wins.set(name, (wins.get(name) ?? 0) + count);
    }
    return wins;
  }, [tally, teamOf]);

  const remaining = useMemo<RemainingPoints | null>(
    () =>
      selectedStartMs === null
        ? null
        : remainingPoints(sessionsQ.data ?? [], selectedStartMs, year),
    [sessionsQ.data, selectedStartMs, year],
  );

  const driverStandings = useMemo<DriverStanding[]>(() => {
    const rows = [...(championshipDriversQ.data ?? [])]
      .sort(
        (a, b) =>
          a.position_current - b.position_current ||
          b.points_current - a.points_current,
      )
      .map((d) => ({
        position: d.position_current,
        driverNumber: d.driver_number,
        driver: driverByNumber.get(d.driver_number),
        acronym:
          driverInfo.acronym.get(d.driver_number) ?? `#${d.driver_number}`,
        fullName:
          driverInfo.fullName.get(d.driver_number) ??
          `Driver ${d.driver_number}`,
        team: driverInfo.team.get(d.driver_number) ?? "—",
        color: driverInfo.color.get(d.driver_number) ?? "#888",
        points: d.points_current,
        wins: tally.wins.get(d.driver_number) ?? 0,
        podiums: tally.podiums.get(d.driver_number) ?? 0,
        pointsDelta: d.points_current - d.points_start,
        positionChange: d.position_start - d.position_current,
      }));
    if (!remaining) return rows;
    const outlook = titleOutlook(
      rows.map((r) => ({ key: r.driverNumber, points: r.points })),
      remaining.driver,
    );
    return rows.map((r) => ({ ...r, title: outlook.get(r.driverNumber) }));
  }, [championshipDriversQ.data, driverByNumber, driverInfo, tally, remaining]);

  const constructorStandings = useMemo<ConstructorStanding[]>(() => {
    const rows = [...(championshipTeamsQ.data ?? [])]
      .sort(
        (a, b) =>
          a.position_current - b.position_current ||
          b.points_current - a.points_current,
      )
      .map((c) => {
        const name = canonicalTeamName(c.team_name, knownTeamNames);
        return {
          position: c.position_current,
          name,
          color: teamColorByName.get(name) ?? "#888",
          points: c.points_current,
          wins: teamWins.get(name) ?? 0,
          pointsDelta: c.points_current - c.points_start,
          positionChange: c.position_start - c.position_current,
        };
      });
    if (!remaining) return rows;
    const outlook = titleOutlook(
      rows.map((r) => ({ key: r.name, points: r.points })),
      remaining.team,
    );
    return rows.map((r) => ({ ...r, title: outlook.get(r.name) }));
  }, [championshipTeamsQ.data, knownTeamNames, teamColorByName, teamWins, remaining]);

  const driverProgression = useMemo<PointsProgression<number>>(
    () => pointsProgression(pointsSessions, results.data, (num) => num),
    [pointsSessions, results.data],
  );

  const constructorProgression = useMemo<PointsProgression<string>>(
    () => pointsProgression(pointsSessions, results.data, teamOf),
    [pointsSessions, results.data, teamOf],
  );

  const grid = useMemo<ResultsGrid>(() => {
    const pole: RoundMarkers = new Map();
    const fastestLap: RoundMarkers = new Map();
    markerRaces.forEach((race, i) => {
      const poleLap = polePerRace[i];
      if (poleLap) pole.set(race.session_key, poleLap.driverNumber);
      const best = fastestLaps.data[i];
      if (best) fastestLap.set(race.session_key, best.driverNumber);
    });
    return resultsGrid(pointsSessions, results.data, { pole, fastestLap });
  }, [pointsSessions, results.data, markerRaces, polePerRace, fastestLaps.data]);

  const teammates = useMemo<TeammateComparison[]>(() => {
    const standingByNumber = new Map(
      driverStandings.map((d) => [d.driverNumber, d]),
    );
    const points = new Map(
      driverStandings.map((d) => [d.driverNumber, d.points]),
    );
    const lineup = (driversQ.data ?? []).map((d) => ({
      driver_number: d.driver_number,
      team_name: canonicalTeamName(d.team_name, knownTeamNames),
    }));
    const raceResults = results.data.filter((_, i) =>
      isGrandPrixSession(pointsSessions[i]),
    );
    const order = new Map(constructorStandings.map((c) => [c.name, c.position]));

    return teammatePairs(lineup, points)
      .flatMap((pair) => {
        const a = standingByNumber.get(pair.a);
        const b = standingByNumber.get(pair.b);
        if (!a || !b) return [];
        return [
          {
            team: pair.team,
            color: teamColorByName.get(pair.team) ?? a.color,
            a,
            b,
            qualifying: headToHead(qualifyingResults.data, pair.a, pair.b),
            race: headToHead(raceResults, pair.a, pair.b),
          },
        ];
      })
      .sort(
        (x, y) =>
          (order.get(x.team) ?? Infinity) - (order.get(y.team) ?? Infinity),
      );
  }, [
    driverStandings,
    constructorStandings,
    driversQ.data,
    knownTeamNames,
    teamColorByName,
    pointsSessions,
    results.data,
    qualifyingResults.data,
  ]);

  // Session-scoped queries are disabled (and stay "pending") when the season
  // has no completed race yet, so they only count once a session is selected.
  const hasSelection = selectedKey !== null;

  return {
    driverStandings,
    constructorStandings,
    driverProgression,
    constructorProgression,
    remaining,
    teammates,
    resultsGrid: grid,
    qualifyingLoading: qualifyingResults.loaded < qualifyingSessions.length,
    loadedRaces: results.loaded + qualifyingResults.loaded + fastestLaps.loaded,
    totalRaces:
      pointsSessions.length + qualifyingSessions.length + markerRaces.length,
    isLoading:
      sessionsQ.isPending ||
      (hasSelection &&
        (driversQ.isPending ||
          championshipDriversQ.isPending ||
          championshipTeamsQ.isPending)),
    isFetching:
      sessionsQ.isFetching ||
      driversQ.isFetching ||
      championshipDriversQ.isFetching ||
      championshipTeamsQ.isFetching ||
      results.isFetching ||
      qualifyingResults.isFetching ||
      fastestLaps.isFetching ||
      fallbackDrivers.isFetching,
    isError:
      sessionsQ.isError ||
      (hasSelection &&
        (driversQ.isError ||
          championshipDriversQ.isError ||
          championshipTeamsQ.isError)),
  };
}
