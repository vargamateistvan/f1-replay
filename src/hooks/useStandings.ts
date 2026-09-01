import { useMemo } from "react";
import { useQuery } from "@tanstack/react-query";
import { api } from "@/api/endpoints";
import { CURRENT_SEASON_STALE_MS } from "@/utils/live";
import { teamColor } from "@/utils/color";
import { canonicalTeamName } from "@/utils/identity";
import { isSprintSession } from "@/utils/session";
import { type DriverInfo } from "@/utils/standings";
import {
  useChampionshipDrivers,
  useChampionshipTeams,
} from "@/hooks/useSession";

// Re-exported for existing import sites (pages/Standings.tsx).
export type { DriverStanding, ConstructorStanding } from "@/utils/standings";

export function useStandings(
  year: number,
  preferredSessionKey: number | null = null,
  preferredMeetingKey: number | null = null,
) {
  const sessionsQ = useQuery({
    queryKey: ["sessions-year", year],
    queryFn: () => api.sessionsByYear(year),
    staleTime:
      year === new Date().getFullYear() ? CURRENT_SEASON_STALE_MS : Infinity,
  });

  const raceSessions = useMemo(
    () =>
      (sessionsQ.data ?? [])
        .filter(
          (s) =>
            s.session_type === "Race" ||
            s.session_type === "Sprint" ||
            isSprintSession(s.session_name),
        )
        .sort(
          (a, b) =>
            new Date(a.date_start).getTime() - new Date(b.date_start).getTime(),
        ),
    [sessionsQ.data],
  );

  const latestKey = raceSessions[raceSessions.length - 1]?.session_key ?? null;
  const meetingKeyOverride =
    preferredMeetingKey != null
      ? raceSessions
          .filter((session) => session.meeting_key === preferredMeetingKey)
          .at(-1)?.session_key ?? null
      : null;
  const selectedKey =
    preferredSessionKey ?? meetingKeyOverride ?? latestKey;

  const driversQ = useQuery({
    queryKey: ["drivers", selectedKey],
    queryFn: () => api.drivers(selectedKey!),
    enabled: selectedKey !== null,
    staleTime: Infinity,
  });

  const invalidateCurrentYear = year === new Date().getFullYear();
  const championshipDriversQ = useChampionshipDrivers(
    selectedKey,
    invalidateCurrentYear,
  );
  const championshipTeamsQ = useChampionshipTeams(
    selectedKey,
    invalidateCurrentYear,
  );

  const loadedRaces = selectedKey !== null && championshipDriversQ.data ? 1 : 0;
  const totalRaces = selectedKey !== null ? 1 : 0;

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

  const teamColorByName = useMemo(() => {
    const knownTeamNames = (driversQ.data ?? []).map((driver) => driver.team_name);
    const byCanonicalName = new Map<string, string>();

    for (const d of driversQ.data ?? []) {
      byCanonicalName.set(
        canonicalTeamName(d.team_name, knownTeamNames),
        teamColor(d.team_colour),
      );
    }

    return byCanonicalName;
  }, [driversQ.data]);

  const driverStandings = useMemo(() => {
    const apiStandings = championshipDriversQ.data ?? [];
    if (apiStandings.length === 0) return [];

    return [...apiStandings]
      .sort(
        (a, b) =>
          a.position_current - b.position_current ||
          b.points_current - a.points_current,
      )
      .map((d) => ({
        position: d.position_current,
        driverNumber: d.driver_number,
        driver:
          (driversQ.data ?? []).find(
            (driver) => driver.driver_number === d.driver_number,
          ) ?? undefined,
        acronym: driverInfo.acronym.get(d.driver_number) ?? `#${d.driver_number}`,
        fullName:
          driverInfo.fullName.get(d.driver_number) ?? `Driver ${d.driver_number}`,
        team: driverInfo.team.get(d.driver_number) ?? "—",
        color: driverInfo.color.get(d.driver_number) ?? "#888",
        points: d.points_current,
        wins: 0,
        podiums: 0,
        pointsDelta: d.points_current - d.points_start,
        positionChange: d.position_start - d.position_current,
      }));
  }, [championshipDriversQ.data, driverInfo, driversQ.data]);

  const constructorStandings = useMemo(() => {
    const apiStandings = championshipTeamsQ.data ?? [];
    if (apiStandings.length === 0) return [];

    return [...apiStandings]
      .sort(
        (a, b) =>
          a.position_current - b.position_current ||
          b.points_current - a.points_current,
      )
      .map((c) => {
        const canonicalName = canonicalTeamName(c.team_name, [
          ...(driversQ.data ?? []).map((driver) => driver.team_name),
        ]);

        return {
          position: c.position_current,
          name: c.team_name,
          color: teamColorByName.get(canonicalName) ?? "#888",
          points: c.points_current,
          wins: 0,
          pointsDelta: c.points_current - c.points_start,
          positionChange: c.position_start - c.position_current,
        };
      });
  }, [championshipTeamsQ.data, driversQ.data, teamColorByName]);

  return {
    driverStandings,
    constructorStandings,
    loadedRaces,
    totalRaces,
    isLoading:
      sessionsQ.isPending ||
      driversQ.isPending ||
      championshipDriversQ.isPending ||
      championshipTeamsQ.isPending,
    isFetching:
      sessionsQ.isFetching ||
      driversQ.isFetching ||
      championshipDriversQ.isFetching ||
      championshipTeamsQ.isFetching,
    isError:
      sessionsQ.isError ||
      driversQ.isError ||
      championshipDriversQ.isError ||
      championshipTeamsQ.isError,
  };
}
