import { useTimeline } from '@/timeline/clock'

const SPEEDS = [1, 2, 4, 8, 16]

interface Props {
  durationMs: number
}

function fmtTime(ms: number) {
  const s = Math.floor(ms / 1000)
  const m = Math.floor(s / 60)
  const h = Math.floor(m / 60)
  const pad = (n: number) => String(n).padStart(2, '0')
  return h > 0 ? `${h}:${pad(m % 60)}:${pad(s % 60)}` : `${pad(m)}:${pad(s % 60)}`
}

export function PlaybackBar({ durationMs }: Props) {
  const { t, playing, speed, toggle, setT, setSpeed } = useTimeline()

  return (
    <div className="flex items-center gap-3 px-4 py-2 bg-surface border-t border-panel text-sm">
      <button
        onClick={toggle}
        className="w-8 h-8 rounded bg-f1red text-white font-bold flex items-center justify-center hover:bg-red-600 transition-colors"
      >
        {playing ? '⏸' : '▶'}
      </button>

      <span className="text-muted w-24 text-right tabular-nums">{fmtTime(t)}</span>

      <input
        type="range"
        min={0}
        max={durationMs}
        value={Math.min(t, durationMs)}
        onChange={(e) => setT(Number(e.target.value))}
        className="flex-1 accent-f1red"
      />

      <span className="text-muted w-24 tabular-nums">{fmtTime(durationMs)}</span>

      <div className="flex gap-1 ml-2">
        {SPEEDS.map((s) => (
          <button
            key={s}
            onClick={() => setSpeed(s)}
            className={`px-2 py-0.5 rounded text-xs transition-colors ${
              speed === s ? 'bg-f1red text-white' : 'bg-panel text-muted hover:text-white'
            }`}
          >
            {s}×
          </button>
        ))}
      </div>
    </div>
  )
}
