import { useMemo } from 'react'
import type { Driver, Position, Interval, Pit, Lap, StartingGrid, Stint } from '@/api/types'
import { teamColor } from '@/utils/color'
import { SECTOR_PURPLE_S, SECTOR_GREEN_S } from '@/constants'
import { SectorBar, type SectorTier } from './SectorBar'
import { TyreBadge } from './TyreBadge'

interface Props {
  readonly drivers: Driver[]
  readonly positions: Position[]
  readonly intervals: Interval[]
  readonly pits: Pit[]
  readonly laps: Lap[]
  readonly stints?: Stint[]
  readonly grid?: StartingGrid[]
  readonly sessionTimeMs: number
  readonly sessionStartMs: number
  readonly isLoading?: boolean
  readonly selectedDriver?: number | null
  readonly onSelectDriver?: (driverNumber: number) => void
}

function fmtGap(val: number | string | null) {
  if (val === null) return '—'
  if (typeof val === 'string') return val
  if (val === 0) return 'LEAD'
  return `+${val.toFixed(3)}`
}

function fmtTime(sec: number | null): string {
  if (sec === null) return '—'
  const m = Math.floor(sec / 60)
  const s = (sec % 60).toFixed(3).padStart(6, '0')
  return m > 0 ? `${m}:${s}` : s
}

function sectorTier(t: number | null, best: number | null, personalBest: number | null): SectorTier {
  if (t === null) return 'none'
  if (best !== null && t <= best + 0.001) return 'fastest'
  if (personalBest !== null && t <= personalBest + 0.001) return 'personal'
  if (best !== null && t - best <= SECTOR_GREEN_S) return 'fast'
  if (t !== null) return 'normal'
  return 'none'
}

function lapTimeTier(lapTime: number | null, sessionBest: number | null): 'fastest' | 'fast' | 'normal' | 'none' {
  if (lapTime === null || sessionBest === null) return 'none'
  if (lapTime <= sessionBest + 0.001) return 'fastest'
  if (lapTime - sessionBest <= SECTOR_GREEN_S) return 'fast'
  return 'normal'
}

const LAP_TIME_COLOUR: Record<string, string> = {
  fastest: 'text-[#9b59f5]',
  fast:    'text-[#39b54a]',
  normal:  'text-white',
  none:    'text-muted',
}

const TH = 'py-1.5 px-2 text-[9px] font-bold uppercase tracking-[0.12em] text-[#636369] select-none'

