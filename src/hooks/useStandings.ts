import { useMemo } from "react";
import { useQuery, useQueries } from "@tanstack/react-query";
import { api } from "@/api/endpoints";
import { teamColor } from "@/utils/color";
import { canonicalTeamName } from "@/utils/identity";
import { computeStandings, type DriverInfo } from "@/utils/standings";
import {
  useChampionshipDrivers,
  useChampionshipTeams,
} from "@/hooks/useSession";

const SESSION_RESULT_FILTERS = { "position>=": 1 } as const;

// Re-exported for existing import sites (pages/Standings.tsx).
export type { DriverStanding, ConstructorStanding } from "@/utils/standings";

export function useStandings(year: number) {
  // All sessions for the year
  const sessionsQ = useQuery({
    queryKey: ["sessions-year", year],
    queryFn: () => api.sessionsByYear(year),
    staleTime: Infinity,
  });

  // Only Race and Sprint sessions, in chronological order
  const raceSessions = useMemo(
    () =>
      (sessionsQ.data ?? [])
        .filter((s) => s.session_type === "Race" || s.session_type === "Sprint")
        .sort(
          (a, b) =>
            new Date(a.date_start).getTime() - new Date(b.date_start).getTime(),
        ),
    [sessionsQ.data],
  );

  // Driver/team info from the most recent race session
  const latestKey = raceSessions[raceSessions.length - 1]?.session_key ?? null;
  const driversQ = useQuery({
    queryKey: ["drivers", latestKey],
    queryFn: () => api.drivers(latestKey!),
    enabled: latestKey !== null,
    staleTime: Infinity,
  });

  const championshipDriversQ = useChampionshipDrivers(latestKey);
  const championshipTeamsQ = useChampionshipTeams(latestKey);

  // Authoritative classification for every race session (batched, rate-limited by
  // our client queue). session_result gives finishing position, points, and
  // DNF/DNS/DSQ flags directly — far more accurate than scraping the last position.
  const resultQueries = useQueries({
    queries: raceSessions.map((s) => ({
      queryKey: ["sessionResult", s.session_key, SESSION_RESULT_FILTERS],
      queryFn: () => api.sessionResult(s.session_key, SESSION_RESULT_FILTERS),
      staleTime: Infinity,
    })),
  });

  const loadedRaces = resultQueries.filter((q) => q.data !== undefined).length;
  const totalRaces = raceSessions.length;

  // Build lookup maps from driver data
  const driverInfo = useMemo<DriverInfo>(() => {
    const acronym = new Map<number, string>();
    const fullName = new Map<number, string>();
    const team = new Map<number, string>();
    const color = new Map<number, string>();
    for (const d of driversQ.data ?? []) {
      acronym.set(d.driver_number, d.name_acronym);
      fullName.set(d.driver_number, d.full_name);
      team.set(d.driver_number, d.team_name);
      color.set(d.driver_number, teamColor(d.team_colour));
    }
    return { acronym, fullName, team, color };
  }, [driversQ.data]);

  // Memoize resultData with fixed-size deps — loadedRaces increments each time a
  // result arrives, so the array only rebuilds when something actually changes.
  const resultData = useMemo(
    () => resultQueries.map((q) => q.data),
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [loadedRaces, totalRaces],
  );
  const {
    driverStandings: fallbackDriverStandings,
    constructorStandings: fallbackConstructorStandings,
  } = useMemo(
    () => computeStandings(raceSessions, resultData, driverInfo),
    [raceSessions, driverInfo, resultData],
  );

  const fallbackDriverByNumber = useMemo(
    () => new Map(fallbackDriverStandings.map((d) => [d.driverNumber, d])),
    [fallbackDriverStandings],
  );
  const fallbackConstructorByTeam = useMemo(() => {
    const teamNames = fallbackConstructorStandings.map((c) => c.name);
    return new Map(
      fallbackConstructorStandings.map((constructorStanding) => [
        canonicalTeamName(constructorStanding.name, teamNames),
        constructorStanding,
      ]),
    );
  }, [fallbackConstructorStandings]);
  const teamColorByName = useMemo(() => {
    const knownTeamNames = [
      ...(driversQ.data ?? []).map((driver) => driver.team_name),
      ...fallbackConstructorStandings.map(
        (constructorStanding) => constructorStanding.name,
      ),
    ];
    const byCanonicalName = new Map<string, string>();

    for (const d of driversQ.data ?? []) {
      const color = teamColor(d.team_colour);
      byCanonicalName.set(
        canonicalTeamName(d.team_name, knownTeamNames),
        color,
      );
    }

    for (const c of fallbackConstructorStandings) {
      byCanonicalName.set(canonicalTeamName(c.name, knownTeamNames), c.color);
    }

    return byCanonicalName;
  }, [driversQ.data, fallbackConstructorStandings]);

  const driverStandings = useMemo(() => {
    const apiStandings = championshipDriversQ.data ?? [];
    if (apiStandings.length === 0) return fallbackDriverStandings;

    return [...apiStandings]
      .sort(
        (a, b) =>
          a.position_current - b.position_current ||
          b.points_current - a.points_current,
      )
      .map((d) => {
        const fallback = fallbackDriverByNumber.get(d.driver_number);
        return {
          position: d.position_current,
          driverNumber: d.driver_number,
          acronym:
            driverInfo.acronym.get(d.driver_number) ?? `#${d.driver_number}`,
          fullName:
            driverInfo.fullName.get(d.driver_number) ??
            `Driver ${d.driver_number}`,
          team: driverInfo.team.get(d.driver_number) ?? "—",
          color: driverInfo.color.get(d.driver_number) ?? "#888",
          points: d.points_current,
          wins: fallback?.wins ?? 0,
          podiums: fallback?.podiums ?? 0,
          pointsDelta: d.points_current - d.points_start,
          positionChange: d.position_start - d.position_current,
        };
      });
  }, [
    championshipDriversQ.data,
    fallbackDriverByNumber,
    fallbackDriverStandings,
    driverInfo,
  ]);

  const constructorStandings = useMemo(() => {
    const apiStandings = championshipTeamsQ.data ?? [];
    if (apiStandings.length === 0) return fallbackConstructorStandings;

    return [...apiStandings]
      .sort(
        (a, b) =>
          a.position_current - b.position_current ||
          b.points_current - a.points_current,
      )
      .map((c) => {
        const canonicalName = canonicalTeamName(
          c.team_name,
          fallbackConstructorStandings.map((team) => team.name),
        );
        const mappedColor = teamColorByName.get(canonicalName);
        const fallback = fallbackConstructorByTeam.get(canonicalName);
        return {
          position: c.position_current,
          name: c.team_name,
          color: mappedColor ?? fallback?.color ?? "#888",
          points: c.points_current,
          wins: fallback?.wins ?? 0,
          pointsDelta: c.points_current - c.points_start,
          positionChange: c.position_start - c.position_current,
        };
      });
  }, [
    championshipTeamsQ.data,
    fallbackConstructorByTeam,
    fallbackConstructorStandings,
    teamColorByName,
  ]);

  return {
    driverStandings,
    constructorStandings,
    loadedRaces,
    totalRaces,
    isLoading: sessionsQ.isPending,
    isFetching:
      resultQueries.some((q) => q.isFetching) ||
      championshipDriversQ.isFetching ||
      championshipTeamsQ.isFetching,
    isError:
      sessionsQ.isError ||
      resultQueries.some((q) => q.isError) ||
      championshipDriversQ.isError ||
      championshipTeamsQ.isError,
  };
}
