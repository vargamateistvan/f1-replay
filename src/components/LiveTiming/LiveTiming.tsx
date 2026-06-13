import type { Driver, Position, Interval } from '@/api/types'

interface Props {
  drivers: Driver[]
  positions: Position[]
  intervals: Interval[]
  sessionTimeMs: number
  sessionStartMs: number
}

function fmtGap(val: number | null) {
  if (val === null) return '—'
  if (val === 0) return 'LEADER'
  return `+${val.toFixed(3)}`
}

export function LiveTiming({ drivers, positions, intervals, sessionTimeMs, sessionStartMs }: Props) {
  const currentT = sessionStartMs + sessionTimeMs

  // Latest position per driver at current time
  const posMap = new Map<number, number>()
  for (const p of positions) {
    const t = new Date(p.date).getTime()
    if (t <= currentT) posMap.set(p.driver_number, p.position)
  }

  // Latest interval per driver at current time
  const intMap = new Map<number, Interval>()
  for (const i of intervals) {
    const t = new Date(i.date).getTime()
    if (t <= currentT) intMap.set(i.driver_number, i)
  }

  const driverByNumber = new Map(drivers.map((d) => [d.driver_number, d]))

  const sorted = [...posMap.entries()]
    .sort((a, b) => a[1] - b[1])

  if (sorted.length === 0) {
    return (
      <div className="text-muted text-xs p-3">No timing data yet</div>
    )
  }

  return (
    <div className="text-xs font-mono overflow-auto h-full">
      <table className="w-full border-collapse">
        <thead>
          <tr className="text-muted border-b border-panel">
            <th className="text-left py-1 px-2">P</th>
            <th className="text-left py-1 px-2">Driver</th>
            <th className="text-right py-1 px-2">Gap</th>
            <th className="text-right py-1 px-2">Int</th>
          </tr>
        </thead>
        <tbody>
          {sorted.map(([num, pos]) => {
            const driver = driverByNumber.get(num)
            const intData = intMap.get(num)
            const color = driver ? `#${driver.team_colour}` : '#fff'
            return (
              <tr key={num} className="border-b border-panel/50 hover:bg-panel/30 transition-colors">
                <td className="py-1 px-2 text-muted">{pos}</td>
                <td className="py-1 px-2">
                  <span
                    className="inline-block w-1 h-4 mr-1 rounded-sm align-middle"
                    style={{ background: color }}
                  />
                  {driver?.name_acronym ?? num}
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