export function LiveTiming({
  drivers, positions, intervals, pits, laps, stints, grid,
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

  const pittingNow = useMemo(() => {
    const s = new Set<number>()
    for (const p of pits) {
      const entry = new Date(p.date).getTime()
      const exitMs = p.pit_duration ? entry + p.pit_duration * 1000 : entry + 30_000
      if (entry <= currentT && currentT <= exitMs) s.add(p.driver_number)
    }
    return s
  }, [pits, currentT])

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

  // Session-best sector times and lap times
  const sessionBest = useMemo(() => {
    let s1: number | null = null, s2: number | null = null, s3: number | null = null
    let lap: number | null = null
    for (const l of lastLapMap.values()) {
      if (l.duration_sector_1 !== null && (s1 === null || l.duration_sector_1 < s1)) s1 = l.duration_sector_1
      if (l.duration_sector_2 !== null && (s2 === null || l.duration_sector_2 < s2)) s2 = l.duration_sector_2
      if (l.duration_sector_3 !== null && (s3 === null || l.duration_sector_3 < s3)) s3 = l.duration_sector_3
      if (l.lap_duration !== null && (lap === null || l.lap_duration < lap)) lap = l.lap_duration
    }
    return { s1, s2, s3, lap }
  }, [lastLapMap])

  // Personal-best sectors per driver (across all laps up to currentT)
  const personalBestMap = useMemo(() => {
    const m = new Map<number, { s1: number | null; s2: number | null; s3: number | null }>()
    for (const l of laps) {
      if (!l.date_start || !l.lap_duration) continue
      const lapEndT = new Date(l.date_start).getTime() + l.lap_duration * 1000
      if (lapEndT > currentT) continue
      const pb = m.get(l.driver_number) ?? { s1: null, s2: null, s3: null }
      if (l.duration_sector_1 !== null && (pb.s1 === null || l.duration_sector_1 < pb.s1)) pb.s1 = l.duration_sector_1
      if (l.duration_sector_2 !== null && (pb.s2 === null || l.duration_sector_2 < pb.s2)) pb.s2 = l.duration_sector_2
      if (l.duration_sector_3 !== null && (pb.s3 === null || l.duration_sector_3 < pb.s3)) pb.s3 = l.duration_sector_3
      m.set(l.driver_number, pb)
    }
    return m
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
            <th className={`${TH} text-left w-8`}>P</th>
            <th className={`${TH} text-left`}>Driver</th>
            <th className={`${TH} text-right`}>Best Lap</th>
            <th className={`${TH} text-right`}>Gap</th>
            <th className={`${TH} text-center`}>S1</th>
            <th className={`${TH} text-center`}>S2</th>
            <th className={`${TH} text-center`}>S3</th>
            <th className={`${TH} text-left`}>Tyre</th>
            <th className={`${TH} text-center w-10`}>Lap</th>
          </tr>
        </thead>
        <tbody>
          {sorted.map(([num, pos], idx) => {
            const driver = driverByNumber.get(num)
            const intData = intMap.get(num)
            const color = teamColor(driver?.team_colour)
            const inPit = pittingNow.has(num)
            const lastLap = lastLapMap.get(num) ?? null
            const currentLap = currentLapMap.get(num) ?? null
            const pb = personalBestMap.get(num) ?? { s1: null, s2: null, s3: null }

            const t1 = sectorTier(lastLap?.duration_sector_1 ?? null, sessionBest.s1, pb.s1)
            const t2 = sectorTier(lastLap?.duration_sector_2 ?? null, sessionBest.s2, pb.s2)
            const t3 = sectorTier(lastLap?.duration_sector_3 ?? null, sessionBest.s3, pb.s3)
            const lapTier = lapTimeTier(lastLap?.lap_duration ?? null, sessionBest.lap)

            const gridPos = gridMap.get(num) ?? null
            const gained = gridPos !== null ? gridPos - pos : null
            const selected = selectedDriver === num
            const rowBg = selected
              ? 'bg-[#2a2a35]'
              : idx % 2 === 1
              ? 'bg-white/[0.02] hover:bg-white/[0.06]'
              : 'hover:bg-white/[0.06]'

            return (
              <tr
                key={num}
                onClick={() => onSelectDriver?.(num)}
                className={`border-b border-[#1e1e28] transition-colors ${onSelectDriver ? 'cursor-pointer' : ''} ${rowBg}`}
              >
                {/* Position */}
                <td className="py-2 px-2 font-black text-sm tabular-nums text-white/90">{pos}</td>

                {/* Driver */}
                <td className="py-2 px-2">
                  <span className="flex items-center gap-2">
                    {/* Team colour bar */}
                    <span className="w-[3px] h-4 shrink-0 rounded-sm" style={{ background: color }} />
                    {/* Surname in CAPS */}
                    <span className="font-bold text-[12px] tracking-[0.06em] uppercase text-white">
                      {driver?.name_acronym ?? num}
                    </span>
                    {/* Places gained/lost */}
                    {gained !== null && gained !== 0 && (
                      <span
                        className={`text-[9px] font-bold tabular-nums ${gained > 0 ? 'text-[#39b54a]' : 'text-[#ff5252]'}`}
                        title={`${gained > 0 ? 'Gained' : 'Lost'} ${Math.abs(gained)} since start (P${gridPos})`}
                      >
                        {gained > 0 ? '▲' : '▼'}{Math.abs(gained)}
                      </span>
                    )}
                    {inPit && (
                      <span className="bg-panel text-muted text-[9px] font-black uppercase tracking-widest px-1.5 py-0.5">
                        PIT
                      </span>
                    )}
                  </span>
                </td>

                {/* Best lap time */}
                <td className={`py-2 px-2 text-right font-mono text-[12px] tabular-nums ${LAP_TIME_COLOUR[lapTier]}`}>
                  {fmtTime(lastLap?.lap_duration ?? null)}
                </td>

                {/* Gap to leader */}
                <td className="py-2 px-2 text-right font-mono text-[11px] tabular-nums text-muted">
                  {fmtGap(intData?.gap_to_leader ?? null)}
                </td>

                {/* Sector bars */}
                <td className="py-2 px-1">
                  <div className="flex justify-center">
                    <SectorBar tier={t1} title={`S1: ${lastLap?.duration_sector_1?.toFixed(3) ?? '—'}`} />
                  </div>
                </td>
                <td className="py-2 px-1">
                  <div className="flex justify-center">
                    <SectorBar tier={t2} title={`S2: ${lastLap?.duration_sector_2?.toFixed(3) ?? '—'}`} />
                  </div>
                </td>
                <td className="py-2 px-1">
                  <div className="flex justify-center">
                    <SectorBar tier={t3} title={`S3: ${lastLap?.duration_sector_3?.toFixed(3) ?? '—'}`} />
                  </div>
                </td>

                {/* Tyre badge */}
                <td className="py-2 px-2">
                  <TyreBadge
                    stints={stints ?? []}
                    driverNumber={num}
                    currentLap={currentLap}
                  />
                </td>

                {/* Current lap */}
                <td className="py-2 px-2 text-center font-mono text-[11px] tabular-nums text-muted">
                  {currentLap ?? '—'}
                </td>
              </tr>
            )
          })}
        </tbody>
      </table>
    </div>
  )
}
