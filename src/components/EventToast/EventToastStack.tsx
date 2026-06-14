import { useState } from 'react'
import type { ActiveToast } from '@/hooks/useEventToasts'
import type { Driver } from '@/api/types'
import type {
  RadioPayload,
  FlagPayload,
  OvertakePayload,
  PitPayload,
  FastestLapPayload,
} from '@/timeline/events'
import { teamColor } from '@/utils/color'

interface Props {
  toasts: ActiveToast[]
  drivers: Driver[]
  onDismiss: (id: string) => void
}

const FLAG_COLORS: Record<string, { bg: string; text: string; label: string }> = {
  YELLOW:        { bg: '#f5d400', text: '#000', label: 'YELLOW' },
  DOUBLE_YELLOW: { bg: '#f5d400', text: '#000', label: 'DBL YELLOW' },
  RED:           { bg: '#e8002d', text: '#fff', label: 'RED FLAG' },
  SAFETY_CAR:    { bg: '#f5a623', text: '#000', label: 'SAFETY CAR' },
  VIRTUAL_SC:    { bg: '#f5a623', text: '#000', label: 'VIRTUAL SC' },
  CHEQUERED:     { bg: '#fff',    text: '#000', label: 'CHEQUERED' },
  BLUE:          { bg: '#4da6ff', text: '#000', label: 'BLUE FLAG' },
}

export function EventToastStack({ toasts, drivers, onDismiss }: Props) {
  const driverMap = new Map(drivers.map((d) => [d.driver_number, d]))

  if (toasts.length === 0) return null

  return (
    <>
      <style>{`
        @keyframes toast-in {
          from { opacity: 0; transform: translateX(24px); }
          to   { opacity: 1; transform: translateX(0); }
        }
        .toast-in { animation: toast-in 0.18s ease-out both; }
      `}</style>
      <div className="absolute top-3 right-3 z-30 flex flex-col gap-2 pointer-events-none w-[min(260px,calc(100vw-1.5rem))]">
        {toasts.map((at) => (
          <ToastCard
            key={at.event.id}
            at={at}
            driverMap={driverMap}
            onDismiss={onDismiss}
          />
        ))}
      </div>
    </>
  )
}

function ToastCard({
  at,
  driverMap,
  onDismiss,
}: {
  at: ActiveToast
  driverMap: Map<number, Driver>
  onDismiss: (id: string) => void
}) {
  const { event } = at

  if (event.kind === 'radio') {
    return <RadioToast at={at} driverMap={driverMap} onDismiss={onDismiss} />
  }
  if (event.kind === 'flag') {
    return <FlagToast at={at} onDismiss={onDismiss} />
  }
  if (event.kind === 'overtake') {
    return <OvertakeToast at={at} driverMap={driverMap} onDismiss={onDismiss} />
  }
  if (event.kind === 'pit') {
    return <PitToast at={at} driverMap={driverMap} onDismiss={onDismiss} />
  }
  if (event.kind === 'fastest_lap') {
    return <FastestLapToast at={at} driverMap={driverMap} onDismiss={onDismiss} />
  }
  return null
}

// ─── Radio ───────────────────────────────────────────────────────────────────

function RadioToast({
  at,
  driverMap,
  onDismiss,
}: {
  at: ActiveToast
  driverMap: Map<number, Driver>
  onDismiss: (id: string) => void
}) {
  const [playing, setPlaying] = useState(false)
  const p = at.event.payload as RadioPayload
  const driver = driverMap.get(p.driverNumber)
  const color = teamColor(driver?.team_colour)

  return (
    <div className="toast-in pointer-events-auto bg-[#1f1f27] border border-[#38383f] shadow-xl flex overflow-hidden w-full">
      <span className="w-[3px] shrink-0" style={{ background: color }} />
      <div className="flex-1 px-2.5 py-2 min-w-0">
        <div className="flex items-center justify-between gap-2">
          <span className="text-[10px] font-black uppercase tracking-widest" style={{ color }}>
            {driver?.name_acronym ?? p.driverNumber}
          </span>
          <span className="text-[9px] text-muted uppercase tracking-widest">Radio</span>
        </div>
        <div className="mt-1.5 flex items-center gap-2">
          <button
            onClick={() => setPlaying((v) => !v)}
            className={`text-[10px] font-black uppercase tracking-widest px-2 py-0.5 transition-colors ${playing ? 'bg-f1red text-white' : 'bg-panel text-muted hover:text-white'}`}
          >
            {playing ? '⏹ Stop' : '▶ Play'}
          </button>
          {playing && (
            <audio
              key={p.recordingUrl}
              src={p.recordingUrl}
              autoPlay
              onEnded={() => setPlaying(false)}
              className="hidden"
            />
          )}
        </div>
      </div>
      <button
        onClick={() => onDismiss(at.event.id)}
        className="px-2 text-muted hover:text-white text-xs self-start pt-1.5 pointer-events-auto"
        aria-label="Dismiss"
      >
        ×
      </button>
    </div>
  )
}

// ─── Flag / Race Control ─────────────────────────────────────────────────────

