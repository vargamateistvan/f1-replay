import { useMemo } from 'react'
import type { Driver } from '@/api/types'
import { useTimeline } from '@/timeline/clock'
import { useCarDataWindow } from '@/hooks/useCarDataWindow'
import { chunkIndexFor } from '@/hooks/useLocationChunks'
import { teamColor } from '@/utils/color'

interface Props {
  readonly sessionKey: number | null
  readonly driver: Driver | null
  readonly sessionStartMs: number
  readonly onClear: () => void
}

// Live speed/throttle/brake/gear/DRS for the spotlighted driver at the playhead.
// car_data is fetched in windows around `t` for this one driver only.
export function FocusedTelemetry({ sessionKey, driver, sessionStartMs, onClear }: Props) {
  const { t } = useTimeline()
  const chunkIdx = chunkIndexFor(t)
  const { data } = useCarDataWindow(sessionKey, driver?.driver_number ?? null, sessionStartMs, chunkIdx)

  // Samples sorted by session-relative time for a step lookup.
  const samples = useMemo(
    () =>
      data
        .map((d) => ({ ms: new Date(d.date).getTime() - sessionStartMs, d }))
        .sort((a, b) => a.ms - b.ms),
    [data, sessionStartMs],
  )

  // Last sample at or before the playhead (binary search).
  const sample = useMemo(() => {
    let lo = 0
    let hi = samples.length
    while (lo < hi) {
      const mid = (lo + hi) >>> 1
      if (samples[mid]!.ms <= t) lo = mid + 1
      else hi = mid
    }
    return samples[lo - 1]?.d ?? null
  }, [samples, t])

  const color = teamColor(driver?.team_colour, '#ffffff')
  const drsOn = (sample?.drs ?? 0) >= 10

  return (
    <div className="shrink-0 border-t border-[#38383f] bg-track px-3 py-2 flex items-center gap-4 text-xs">
      <span className="flex items-center gap-2 shrink-0">
        <span className="w-[3px] h-4" style={{ background: color }} />
        <span className="font-black" style={{ color }}>{driver?.name_acronym ?? '—'}</span>
      </span>

      {sample ? (
        <>
          <Metric label="Speed" value={`${Math.round(sample.speed)}`} unit="km/h" w="w-[3ch]" />
          <Metric label="Gear" value={sample.n_gear === 0 ? 'N' : String(sample.n_gear)} w="w-[1ch]" />
          <Metric label="RPM" value={`${Math.round(sample.rpm)}`} w="w-[5ch]" />
          <Bar label="Thr" value={sample.throttle} color="#39d743" />
          <Bar label="Brk" value={sample.brake} color="#ff5252" />
          <span
            className={`px-1.5 py-0.5 text-[10px] font-black uppercase tracking-widest ${
              drsOn ? 'bg-[#39d743] text-black' : 'bg-panel text-[#636369]'
            }`}
            title="DRS"
          >
            DRS
          </span>
        </>
      ) : (
        <span className="text-muted">No telemetry at this point — scrub into the session</span>
      )}

      <button
        onClick={onClear}
        className="ml-auto shrink-0 text-muted hover:text-white text-sm leading-none"
        aria-label="Clear focus"
        title="Clear focus"
      >
        ✕
      </button>
    </div>
  )
}

function Metric({ label, value, unit, w = 'w-auto' }: { label: string; value: string; unit?: string; w?: string }) {
  return (
    <span className="flex items-baseline gap-1 shrink-0">
      <span className="text-[10px] font-bold uppercase tracking-widest text-muted">{label}</span>
      <span className={`font-mono font-bold tabular-nums text-white text-right inline-block ${w}`}>{value}</span>
      {unit && <span className="text-[10px] text-muted">{unit}</span>}
    </span>
  )
}

function Bar({ label, value, color }: { label: string; value: number; color: string }) {
  return (
    <span className="flex items-center gap-1.5 shrink-0">
      <span className="text-[10px] font-bold uppercase tracking-widest text-muted">{label}</span>
      <span className="w-12 h-2 bg-panel overflow-hidden">
        <span
          className="block h-full"
          style={{ width: `${Math.max(0, Math.min(100, value))}%`, background: color }}
        />
      </span>
    </span>
  )
}
