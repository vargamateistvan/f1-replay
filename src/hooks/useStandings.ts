import { useMemo } from 'react'
import { useQuery, useQueries } from '@tanstack/react-query'
import { api } from '@/api/endpoints'
import { teamColor } from '@/utils/color'

const RACE_POINTS = [25, 18, 15, 12, 10, 8, 6, 4, 2, 1]
const SPRINT_POINTS = [8, 7, 6, 5, 4, 3, 2, 1]

export interface DriverStanding {
  position: number
  driverNumber: number
  acronym: string
  fullName: string
  team: string
  color: string
  points: number
  wins: number
  podiums: number
}

export interface ConstructorStanding {
  position: number
  name: string
  color: string
  points: number
  wins: number
}

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

  // Final positions for every race session (batched, rate-limited by our client queue)
  const positionQueries = useQueries({
    queries: raceSessions.map((s) => ({
      queryKey: ['positions', s.session_key],
      queryFn: () => api.positions(s.session_key),
      staleTime: Infinity,
    })),
  })

  const loadedRaces = positionQueries.filter((q) => q.data !== undefined).length
  const totalRaces = raceSessions.length

  // Build lookup maps from driver data
  const driverInfo = useMemo(() => {
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

  const { driverStandings, constructorStandings } = useMemo(() => {
    const dPts = new Map<number, number>()
    const dWins = new Map<number, number>()
    const dPodiums = new Map<number, number>()
    const cPts = new Map<string, number>()
    const cWins = new Map<string, number>()
    const cColor = new Map<string, string>()

    raceSessions.forEach((session, i) => {
      const result = positionQueries[i]?.data
      if (!result || result.length === 0) return

      const isSprint = session.session_type === 'Sprint'
      const pts = isSprint ? SPRINT_POINTS : RACE_POINTS

      // Last known position per driver = finishing position
      const finalPos = new Map<number, number>()
      for (const p of result) finalPos.set(p.driver_number, p.position)

      for (const [num, pos] of finalPos) {
        const p = pts[pos - 1] ?? 0
        dPts.set(num, (dPts.get(num) ?? 0) + p)
        if (pos === 1) dWins.set(num, (dWins.get(num) ?? 0) + 1)
        if (pos <= 3) dPodiums.set(num, (dPodiums.get(num) ?? 0) + 1)

        const t = driverInfo.team.get(num)
        if (t) {
          cPts.set(t, (cPts.get(t) ?? 0) + p)
          if (pos === 1) cWins.set(t, (cWins.get(t) ?? 0) + 1)
          const c = driverInfo.color.get(num)
          if (c) cColor.set(t, c)
        }
      }
    })

    const driverStandings: DriverStanding[] = [...dPts.entries()]
      .map(([num, points]) => ({
        position: 0,
        driverNumber: num,
        acronym: driverInfo.acronym.get(num) ?? `#${num}`,
        fullName: driverInfo.fullName.get(num) ?? `Driver ${num}`,
        team: driverInfo.team.get(num) ?? '—',
        color: driverInfo.color.get(num) ?? '#888',
        points,
        wins: dWins.get(num) ?? 0,
        podiums: dPodiums.get(num) ?? 0,
      }))
      .sort((a, b) => b.points - a.points || b.wins - a.wins || b.podiums - a.podiums)
      .map((s, i) => ({ ...s, position: i + 1 }))

    const constructorStandings: ConstructorStanding[] = [...cPts.entries()]
      .map(([name, points]) => ({
        position: 0,
        name,
        color: cColor.get(name) ?? '#888',
        points,
        wins: cWins.get(name) ?? 0,
      }))
      .sort((a, b) => b.points - a.points || b.wins - a.wins)
      .map((s, i) => ({ ...s, position: i + 1 }))

    return { driverStandings, constructorStandings }
  }, [raceSessions, positionQueries, driverInfo])

  return {
    driverStandings,
    constructorStandings,
    loadedRaces,
    totalRaces,
    isLoading: sessionsQ.isPending,
    isFetching: positionQueries.some((q) => q.isFetching),
  }
}
