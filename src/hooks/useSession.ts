import { useQuery } from '@tanstack/react-query'
import { api } from '@/api/endpoints'
import { LIVE_POLL_MS } from '@/utils/live'

export function useMeetings(year: number) {
  return useQuery({
    queryKey: ['meetings', year],
    queryFn: () => api.meetings(year),
    staleTime: Infinity,
  })
}

export function useSessions(meetingKey: number | null) {
  return useQuery({
    queryKey: ['sessions', meetingKey],
    queryFn: () => api.sessions(meetingKey!),
    enabled: meetingKey !== null,
    staleTime: Infinity,
  })
}

export function useDrivers(sessionKey: number | null) {
  return useQuery({
    queryKey: ['drivers', sessionKey],
    queryFn: () => api.drivers(sessionKey!),
    enabled: sessionKey !== null,
    staleTime: Infinity,
  })
}

export function usePositions(sessionKey: number | null, isLive = false) {
  return useQuery({
    queryKey: ['positions', sessionKey],
    queryFn: () => api.positions(sessionKey!),
    enabled: sessionKey !== null,
    staleTime: isLive ? 0 : Infinity,
    refetchInterval: isLive ? LIVE_POLL_MS : false,
  })
}

export function useIntervals(sessionKey: number | null, isLive = false) {
  return useQuery({
    queryKey: ['intervals', sessionKey],
    queryFn: () => api.intervals(sessionKey!),
    enabled: sessionKey !== null,
    staleTime: isLive ? 0 : Infinity,
    refetchInterval: isLive ? LIVE_POLL_MS : false,
  })
}

export function useLaps(sessionKey: number | null, driverNumber?: number, isLive = false) {
  return useQuery({
    queryKey: ['laps', sessionKey, driverNumber],
    queryFn: () => api.laps(sessionKey!, driverNumber),
    enabled: sessionKey !== null,
    staleTime: isLive ? 0 : Infinity,
    refetchInterval: isLive ? LIVE_POLL_MS : false,
  })
}

export function useStints(sessionKey: number | null) {
  return useQuery({
    queryKey: ['stints', sessionKey],
    queryFn: () => api.stints(sessionKey!),
    enabled: sessionKey !== null,
    staleTime: Infinity,
  })
}

export function useStartingGrid(sessionKey: number | null) {
  return useQuery({
    queryKey: ['startingGrid', sessionKey],
    queryFn: () => api.startingGrid(sessionKey!),
    enabled: sessionKey !== null,
    staleTime: Infinity,
  })
}

export function usePits(sessionKey: number | null) {
  return useQuery({
    queryKey: ['pits', sessionKey],
    queryFn: () => api.pits(sessionKey!),
    enabled: sessionKey !== null,
    staleTime: Infinity,
  })
}

export function useRaceControl(sessionKey: number | null, isLive = false) {
  return useQuery({
    queryKey: ['raceControl', sessionKey],
    queryFn: () => api.raceControl(sessionKey!),
    enabled: sessionKey !== null,
    staleTime: isLive ? 0 : Infinity,
    refetchInterval: isLive ? LIVE_POLL_MS : false,
  })
}

export function useTeamRadio(sessionKey: number | null, isLive = false) {
  return useQuery({
    queryKey: ['teamRadio', sessionKey],
    queryFn: () => api.teamRadio(sessionKey!),
    enabled: sessionKey !== null,
    staleTime: isLive ? 0 : Infinity,
    refetchInterval: isLive ? LIVE_POLL_MS : false,
  })
}

export function useWeather(sessionKey: number | null, isLive = false) {
  return useQuery({
    queryKey: ['weather', sessionKey],
    queryFn: () => api.weather(sessionKey!),
    enabled: sessionKey !== null,
    staleTime: isLive ? 0 : Infinity,
    refetchInterval: isLive ? LIVE_POLL_MS : false,
  })
}