function FlagToast({
  at,
  onDismiss,
}: {
  at: ActiveToast
  onDismiss: (id: string) => void
}) {
  const p = at.event.payload as FlagPayload
  const cfg = FLAG_COLORS[p.flag] ?? { bg: '#2a2a35', text: '#fff', label: p.flag }
  const isPenalty = /penalty|investigation/i.test(p.message)

  return (
    <div className="toast-in pointer-events-auto bg-[#1f1f27] border border-[#38383f] shadow-xl overflow-hidden w-full">
      <div className="flex items-center gap-2 px-2.5 py-1" style={{ background: cfg.bg }}>
        <span className="text-[10px] font-black uppercase tracking-widest" style={{ color: cfg.text }}>
          {isPenalty && !p.flag ? '⚠ PENALTY' : cfg.label}
        </span>
        {p.lapNumber && (
          <span className="text-[9px] font-mono ml-auto" style={{ color: cfg.text, opacity: 0.75 }}>
            L{p.lapNumber}
          </span>
        )}
      </div>
      <div className="flex items-start gap-1 px-2.5 py-1.5">
        <p className="flex-1 text-[10px] text-white/80 leading-snug line-clamp-2">{p.message}</p>
        <button
          onClick={() => onDismiss(at.event.id)}
          className="text-muted hover:text-white text-xs shrink-0 -mt-0.5"
          aria-label="Dismiss"
        >
          ×
        </button>
      </div>
    </div>
  )
}

// ─── Overtake ────────────────────────────────────────────────────────────────

function OvertakeToast({
  at,
  driverMap,
  onDismiss,
}: {
  at: ActiveToast
  driverMap: Map<number, Driver>
  onDismiss: (id: string) => void
}) {
  const p = at.event.payload as OvertakePayload
  const overtaking = driverMap.get(p.overtaking)
  const overtaken = driverMap.get(p.overtaken)
  const color = teamColor(overtaking?.team_colour)

  return (
    <div className="toast-in pointer-events-auto bg-[#1f1f27] border border-[#38383f] shadow-xl flex items-center gap-2 px-2.5 py-2 overflow-hidden w-full">
      <span className="w-[3px] self-stretch shrink-0" style={{ background: color }} />
      <div className="flex-1 min-w-0">
        <div className="text-[9px] text-muted uppercase tracking-widest mb-0.5">Overtake</div>
        <div className="flex items-center gap-1.5 font-black text-[13px]">
          <span style={{ color }}>{overtaking?.name_acronym ?? p.overtaking}</span>
          <span className="text-muted text-[10px]">▸</span>
          <span className="text-white/60">{overtaken?.name_acronym ?? p.overtaken}</span>
          {p.position && (
            <span className="ml-1 text-[10px] font-bold text-muted">P{p.position}</span>
          )}
        </div>
      </div>
      <button
        onClick={() => onDismiss(at.event.id)}
        className="text-muted hover:text-white text-xs self-start"
        aria-label="Dismiss"
      >
        ×
      </button>
    </div>
  )
}

// ─── Pit ─────────────────────────────────────────────────────────────────────

function PitToast({
  at,
  driverMap,
  onDismiss,
}: {
  at: ActiveToast
  driverMap: Map<number, Driver>
  onDismiss: (id: string) => void
}) {
  const p = at.event.payload as PitPayload
  const driver = driverMap.get(p.driverNumber)
  const color = teamColor(driver?.team_colour)

  return (
    <div className="toast-in pointer-events-auto bg-[#1f1f27] border border-[#38383f] shadow-xl flex items-center gap-2 px-2.5 py-2 overflow-hidden w-full">
      <span className="w-[3px] self-stretch shrink-0" style={{ background: color }} />
      <div className="flex-1 min-w-0">
        <div className="text-[9px] text-muted uppercase tracking-widest mb-0.5">Pit Stop · L{p.lapNumber}</div>
        <div className="flex items-center gap-2">
          <span className="font-black text-[13px]" style={{ color }}>
            {driver?.name_acronym ?? p.driverNumber}
          </span>
          {p.pitDuration !== null && (
            <span className="text-white/70 text-[11px] font-mono tabular-nums">
              {p.pitDuration.toFixed(1)}s
            </span>
          )}
        </div>
      </div>
      <button
        onClick={() => onDismiss(at.event.id)}
        className="text-muted hover:text-white text-xs self-start"
        aria-label="Dismiss"
      >
        ×
      </button>
    </div>
  )
}

// ─── Fastest lap ─────────────────────────────────────────────────────────────

function fmtLapTime(sec: number): string {
  const m = Math.floor(sec / 60)
  const s = (sec % 60).toFixed(3).padStart(6, '0')
  return m > 0 ? `${m}:${s}` : s
}

function FastestLapToast({
  at,
  driverMap,
  onDismiss,
}: {
  at: ActiveToast
  driverMap: Map<number, Driver>
  onDismiss: (id: string) => void
}) {
  const p = at.event.payload as FastestLapPayload
  const driver = driverMap.get(p.driverNumber)

  return (
    <div
      className="toast-in pointer-events-auto shadow-xl overflow-hidden w-full"
      style={{ background: '#1a0e2e', border: '1px solid #9b59f5' }}
    >
      <div className="flex items-center gap-2 px-2.5 py-1" style={{ background: '#9b59f5' }}>
        <span className="text-[10px] font-black uppercase tracking-widest text-white">
          Fastest Lap
        </span>
        <span className="text-[9px] font-mono text-white/75 ml-auto">L{p.lapNumber}</span>
      </div>
      <div className="flex items-center justify-between px-2.5 py-2">
        <span className="font-black text-[13px]" style={{ color: '#9b59f5' }}>
          {driver?.name_acronym ?? p.driverNumber}
        </span>
        <span className="font-mono text-[12px] tabular-nums" style={{ color: '#9b59f5' }}>
          {fmtLapTime(p.lapTime)}
        </span>
        <button
          onClick={() => onDismiss(at.event.id)}
          className="text-[#9b59f5]/60 hover:text-[#9b59f5] text-xs ml-2"
          aria-label="Dismiss"
        >
          ×
        </button>
      </div>
    </div>
  )
}
