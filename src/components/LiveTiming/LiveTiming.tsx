import { useMemo } from 'react'
import type { Driver, Position, Interval, Pit, Lap } from '@/api/types'
import { teamColor } from '@/utils/color'

interface Props {
  drivers: Driver[]
  positions: Position[]
  intervals: Interval[]
  pits: Pit[]
  laps: Lap[]
  sessionTimeMs: number
  sessionStartMs: number
  isLoading?: boolean
}

function fmtGap(val: number | null) {
  if (val === null) return '—'
  if (val === 0) return 'LEADER'
  return `+${val.toFixed(3)}`
}

function fmtLap(sec: number | null) {
  if (sec === null) return '—'
  const m = Math.floor(sec / 60)
  const s = (sec % 60).toFixed(3).padStart(6, '0')
  return `${m}:${s}`
}

export function LiveTiming({
  drivers, positions, intervals, pits, laps,
  sessionTimeMs, sessionStartMs, isLoading,
}: Props) {
  const currentT = sessionStartMs + sessionTimeMs

  // Latest position per driver up to current time
  const posMap = useMemo(() => {
    const map = new Map<number, number>()
    for (const p of positions) {
      if (new Date(p.date).getTime() <= currentT) map.set(p.driver_number, p.position)
    }
    return map
  }, [positions, currentT])

  // Latest interval per driver up to current time
  const intMap = useMemo(() => {
    const map = new Map<number, Interval>()
    for (const i of intervals) {
      if (new Date(i.date).getTime() <= currentT) map.set(i.driver_number, i)
    }
    return map
  }, [intervals, currentT])

  // Drivers currently in pit lane (pit entry ≤ t and no pit_duration yet, or within duration window)
  const pittingNow = useMemo(() => {
    const set = new Set<number>()
    for (const p of pits) {
      const entry = new Date(p.date).getTime()
      const exitMs = p.pit_duration ? entry + p.pit_duration * 1000 : entry + 30_000
      if (entry <= currentT && currentT <= exitMs) set.add(p.driver_number)
    }
    return set
  }, [pits, currentT])

  // Last completed lap time per driver up to current time
  const lastLapMap = useMemo(() => {
    const map = new Map<number, number | null>()
    for (const l of laps) {
      if (!l.date_start) continue
      const lapEndT = new Date(l.date_start).getTime() + (l.lap_duration ?? 0) * 1000
      if (lapEndT <= currentT) map.set(l.driver_number, l.lap_duration)
    }
    return map
  }, [laps, currentT])

  const driverByNumber = useMemo(
    () => new Map(drivers.map((d) => [d.driver_number, d])),
    [drivers],
  )

  const sorted = useMemo(
    () => [...posMap.entries()].sort((a, b) => a[1] - b[1]),
    [posMap],
  )

  if (isLoading) {
    return (
      <div className="text-muted text-xs p-3 animate-pulse">Loading timing data…</div>
    )
  }

  if (sorted.length === 0) {
    return (
      <div className="text-muted text-xs p-3">
        {sessionStartMs ? 'No timing data yet — scrub forward' : 'Select a session'}
      </div>
    )
  }

  return (
    <div className="text-xs font-mono h-full overflow-auto">
      <table className="w-full border-collapse">
        <thead>
          <tr className="text-muted border-b border-panel sticky top-0 bg-surface z-10">
            <th className="text-left py-1 px-2">P</th>
            <th className="text-left py-1 px-2">Driver</th>
            <th className="text-right py-1 px-2">Last Lap</th>
            <th className="text-right py-1 px-2">Gap</th>
            <th className="text-right py-1 px-2">Int</th>
          </tr>
        </thead>
        <tbody>
          {sorted.map(([num, pos]) => {
            const driver = driverByNumber.get(num)
            const intData = intMap.get(num)
            const color = teamColor(driver?.team_colour)
            const inPit = pittingNow.has(num)
            const lastLap = lastLapMap.get(num) ?? null
            return (
              <tr key={num} className="border-b border-panel/40 hover:bg-panel/30 transition-colors">
                <td className="py-1 px-2 text-muted tabular-nums">{pos}</td>
                <td className="py-1 px-2">
                  <span
                    className="inline-block w-1 h-4 mr-1 rounded-sm align-middle"
                    style={{ background: color }}
                  />
                  <span className={inPit ? 'text-yellow-400' : ''}>
                    {driver?.name_acronym ?? num}
                  </span>
                  {inPit && (
                    <span className="ml-1 text-yellow-400 font-bold">PIT</span>
                  )}
                </td>
                <td className="py-1 px-2 text-right tabular-nums text-muted">
                  {fmtLap(lastLap)}
                </td>
                <td className="py-1 px-2 text-right tabular-nums">
                  {fmtGap(intData?.gap_to_leader ?? null)}
                </td>
                <td className="py-1 px-2 text-right tabular-nums text-muted">
                  {fmtGap(intData?.interval ?? null)}
                </td>
              </tr>
            )
          })}
        </tbody>
      </table>
    </div>
  )
}
