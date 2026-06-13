import { useMemo } from 'react'
import {
  LineChart, Line, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer, ReferenceLine,
} from 'recharts'
import type { Driver, Position } from '@/api/types'
import { teamColor } from '@/utils/color'

interface Props {
  readonly drivers: Driver[]
  readonly positions: Position[]
  readonly lapStarts: number[] // session-relative ms, sorted (one per lap)
  readonly sessionStartMs: number
  readonly sessionTimeMs: number
}

// Classic position-by-lap "spaghetti" chart. Position at each lap boundary is the
// last known position for that driver at/before the boundary time — derived from
// the position series already loaded for Live Timing (no extra fetch).
export function LapChart({ drivers, positions, lapStarts, sessionStartMs, sessionTimeMs }: Props) {
  // Per-driver position entries in session-relative ms (matching lapStarts), sorted.
  const byDriver = useMemo(() => {
    const m = new Map<number, Array<{ ms: number; pos: number }>>()
    for (const p of positions) {
      let arr = m.get(p.driver_number)
      if (!arr) { arr = []; m.set(p.driver_number, arr) }
      arr.push({ ms: new Date(p.date).getTime() - sessionStartMs, pos: p.position })
    }
    for (const arr of m.values()) arr.sort((a, b) => a.ms - b.ms)
    return m
  }, [positions, sessionStartMs])

  const rows = useMemo(() => {
    if (lapStarts.length === 0 || byDriver.size === 0) return []
    return lapStarts.map((lapMs, i) => {
      const row: Record<string, number> = { lap: i + 1 }
      for (const [num, arr] of byDriver) {
        const pos = stepPos(arr, lapMs)
        if (pos !== null) row[String(num)] = pos
      }
      return row
    })
  }, [lapStarts, byDriver])

  const currentLap = useMemo(() => {
    let lap = 0
    for (let i = 0; i < lapStarts.length; i++) if (lapStarts[i]! <= sessionTimeMs) lap = i + 1
    return lap
  }, [lapStarts, sessionTimeMs])

  if (rows.length === 0) {
    return (
      <div className="flex items-center justify-center h-full text-muted text-sm">
        No position data for a lap chart yet
      </div>
    )
  }

  const driverCount = drivers.length || 20

  return (
    <ResponsiveContainer width="100%" height="100%">
      <LineChart data={rows} margin={{ top: 8, right: 12, left: 0, bottom: 4 }}>
        <CartesianGrid stroke="#2a2a35" />
        <XAxis
          dataKey="lap"
          tick={{ fill: '#636369', fontSize: 10 }}
          axisLine={{ stroke: '#38383f' }}
          tickLine={false}
        />
        <YAxis
          reversed
          domain={[1, driverCount]}
          allowDecimals={false}
          width={24}
          tick={{ fill: '#636369', fontSize: 10 }}
          axisLine={false}
          tickLine={false}
        />
        <Tooltip content={<LapTooltip />} />
        {currentLap > 0 && <ReferenceLine x={currentLap} stroke="#E8002D" strokeWidth={1} />}
        {drivers.map((d) => (
          <Line
            key={d.driver_number}
            type="monotone"
            dataKey={String(d.driver_number)}
            name={d.name_acronym}
            stroke={teamColor(d.team_colour)}
            strokeWidth={1.5}
            dot={false}
            isAnimationActive={false}
            connectNulls
          />
        ))}
      </LineChart>
    </ResponsiveContainer>
  )
}

function stepPos(arr: Array<{ ms: number; pos: number }>, boundaryMs: number): number | null {
  // arr is sorted ascending by ms; return last pos with ms <= boundaryMs
  let lo = 0
  let hi = arr.length
  while (lo < hi) {
    const mid = (lo + hi) >>> 1
    if (arr[mid]!.ms <= boundaryMs) lo = mid + 1
    else hi = mid
  }
  return arr[lo - 1]?.pos ?? null
}

interface TooltipProps {
  active?: boolean
  label?: number | string
}
function LapTooltip({ active, label }: TooltipProps) {
  if (!active) return null
  return (
    <div className="bg-surface border border-panel text-[10px] font-bold uppercase tracking-widest px-2 py-1">
      Lap {label}
    </div>
  )
}
