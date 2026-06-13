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
    <div className="flex items-center gap-3 px-4 py-2.5 bg-track border-t border-panel">
      <button
        onClick={toggle}
        className="w-8 h-8 bg-f1red text-white font-bold flex items-center justify-center hover:bg-red-600 transition-colors shrink-0"
        aria-label={playing ? 'Pause' : 'Play'}
      >
        {playing ? '⏸' : '▶'}
      </button>

      <span className="text-muted font-mono text-xs tabular-nums w-16 text-right shrink-0">
        {fmtTime(t)}
      </span>

      <input
        type="range"
        min={0}
        max={durationMs}
        value={Math.min(t, durationMs)}
        onChange={(e) => setT(Number(e.target.value))}
        className="flex-1 h-1 cursor-pointer"
      />

      <span className="text-muted font-mono text-xs tabular-nums w-16 shrink-0">
        {fmtTime(durationMs)}
      </span>

      <div className="flex gap-px shrink-0">
        {SPEEDS.map((s) => (
          <button
            key={s}
            onClick={() => setSpeed(s)}
            className={`px-2.5 py-1 text-[10px] font-black uppercase tracking-widest transition-colors ${
              speed === s
                ? 'bg-f1red text-white'
                : 'bg-panel text-muted hover:text-white hover:bg-[#38383f]'
            }`}
          >
            {s}×
          </button>
        ))}
      </div>
    </div>
  )
}
