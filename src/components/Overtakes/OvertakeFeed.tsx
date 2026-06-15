import { useMemo } from 'react'
import type { Overtake, Driver } from '@/api/types'
import { teamColor } from '@/utils/color'

interface Props {
  readonly entries: Overtake[]
  readonly drivers: Driver[]
  readonly sessionTimeMs: number
  readonly sessionStartMs: number
}

function fmtSessionTime(ms: number) {
  const s = Math.floor(ms / 1000)
  const m = Math.floor(s / 60)
  const h = Math.floor(m / 60)
  const pad = (n: number) => String(n).padStart(2, '0')
  return h > 0 ? `${h}:${pad(m % 60)}:${pad(s % 60)}` : `${pad(m)}:${pad(s % 60)}`
}

export function OvertakeFeed({ entries, drivers, sessionTimeMs, sessionStartMs }: Props) {
  const currentT = sessionStartMs + sessionTimeMs

  const driverByNumber = useMemo(
    () => new Map(drivers.map((d) => [d.driver_number, d])),
    [drivers],
  )

  const visible = useMemo(
    () =>
      entries
        .filter((e) => new Date(e.date).getTime() <= currentT)
        .slice(-40)
        .reverse(),
    [entries, currentT],
  )

  if (visible.length === 0) {
    return (
      <div className="text-muted text-xs p-3">
        {sessionStartMs ? 'No overtakes yet — scrub forward' : 'Select a session'}
      </div>
    )
  }

  return (
    <div className="overflow-auto h-full p-2 space-y-1" style={{ touchAction: 'pan-y' }}>
      {visible.map((e, i) => {
        const over = driverByNumber.get(e.overtaking_driver_number)
        const under = driverByNumber.get(e.overtaken_driver_number)
        const overColor = teamColor(over?.team_colour)
        const underColor = teamColor(under?.team_colour)
        const ms = new Date(e.date).getTime() - sessionStartMs
        return (
          <div key={i} className="flex items-center gap-2 border-b border-[#2a2a35] pb-1.5 pt-0.5 text-xs">
            <span className="text-[#39d743] text-[10px]">▲</span>
            <span className="font-black" style={{ color: overColor }}>
              {over?.name_acronym ?? e.overtaking_driver_number}
            </span>
            <span className="text-muted text-[10px]">passed</span>
            <span className="font-black" style={{ color: underColor }}>
              {under?.name_acronym ?? e.overtaken_driver_number}
            </span>
            {e.position !== null && (
              <span className="text-muted text-[10px]">for P{e.position}</span>
            )}
            <span className="ml-auto text-muted font-mono tabular-nums text-[10px]">
              {fmtSessionTime(ms)}
            </span>
          </div>
        )
      })}
    </div>
  )
}
