import type { RaceControl as RaceControlEntry } from '@/api/types'

const FLAG_COLOR: Record<string, string> = {
  GREEN: 'text-green-400',
  YELLOW: 'text-yellow-400',
  RED: 'text-red-500',
  CHEQUERED: 'text-white',
  BLUE: 'text-blue-400',
  BLACK_AND_WHITE: 'text-gray-400',
  CLEAR: 'text-green-400',
}

interface Props {
  entries: RaceControlEntry[]
  sessionTimeMs: number
  sessionStartMs: number
}

export function RaceControlFeed({ entries, sessionTimeMs, sessionStartMs }: Props) {
  const currentT = sessionStartMs + sessionTimeMs

  const visible = entries
    .filter((e) => new Date(e.date).getTime() <= currentT)
    .slice(-20)
    .reverse()

  return (
    <div className="overflow-auto h-full text-xs font-mono p-2 space-y-1">
      {visible.length === 0 && <div className="text-muted">No race control messages yet</div>}
      {visible.map((e, i) => (
        <div key={i} className="border-b border-panel/40 pb-1">
          <span className={`font-bold mr-2 ${FLAG_COLOR[e.flag ?? ''] ?? 'text-muted'}`}>
            {e.flag ?? e.category}
          </span>
          <span className="text-white">{e.message}</span>
          {e.lap_number && (
            <span className="text-muted ml-1">L{e.lap_number}</span>
          )}
        </div>
      ))}
    </div>
  )
}
