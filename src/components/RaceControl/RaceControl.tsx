import { useMemo } from 'react'
import type { RaceControl as RaceControlEntry } from '@/api/types'

// Visual config per flag value
const FLAG_CONFIG: Record<string, { label: string; bar: string; text: string }> = {
  GREEN:           { label: 'GREEN',        bar: 'bg-green-600',   text: 'text-green-300' },
  YELLOW:          { label: 'YELLOW',       bar: 'bg-yellow-500',  text: 'text-yellow-300' },
  DOUBLE_YELLOW:   { label: 'DBL YELLOW',   bar: 'bg-yellow-400',  text: 'text-yellow-200' },
  RED:             { label: 'RED FLAG',     bar: 'bg-red-600',     text: 'text-red-300' },
  SAFETY_CAR:      { label: 'SAFETY CAR',  bar: 'bg-yellow-500',  text: 'text-yellow-300' },
  VIRTUAL_SC:      { label: 'VIRTUAL SC',  bar: 'bg-yellow-600',  text: 'text-yellow-400' },
  CHEQUERED:       { label: 'CHEQUERED',   bar: 'bg-white',       text: 'text-gray-900' },
  BLUE:            { label: 'BLUE',        bar: 'bg-blue-500',    text: 'text-blue-300' },
  BLACK_AND_WHITE: { label: 'BLK/WHT',     bar: 'bg-gray-400',    text: 'text-gray-200' },
  CLEAR:           { label: 'CLEAR',       bar: 'bg-green-600',   text: 'text-green-300' },
}

const DEFAULT_CONFIG = { label: '', bar: 'bg-[#2a2a35]', text: 'text-muted' }

interface Props {
  readonly entries: RaceControlEntry[]
  readonly sessionTimeMs: number
  readonly sessionStartMs: number
}

export function RaceControlFeed({ entries, sessionTimeMs, sessionStartMs }: Props) {
  const currentT = sessionStartMs + sessionTimeMs

  const visibleEntries = useMemo(
    () => entries.filter((e) => new Date(e.date).getTime() <= currentT),
    [entries, currentT],
  )

  // Current session flag: last flag-bearing entry
  const currentFlag = useMemo(() => {
    for (let i = visibleEntries.length - 1; i >= 0; i--) {
      const flag = visibleEntries[i]!.flag
      if (flag && flag !== '') return flag
    }
    return null
  }, [visibleEntries])

  const flagConfig = currentFlag ? (FLAG_CONFIG[currentFlag] ?? DEFAULT_CONFIG) : null

  const feed = [...visibleEntries].reverse().slice(0, 30)

  return (
    <div className="flex flex-col flex-1 min-h-0">
      {/* Persistent status banner — slim full-width strip */}
      {flagConfig && (
        <div className={`flex items-center gap-2 px-3 h-7 ${flagConfig.bar} shrink-0`}>
          <span className={`font-black text-[10px] tracking-widest uppercase ${flagConfig.text}`}>
            {flagConfig.label}
          </span>
        </div>
      )}

      {/* Scrollable message feed */}
      <div className="flex-1 overflow-auto p-2 space-y-1" style={{ touchAction: 'pan-y' }}>
        {feed.length === 0 && (
          <div className="text-muted text-xs">
            {sessionStartMs ? 'No messages yet — scrub forward' : 'Select a session'}
          </div>
        )}
        {feed.map((e, i) => {
          const cfg = FLAG_CONFIG[e.flag ?? ''] ?? DEFAULT_CONFIG
          return (
            <div key={i} className="flex gap-2 text-xs border-b border-[#2a2a35] pb-1.5 pt-0.5">
              {e.flag && (
                <span className={`shrink-0 font-black text-[10px] uppercase tracking-widest ${cfg.text}`}>
                  {cfg.label || e.flag}
                </span>
              )}
              <span className="flex-1 text-white/90 leading-snug text-[11px]">{e.message}</span>
              {e.lap_number && (
                <span className="shrink-0 text-muted tabular-nums font-mono text-[10px]">L{e.lap_number}</span>
              )}
            </div>
          )
        })}
      </div>
    </div>
  )
}
