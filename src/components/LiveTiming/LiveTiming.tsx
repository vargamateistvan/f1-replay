import { useMemo } from 'react'
import type { Driver, Position, Interval, Pit, Lap, StartingGrid } from '@/api/types'
import { teamColor } from '@/utils/color'
import { SECTOR_PURPLE_S, SECTOR_GREEN_S } from '@/constants'

interface Props {
  readonly drivers: Driver[]
  readonly positions: Position[]
  readonly intervals: Interval[]
  readonly pits: Pit[]
  readonly laps: Lap[]
  readonly grid?: StartingGrid[]
  readonly sessionTimeMs: number
  readonly sessionStartMs: number
  readonly isLoading?: boolean
  readonly selectedDriver?: number | null
  readonly onSelectDriver?: (driverNumber: number) => void
}

function fmtGap(val: number | null) {
  if (val === null) return '—'
  if (val === 0) return 'LEAD'
  return `+${val.toFixed(3)}`
}

function fmtSector(sec: number | null) {
  if (sec === null) return null
  return sec.toFixed(3)
}

// Sector colour based on how this sector compares to the session best
function sectorClass(t: number | null, best: number | null): string {
  if (t === null || best === null) return 'text-muted'
  const delta = t - best
  if (delta <= SECTOR_PURPLE_S) return 'text-[#b48ead]'   // personal best — purple
  if (delta <= SECTOR_GREEN_S) return 'text-[#39d743]'     // faster — green
  return 'text-[#ffd600]'                                   // slower — yellow
}

