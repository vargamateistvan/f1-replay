import { useMemo } from 'react'
import {
  LineChart, Line, XAxis, YAxis, CartesianGrid, Tooltip,
  ResponsiveContainer, ReferenceLine,
} from 'recharts'
import type { Driver, Interval } from '@/api/types'
import { teamColor } from '@/utils/color'

// Cap the Y axis so lapped cars don't collapse the interesting battle zone.
const MAX_GAP_SEC = 120

interface Props {
  readonly drivers: Driver[]
  readonly intervals: Interval[]
  readonly sessionTimeMs: number
  readonly sessionStartMs: number
}

// Gap-to-leader over session time. Each line is one driver; Y=0 is the leader,
// increasing values mean further behind. Derived from the intervals series already
// loaded for Live Timing — no extra fetch needed.
export function GapChart({ drivers, intervals, sessionTimeMs, sessionStartMs }: Props) {
  // Per-driver sorted arrays of {ms, gap}. Strings like "1 LAP" are excluded;
  // gaps are capped at MAX_GAP_SEC so lapped cars don't distort the Y axis.
  const byDriver = useMemo(() => {
    const m = new Map<number, Array<{ ms: number; gap: number }>>()
    for (const iv of intervals) {
      if (typeof iv.gap_to_leader !== 'number') continue
      const ms = new Date(iv.date).getTime() - sessionStartMs
      if (ms < 0) continue
      let arr = m.get(iv.driver_number)
      if (!arr) { arr = []; m.set(iv.driver_number, arr) }
      arr.push({ ms, gap: Math.min(iv.gap_to_leader, MAX_GAP_SEC) })
    }
    for (const arr of m.values()) arr.sort((a, b) => a.ms - b.ms)
    return m
  }, [intervals, sessionStartMs])

  // Shared time axis: bucket all interval timestamps to the nearest 5 s so
  // different drivers' rows align on the same x values.
  const timeBuckets = useMemo(() => {
    const seen = new Set<number>()
    for (const iv of intervals) {
      const ms = Math.round((new Date(iv.date).getTime() - sessionStartMs) / 5_000) * 5_000
      if (ms >= 0) seen.add(ms)
    }
    return Array.from(seen).sort((a, b) => a - b)
  }, [intervals, sessionStartMs])

  // Build one chart row per time bucket up to the current playhead.
  const rows = useMemo(() => {
    if (timeBuckets.length === 0 || byDriver.size === 0) return []
    return timeBuckets
      .filter((ms) => ms <= sessionTimeMs)
      .map((ms) => {
        const row: Record<string, number> = { ms }
        for (const [num, arr] of byDriver) {
          const gap = stepGap(arr, ms)
          if (gap !== null) row[String(num)] = gap
        }
        return row
      })
  }, [timeBuckets, sessionTimeMs, byDriver])

  if (rows.length === 0) {
    return (
      <div className="flex items-center justify-center h-full text-muted text-sm">
        No gap data available yet
      </div>
    )
  }

  return (
    <ResponsiveContainer width="100%" height="100%">
      <LineChart data={rows} margin={{ top: 8, right: 12, left: 0, bottom: 4 }}>
        <CartesianGrid stroke="#2a2a35" />
        <XAxis
          dataKey="ms"
          type="number"
          domain={['dataMin', 'dataMax']}
          tickFormatter={msToMin}
          tick={{ fill: '#636369', fontSize: 10 }}
          axisLine={{ stroke: '#38383f' }}
          tickLine={false}
        />
        <YAxis
          domain={[0, MAX_GAP_SEC]}
          width={32}
          tick={{ fill: '#636369', fontSize: 10 }}
          axisLine={false}
          tickLine={false}
          tickFormatter={(v: number) => `${v}s`}
        />
        <Tooltip content={<GapTooltip />} />
        <ReferenceLine x={sessionTimeMs} stroke="#E8002D" strokeWidth={1} />
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

// Binary search: last gap at or before boundaryMs. Same pattern as LapChart.stepPos.
function stepGap(arr: Array<{ ms: number; gap: number }>, boundaryMs: number): number | null {
  let lo = 0, hi = arr.length
  while (lo < hi) {
    const mid = (lo + hi) >>> 1
    if (arr[mid]!.ms <= boundaryMs) lo = mid + 1
    else hi = mid
  }
  return arr[lo - 1]?.gap ?? null
}

function msToMin(ms: number): string {
  const m = Math.floor(ms / 60_000)
  const s = Math.floor((ms % 60_000) / 1_000)
  return s === 0 ? `${m}'` : `${m}'${s.toString().padStart(2, '0')}`
}

interface TooltipPayload {
  name: string
  value: number
  stroke: string
}

interface GapTooltipProps {
  active?: boolean
  label?: number
  payload?: TooltipPayload[]
}

function GapTooltip({ active, label, payload }: GapTooltipProps) {
  if (!active || !payload?.length || label == null) return null
  const sorted = [...payload].sort((a, b) => a.value - b.value)
  return (
    <div className="bg-surface border border-panel px-2 py-1.5 text-[10px]">
      <div className="text-muted mb-1 font-bold uppercase tracking-widest">
        {msToMin(label)}
      </div>
      {sorted.map((p) => (
        <div key={p.name} className="flex gap-2 items-center">
          <span style={{ color: p.stroke }} className="font-bold w-8">
            {p.name}
          </span>
          <span className="text-white">+{p.value.toFixed(3)}s</span>
        </div>
      ))}
    </div>
  )
}
