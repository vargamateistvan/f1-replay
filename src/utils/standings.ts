import type { SessionResult } from '@/api/types'
import { RACE_POINTS, SPRINT_POINTS } from '@/constants'

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

// Per-driver lookups assembled from the drivers endpoint.
export interface DriverInfo {
  acronym: Map<number, string>
  fullName: Map<number, string>
  team: Map<number, string>
  color: Map<number, string>
}

interface SessionLike {
  session_type: string
}

// Aggregate a season's race/sprint results into driver + constructor tables.
// `results[i]` is the session_result for `sessions[i]` (undefined if not loaded).
// Pure and deterministic — the unit of standings logic worth testing.
export function computeStandings(
  sessions: SessionLike[],
  results: (SessionResult[] | undefined)[],
  info: DriverInfo,
): { driverStandings: DriverStanding[]; constructorStandings: ConstructorStanding[] } {
  const dPts = new Map<number, number>()
  const dWins = new Map<number, number>()
  const dPodiums = new Map<number, number>()
  const cPts = new Map<string, number>()
  const cWins = new Map<string, number>()
  const cColor = new Map<string, string>()

  sessions.forEach((session, i) => {
    const result = results[i]
    if (!result || result.length === 0) return

    const isSprint = session.session_type === 'Sprint'
    const fallbackPts = isSprint ? SPRINT_POINTS : RACE_POINTS

    for (const r of result) {
      if (r.dns) continue // did not start → no entry
      const num = r.driver_number
      const pos = r.position
      const classified = pos !== null && !r.dsq // finished and not disqualified
      const won = classified && pos === 1
      const onPodium = classified && pos <= 3
      // Trust the API's points when present; otherwise derive from finishing slot.
      const earned = r.points ?? (classified ? (fallbackPts[pos - 1] ?? 0) : 0)

      dPts.set(num, (dPts.get(num) ?? 0) + earned)
      if (won) dWins.set(num, (dWins.get(num) ?? 0) + 1)
      if (onPodium) dPodiums.set(num, (dPodiums.get(num) ?? 0) + 1)

      const team = info.team.get(num)
      if (team) {
        cPts.set(team, (cPts.get(team) ?? 0) + earned)
        if (won) cWins.set(team, (cWins.get(team) ?? 0) + 1)
        const c = info.color.get(num)
        if (c) cColor.set(team, c)
      }
    }
  })

  const driverStandings: DriverStanding[] = [...dPts.entries()]
    .map(([num, points]) => ({
      position: 0,
      driverNumber: num,
      acronym: info.acronym.get(num) ?? `#${num}`,
      fullName: info.fullName.get(num) ?? `Driver ${num}`,
      team: info.team.get(num) ?? '—',
      color: info.color.get(num) ?? '#888',
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
}