export function LiveTiming({
  drivers, positions, intervals, pits, laps, grid,
  sessionTimeMs, sessionStartMs, isLoading,
  selectedDriver, onSelectDriver,
}: Props) {
  const currentT = sessionStartMs + sessionTimeMs

  const posMap = useMemo(() => {
    const m = new Map<number, number>()
    for (const p of positions)
      if (new Date(p.date).getTime() <= currentT) m.set(p.driver_number, p.position)
    return m
  }, [positions, currentT])

  // Grid slot per driver → lets us show places gained/lost vs the start.
  const gridMap = useMemo(() => {
    const m = new Map<number, number>()
    for (const g of grid ?? []) m.set(g.driver_number, g.position)
    return m
  }, [grid])

  const intMap = useMemo(() => {
    const m = new Map<number, Interval>()
    for (const i of intervals)
      if (new Date(i.date).getTime() <= currentT) m.set(i.driver_number, i)
    return m
  }, [intervals, currentT])

  // Drivers currently in pit lane
  const pittingNow = useMemo(() => {
    const s = new Set<number>()
    for (const p of pits) {
      const entry = new Date(p.date).getTime()
      const exitMs = p.pit_duration ? entry + p.pit_duration * 1000 : entry + 30_000
      if (entry <= currentT && currentT <= exitMs) s.add(p.driver_number)
    }
    return s
  }, [pits, currentT])

  // Last completed lap per driver — the lap whose date_start + lap_duration ≤ currentT
  const lastLapMap = useMemo(() => {
    const m = new Map<number, Lap>()
    for (const l of laps) {
      if (!l.date_start || !l.lap_duration) continue
      const lapEndT = new Date(l.date_start).getTime() + l.lap_duration * 1000
      if (lapEndT <= currentT) {
        const prev = m.get(l.driver_number)
        if (!prev || l.lap_number > prev.lap_number) m.set(l.driver_number, l)
      }
    }
    return m
  }, [laps, currentT])

  // Current lap in progress per driver — last lap whose date_start ≤ currentT
  const currentLapMap = useMemo(() => {
    const m = new Map<number, number>()
    for (const l of laps) {
      if (!l.date_start) continue
      if (new Date(l.date_start).getTime() <= currentT) {
        const prev = m.get(l.driver_number) ?? 0
        if (l.lap_number > prev) m.set(l.driver_number, l.lap_number)
      }
    }
    return m
  }, [laps, currentT])

  // Session-best sector times across all completed laps up to currentT
  const bestSectors = useMemo(() => {
    let s1: number | null = null, s2: number | null = null, s3: number | null = null
    for (const l of lastLapMap.values()) {
      if (l.duration_sector_1 !== null && (s1 === null || l.duration_sector_1 < s1)) s1 = l.duration_sector_1
      if (l.duration_sector_2 !== null && (s2 === null || l.duration_sector_2 < s2)) s2 = l.duration_sector_2
      if (l.duration_sector_3 !== null && (s3 === null || l.duration_sector_3 < s3)) s3 = l.duration_sector_3
    }
    return { s1, s2, s3 }
  }, [lastLapMap])

  const driverByNumber = useMemo(
    () => new Map(drivers.map((d) => [d.driver_number, d])),
    [drivers],
  )

  const sorted = useMemo(
    () => [...posMap.entries()].sort((a, b) => a[1] - b[1]),
    [posMap],
  )

  if (isLoading) {
    return <div className="text-muted text-xs p-3 animate-pulse">Loading timing data…</div>
  }
  if (sorted.length === 0) {
    return (
      <div className="text-muted text-xs p-3">
        {sessionStartMs ? 'No timing data yet — scrub forward' : 'Select a session'}
      </div>
    )
  }

  return (
    <div className="h-full overflow-auto">
      <table className="w-full border-collapse">
        <thead>
          <tr className="sticky top-0 bg-track z-10 border-b border-[#38383f]">
            <th className="text-left py-2 px-2 text-[10px] font-bold uppercase tracking-widest text-[#636369] w-6">P</th>
            <th className="text-left py-2 px-2 text-[10px] font-bold uppercase tracking-widest text-[#636369]">Driver</th>
            <th className="text-center py-2 px-1 text-[10px] font-bold uppercase tracking-widest text-[#636369] w-7">Lap</th>
            <th className="text-right py-2 px-1 text-[10px] font-bold uppercase tracking-widest text-[#636369] w-12">S1</th>
            <th className="text-right py-2 px-1 text-[10px] font-bold uppercase tracking-widest text-[#636369] w-12">S2</th>
            <th className="text-right py-2 px-1 text-[10px] font-bold uppercase tracking-widest text-[#636369] w-12">S3</th>
            <th className="text-right py-2 px-2 text-[10px] font-bold uppercase tracking-widest text-[#636369] w-16">Gap</th>
          </tr>
        </thead>
        <tbody>
          {sorted.map(([num, pos]) => {
            const driver = driverByNumber.get(num)
            const intData = intMap.get(num)
            const color = teamColor(driver?.team_colour)
            const inPit = pittingNow.has(num)
            const lastLap = lastLapMap.get(num) ?? null
            const currentLap = currentLapMap.get(num) ?? null
            const s1 = fmtSector(lastLap?.duration_sector_1 ?? null)
            const s2 = fmtSector(lastLap?.duration_sector_2 ?? null)
            const s3 = fmtSector(lastLap?.duration_sector_3 ?? null)
            const gridPos = gridMap.get(num) ?? null
            const gained = gridPos !== null ? gridPos - pos : null

            const selected = selectedDriver === num
            return (
              <tr
                key={num}
                onClick={() => onSelectDriver?.(num)}
                className={`border-b border-[#2a2a35] ${onSelectDriver ? 'cursor-pointer' : ''} ${
                  selected ? 'bg-[#2a2a35]' : 'hover:bg-[#1f1f27]'
                }`}
              >
                <td className="py-2 px-2 font-black text-sm tabular-nums">{pos}</td>
                <td className="py-2 px-2">
                  <span className="flex items-center gap-2">
                    <span
                      className="w-[3px] h-4 shrink-0"
                      style={{ background: color }}
                    />
                    <span className="font-black text-xs" style={{ color }}>
                      {driver?.name_acronym ?? num}
                    </span>
                    {gained !== null && gained !== 0 && (
                      <span
                        className={`text-[9px] font-bold tabular-nums ${gained > 0 ? 'text-[#39d743]' : 'text-[#ff5252]'}`}
                        title={`${gained > 0 ? 'Gained' : 'Lost'} ${Math.abs(gained)} since start (P${gridPos})`}
                      >
                        {gained > 0 ? '▲' : '▼'}{Math.abs(gained)}
                      </span>
                    )}
                    {inPit && (
                      <span className="bg-[#2a2a35] text-[#a3a3a3] text-[10px] font-black uppercase tracking-widest px-1.5 py-0.5">
                        PIT
                      </span>
                    )}
                  </span>
                </td>
                <td className="py-2 px-1 text-center font-mono text-xs tabular-nums text-muted">
                  {currentLap ?? '—'}
                </td>
                <td className={`py-2 px-1 text-right font-mono text-xs tabular-nums ${sectorClass(lastLap?.duration_sector_1 ?? null, bestSectors.s1)}`}>
                  {s1 ?? '—'}
                </td>
                <td className={`py-2 px-1 text-right font-mono text-xs tabular-nums ${sectorClass(lastLap?.duration_sector_2 ?? null, bestSectors.s2)}`}>
                  {s2 ?? '—'}
                </td>
                <td className={`py-2 px-1 text-right font-mono text-xs tabular-nums ${sectorClass(lastLap?.duration_sector_3 ?? null, bestSectors.s3)}`}>
                  {s3 ?? '—'}
                </td>
                <td className="py-2 px-2 text-right font-mono text-xs tabular-nums">
                  {fmtGap(intData?.gap_to_leader ?? null)}
                </td>
              </tr>
            )
          })}
        </tbody>
      </table>
    </div>
  )
}
