import { useMemo } from "react";
import { useQueries, useQuery, type UseQueryResult } from "@tanstack/react-query";
import { api } from "@/api/endpoints";
import type { Driver, SessionResult } from "@/api/types";
import { CURRENT_SEASON_STALE_MS } from "@/utils/live";
import { teamColor } from "@/utils/color";
import { canonicalTeamName } from "@/utils/identity";
import {
  completedPointsSessions,
  isGrandPrixSession,
  tallyGrandPrixPodiums,
  type ConstructorStanding,
  type DriverInfo,
  type DriverStanding,
} from "@/utils/standings";
import {
  useChampionshipDrivers,
  useChampionshipTeams,
  useDrivers,
} from "@/hooks/useSession";

// Re-exported for existing import sites (pages/Standings.tsx).
export type { DriverStanding, ConstructorStanding } from "@/utils/standings";

// Module-level so useQueries can memoise the combined result between renders.
function combineResults(queries: UseQueryResult<SessionResult[]>[]) {
  return {
    data: queries.map((q) => q.data),
    loaded: queries.filter((q) => q.data !== undefined).length,
    isFetching: queries.some((q) => q.isFetching),
  };
}

function combineDrivers(queries: UseQueryResult<Driver[]>[]) {
  return {
    data: queries.flatMap((q) => q.data ?? []),
    isFetching: queries.some((q) => q.isFetching),
  };
}

export function useStandings(
  year: number,
  preferredSessionKey: number | null = null,
  preferredMeetingKey: number | null = null,
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
  const selectedKey =
    selectedSession?.session_key ?? meetingKeyOverride ?? latestKey;

  const selectedStartMs = useMemo(() => {
    const session = (sessionsQ.data ?? []).find(
      (s) => s.session_key === selectedKey,
    );
    return session ? Date.parse(session.date_start) : null;
  }, [sessionsQ.data, selectedKey]);

  // Grands Prix up to and including the selected session feed wins/podiums.
  const tallySessions = useMemo(
    () =>
      selectedStartMs === null
        ? []
        : raceSessions.filter(
            (s) =>
              isGrandPrixSession(s) &&
              Date.parse(s.date_start) <= selectedStartMs,
          ),
    [raceSessions, selectedStartMs],
  );

  const results = useQueries({
    queries: tallySessions.map((s) => ({
      queryKey: ["sessionResult", s.session_key],
      queryFn: () => api.sessionResult(s.session_key),
      staleTime: Infinity,
    })),
    combine: combineResults,
  });

  const driversQ = useDrivers(selectedKey);
  const championshipDriversQ = useChampionshipDrivers(selectedKey, isCurrentYear);
  const championshipTeamsQ = useChampionshipTeams(selectedKey, isCurrentYear);

  // Drivers in the standings who did not take part in the selected session
  // (mid-season replacements) are resolved from their most recent Grand Prix.
  const fallbackDriverSessionKeys = useMemo(() => {
    if (!driversQ.data) return [];
    const known = new Set(driversQ.data.map((d) => d.driver_number));
    const keys = new Set<number>();
    for (const { driver_number } of championshipDriversQ.data ?? []) {
      if (known.has(driver_number)) continue;
      for (let i = tallySessions.length - 1; i >= 0; i--) {
        if (results.data[i]?.some((r) => r.driver_number === driver_number)) {
          keys.add(tallySessions[i].session_key);
          break;
        }
      }
    }
    return [...keys];
  }, [driversQ.data, championshipDriversQ.data, tallySessions, results.data]);

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
    () => tallyGrandPrixPodiums(tallySessions, results.data),
    [tallySessions, results.data],
  );

  // Wins are credited to the driver's latest team; mid-season swaps are rare
  // enough that fetching every session's driver list is not worth the requests.
  const teamWins = useMemo(() => {
    const wins = new Map<string, number>();
    for (const [num, count] of tally.wins) {
      const team = driverInfo.team.get(num);
      if (!team) continue;
      const name = canonicalTeamName(team, knownTeamNames);
      wins.set(name, (wins.get(name) ?? 0) + count);
    }
    return wins;
  }, [tally, driverInfo, knownTeamNames]);

  const driverStandings = useMemo<DriverStanding[]>(
    () =>
      [...(championshipDriversQ.data ?? [])]
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
        })),
    [championshipDriversQ.data, driverByNumber, driverInfo, tally],
  );

  const constructorStandings = useMemo<ConstructorStanding[]>(
    () =>
      [...(championshipTeamsQ.data ?? [])]
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
        }),
    [championshipTeamsQ.data, knownTeamNames, teamColorByName, teamWins],
  );

  // Session-scoped queries are disabled (and stay "pending") when the season
  // has no completed race yet, so they only count once a session is selected.
  const hasSelection = selectedKey !== null;

  return {
    driverStandings,
    constructorStandings,
    loadedRaces: results.loaded,
    totalRaces: tallySessions.length,
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
      fallbackDrivers.isFetching,
    isError:
      sessionsQ.isError ||
      (hasSelection &&
        (driversQ.isError ||
          championshipDriversQ.isError ||
          championshipTeamsQ.isError)),
  };
}
