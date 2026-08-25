import { useQuery } from "@tanstack/react-query";
import { api, type QueryFilters } from "@/api/endpoints";
import { LIVE_POLL_FAST_MS, LIVE_POLL_SLOW_MS } from "@/utils/live";
import { lapsQueryKey } from "./queryKeys";

export function useMeetings(
  year: number,
  options?: {
    enabled?: boolean;
  },
) {
  return useQuery({
    queryKey: ["meetings", year],
    queryFn: () => api.meetings(year),
    enabled: (options?.enabled ?? true) && Number.isFinite(year),
    staleTime: Infinity,
  });
}

export function useSessions(meetingKey: number | null) {
  return useQuery({
    queryKey: ["sessions", meetingKey],
    queryFn: () => api.sessions(meetingKey!),
    enabled: meetingKey !== null,
    staleTime: Infinity,
  });
}

export function useDrivers(sessionKey: number | null) {
  return useQuery({
    queryKey: ["drivers", sessionKey],
    queryFn: () => api.drivers(sessionKey!),
    enabled: sessionKey !== null,
    staleTime: Infinity,
  });
}

export function usePositions(sessionKey: number | null, isLive = false) {
  return useQuery({
    queryKey: ["positions", sessionKey],
    queryFn: () => api.positions(sessionKey!),
    enabled: sessionKey !== null,
    staleTime: isLive ? 0 : Infinity,
    refetchInterval: isLive ? LIVE_POLL_FAST_MS : false,
  });
}

export function useIntervals(sessionKey: number | null, isLive = false) {
  return useQuery({
    queryKey: ["intervals", sessionKey],
    queryFn: () => api.intervals(sessionKey!),
    enabled: sessionKey !== null,
    staleTime: isLive ? 0 : Infinity,
    refetchInterval: isLive ? LIVE_POLL_FAST_MS : false,
  });
}

export function useLaps(
  sessionKey: number | null,
  driverNumber?: number,
  isLive = false,
  filters?: QueryFilters,
) {
  return useQuery({
    queryKey: lapsQueryKey(sessionKey, driverNumber, filters),
    queryFn: () => api.laps(sessionKey!, driverNumber, filters),
    enabled: sessionKey !== null,
    staleTime: isLive ? 0 : Infinity,
    // Laps update less frequently than position/interval timing rows.
    refetchInterval: isLive ? LIVE_POLL_SLOW_MS : false,
  });
}

export function useStints(sessionKey: number | null) {
  return useQuery({
    queryKey: ["stints", sessionKey],
    queryFn: () => api.stints(sessionKey!),
    enabled: sessionKey !== null,
    staleTime: Infinity,
  });
}

export function useStartingGrid(
  sessionKey: number | null,
  meetingKey: number | null = null,
) {
  return useQuery({
    queryKey: ["startingGrid", sessionKey, meetingKey],
    queryFn: async () => {
      if (sessionKey === null) return [];

      const directRows = await api.startingGrid(sessionKey, meetingKey ?? undefined);
      if (directRows.length > 0 || meetingKey === null) return directRows;

      const meetingSessions = await api.sessions(meetingKey);
      const raceSession = meetingSessions.find((session) => session.session_key === sessionKey);
      if (!raceSession) return directRows;

      const qualifyingSession = [...meetingSessions]
        .filter(
          (session) =>
            session.meeting_key === meetingKey &&
            /qualifying|sprint qualifying/i.test(session.session_name),
        )
        .filter(
          (session) =>
            new Date(session.date_start).getTime() <=
            new Date(raceSession.date_start).getTime(),
        )
        .sort(
          (a, b) =>
            new Date(b.date_start).getTime() - new Date(a.date_start).getTime(),
        )[0];

      if (!qualifyingSession) return directRows;
      return api.startingGrid(qualifyingSession.session_key, meetingKey);
    },
    enabled: sessionKey !== null,
    staleTime: Infinity,
  });
}

export function usePits(sessionKey: number | null) {
  return useQuery({
    queryKey: ["pits", sessionKey],
    queryFn: () => api.pits(sessionKey!),
    enabled: sessionKey !== null,
    staleTime: Infinity,
  });
}

export function useRaceControl(sessionKey: number | null, isLive = false) {
  return useQuery({
    queryKey: ["raceControl", sessionKey],
    queryFn: () => api.raceControl(sessionKey!),
    enabled: sessionKey !== null,
    staleTime: isLive ? 0 : Infinity,
    refetchInterval: isLive ? LIVE_POLL_SLOW_MS : false,
  });
}

export function useTeamRadio(sessionKey: number | null, isLive = false) {
  return useQuery({
    queryKey: ["teamRadio", sessionKey],
    queryFn: () => api.teamRadio(sessionKey!),
    enabled: sessionKey !== null,
    staleTime: isLive ? 0 : Infinity,
    refetchInterval: isLive ? LIVE_POLL_SLOW_MS : false,
  });
}

export function useWeather(sessionKey: number | null, isLive = false) {
  return useQuery({
    queryKey: ["weather", sessionKey],
    queryFn: () => api.weather(sessionKey!),
    enabled: sessionKey !== null,
    staleTime: isLive ? 0 : Infinity,
    refetchInterval: isLive ? LIVE_POLL_SLOW_MS : false,
  });
}

export function useSessionResult(sessionKey: number | null) {
  return useQuery({
    queryKey: ["sessionResult", sessionKey],
    queryFn: () => api.sessionResult(sessionKey!),
    enabled: sessionKey !== null,
    staleTime: Infinity,
  });
}

export function useOvertakes(sessionKey: number | null, isLive = false) {
  return useQuery({
    queryKey: ["overtakes", sessionKey],
    queryFn: () => api.overtakes(sessionKey!),
    enabled: sessionKey !== null,
    staleTime: isLive ? 0 : Infinity,
    refetchInterval: isLive ? LIVE_POLL_SLOW_MS : false,
  });
}

export function useChampionshipDrivers(sessionKey: number | null) {
  return useQuery({
    queryKey: ["championshipDrivers", sessionKey],
    queryFn: () => api.championshipDrivers(sessionKey!),
    enabled: sessionKey !== null,
    staleTime: Infinity,
  });
}

export function useChampionshipTeams(sessionKey: number | null) {
  return useQuery({
    queryKey: ["championshipTeams", sessionKey],
    queryFn: () => api.championshipTeams(sessionKey!),
    enabled: sessionKey !== null,
    staleTime: Infinity,
  });
}
