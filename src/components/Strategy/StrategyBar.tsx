import type { Stint, Driver, Lap } from '@/api/types'

const COMPOUND_COLOR: Record<string, string> = {
  SOFT: '#e8002d',
  MEDIUM: '#ffd700',
  HARD: '#e0e0e0',
  INTERMEDIATE: '#39b54a',
  WET: '#0067ff',
  UNKNOWN: '#888',
}

interface Props {
  stints: Stint[]
  drivers: Driver[]
  laps: Lap[]
  sessionTimeMs: number
  sessionStartMs: number
}

export function StrategyBar({ stints, drivers, laps }: Props) {
  const driverByNumber = new Map(drivers.map((d) => [d.driver_number, d]))

  // Max lap per driver
  const maxLap = Math.max(...laps.map((l) => l.lap_number), 1)

  const driverStints = new Map<number, Stint[]>()
  for (const s of stints) {
    if (!driverStints.has(s.driver_number)) driverStints.set(s.driver_number, [])
    driverStints.get(s.driver_number)!.push(s)
  }

  const driverNumbers = [...driverStints.keys()].sort((a, b) => {
    const posA = drivers.findIndex((d) => d.driver_number === a)
    const posB = drivers.findIndex((d) => d.driver_number === b)
    return posA - posB
  })

  if (driverNumbers.length === 0) {
    return <div className="text-muted text-xs p-3">No stint data</div>
  }

  return (
    <div className="overflow-auto p-2 text-xs font-mono space-y-1">
      {driverNumbers.map((num) => {
        const driver = driverByNumber.get(num)
        const dStints = driverStints.get(num) ?? []
        return (
          <div key={num} className="flex items-center gap-2">
            <span className="w-8 text-right text-muted shrink-0">
              {driver?.name_acronym ?? num}
            </span>
            <div className="flex flex-1 h-4 rounded overflow-hidden bg-surface">
              {dStints.map((s) => {
                const pct = ((s.lap_end - s.lap_start + 1) / maxLap) * 100
                return (
                  <div
                    key={s.stint_number}
                    title={`${s.compound} L${s.lap_start}–${s.lap_end}`}
                    style={{
                      width: `${pct}%`,
                      background: COMPOUND_COLOR[s.compound] ?? '#888',
                    }}
                    className="border-r border-track last:border-r-0"
                  />
                )
              })}
            </div>
          </div>
        )
      })}
      {/* Legend */}
      <div className="flex gap-3 mt-2 pt-2 border-t border-panel">
        {Object.entries(COMPOUND_COLOR).map(([c, color]) => (
          <span key={c} className="flex items-center gap-1">
            <span className="w-3 h-3 rounded-sm inline-block" style={{ background: color }} />
            <span className="text-muted">{c[0]}</span>
          </span>
        ))}
      </div>
    </div>
  )
}
