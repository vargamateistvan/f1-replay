import { useMemo } from 'react'
import { useQuery, useQueries } from '@tanstack/react-query'
import { api } from '@/api/endpoints'
import { teamColor } from '@/utils/color'
import { computeStandings, type DriverInfo } from '@/utils/standings'

// Re-exported for existing import sites (pages/Standings.tsx).
export type { DriverStanding, ConstructorStanding } from '@/utils/standings'

export function useStandings(year: number) {
  // All sessions for the year
  const sessionsQ = useQuery({
    queryKey: ['sessions-year', year],
    queryFn: () => api.sessionsByYear(year),
    staleTime: Infinity,
  })

  // Only Race and Sprint sessions, in chronological order
  const raceSessions = useMemo(
    () =>
      (sessionsQ.data ?? [])
        .filter((s) => s.session_type === 'Race' || s.session_type === 'Sprint')
        .sort(
          (a, b) =>
            new Date(a.date_start).getTime() - new Date(b.date_start).getTime(),
        ),
    [sessionsQ.data],
  )

  // Driver/team info from the most recent race session
  const latestKey = raceSessions[raceSessions.length - 1]?.session_key ?? null
  const driversQ = useQuery({
    queryKey: ['drivers', latestKey],
    queryFn: () => api.drivers(latestKey!),
    enabled: latestKey !== null,
    staleTime: Infinity,
  })

  // Authoritative classification for every race session (batched, rate-limited by
  // our client queue). session_result gives finishing position, points, and
  // DNF/DNS/DSQ flags directly — far more accurate than scraping the last position.
  const resultQueries = useQueries({
    queries: raceSessions.map((s) => ({
      queryKey: ['sessionResult', s.session_key],
      queryFn: () => api.sessionResult(s.session_key),
      staleTime: Infinity,
    })),
  })

  const loadedRaces = resultQueries.filter((q) => q.data !== undefined).length
  const totalRaces = raceSessions.length

  // Build lookup maps from driver data
  const driverInfo = useMemo<DriverInfo>(() => {
    const acronym = new Map<number, string>()
    const fullName = new Map<number, string>()
    const team = new Map<number, string>()
    const color = new Map<number, string>()
    for (const d of driversQ.data ?? []) {
      acronym.set(d.driver_number, d.name_acronym)
      fullName.set(d.driver_number, d.full_name)
      team.set(d.driver_number, d.team_name)
      color.set(d.driver_number, teamColor(d.team_colour))
    }
    return { acronym, fullName, team, color }
  }, [driversQ.data])

  // resultQueries is a new array each render; depend on the data identities instead.
  const resultData = resultQueries.map((q) => q.data)
  const { driverStandings, constructorStandings } = useMemo(
    () => computeStandings(raceSessions, resultData, driverInfo),
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [raceSessions, driverInfo, ...resultData],
  )

  return {
    driverStandings,
    constructorStandings,
    loadedRaces,
    totalRaces,
    isLoading: sessionsQ.isPending,
    isFetching: resultQueries.some((q) => q.isFetching),
    isError: sessionsQ.isError || resultQueries.some((q) => q.isError),
  }
}
