import { useState, useRef, type ReactNode } from 'react'
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
        @keyframes toast-slide-right {
          from { opacity: 0; transform: translateX(24px); }
          to   { opacity: 1; transform: translateX(0); }
        }
        @keyframes toast-slide-up {
          from { opacity: 0; transform: translateY(16px); }
          to   { opacity: 1; transform: translateY(0); }
        }
        .toast-in { animation: toast-slide-right 0.18s ease-out both; }
        @media (max-width: 767px) {
          .toast-in { animation: toast-slide-up 0.18s ease-out both; }
        }
      `}</style>

      {/*
        Mobile  : stack from the bottom, newest at bottom, slide-up.
        Desktop : top-right corner, newest at top, slide-right.
      */}
      <div
        className={[
          'absolute z-30 pointer-events-none flex gap-2',
          // mobile
          'flex-col-reverse bottom-3 left-3 right-3',
          // desktop overrides
          'md:flex-col md:bottom-auto md:top-3 md:left-auto md:right-3 md:w-[260px]',
        ].join(' ')}
      >
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

// ── Swipeable wrapper ─────────────────────────────────────────────────────────
// Swipe right (or left) on mobile to dismiss without needing to hit the × button.

function SwipeCard({
  id,
  onDismiss,
  children,
}: {
  id: string
  onDismiss: (id: string) => void
  children: ReactNode
}) {
  const startXRef = useRef<number | null>(null)
  const [offset, setOffset] = useState(0)
  const [leaving, setLeaving] = useState(false)

  function onTouchStart(e: React.TouchEvent) {
    startXRef.current = e.touches[0]!.clientX
  }

  function onTouchMove(e: React.TouchEvent) {
    if (startXRef.current === null) return
    const dx = e.touches[0]!.clientX - startXRef.current
    setOffset(dx)
  }

  function onTouchEnd() {
    if (Math.abs(offset) > 80) {
      setLeaving(true)
      setTimeout(() => onDismiss(id), 180)
    } else {
      setOffset(0)
    }
    startXRef.current = null
  }

  return (
    <div
      onTouchStart={onTouchStart}
      onTouchMove={onTouchMove}
      onTouchEnd={onTouchEnd}
      style={{
        transform: leaving
          ? `translateX(${offset > 0 ? '120%' : '-120%'})`
          : `translateX(${offset}px)`,
        opacity: leaving ? 0 : Math.max(0, 1 - Math.abs(offset) / 160),
        transition: offset === 0 || leaving ? 'transform 0.18s ease, opacity 0.18s ease' : 'none',
        touchAction: 'pan-y',
      }}
    >
      {children}
    </div>
  )
}

// ── Card dispatcher ───────────────────────────────────────────────────────────

function ToastCard({
  at,
  driverMap,
  onDismiss,
}: {
  at: ActiveToast
  driverMap: Map<number, Driver>
  onDismiss: (id: string) => void
}) {
  const inner = (() => {
    if (at.event.kind === 'radio')       return <RadioToast at={at} driverMap={driverMap} onDismiss={onDismiss} />
    if (at.event.kind === 'flag')        return <FlagToast at={at} onDismiss={onDismiss} />
    if (at.event.kind === 'overtake')    return <OvertakeToast at={at} driverMap={driverMap} onDismiss={onDismiss} />
    if (at.event.kind === 'pit')         return <PitToast at={at} driverMap={driverMap} onDismiss={onDismiss} />
    if (at.event.kind === 'fastest_lap') return <FastestLapToast at={at} driverMap={driverMap} onDismiss={onDismiss} />
    return null
  })()

  if (!inner) return null

  return (
    <SwipeCard id={at.event.id} onDismiss={onDismiss}>
      <div className="toast-in w-full">{inner}</div>
    </SwipeCard>
  )
}

// ── Shared dismiss button ─────────────────────────────────────────────────────
// 44px tap target on mobile, compact on desktop.

function DismissBtn({ id, onDismiss }: { id: string; onDismiss: (id: string) => void }) {
  return (
    <button
      onClick={() => onDismiss(id)}
      className="flex items-center justify-center shrink-0 pointer-events-auto
                 w-11 h-11 md:w-7 md:h-7
                 text-muted hover:text-white transition-colors text-base md:text-xs"
      style={{ touchAction: 'manipulation' }}
      aria-label="Dismiss"
    >
      ×
    </button>
  )
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
    <div className="pointer-events-auto bg-[#1f1f27] border border-[#38383f] shadow-xl flex overflow-hidden w-full">
      <span className="w-[3px] shrink-0" style={{ background: color }} />
      <div className="flex-1 px-3 py-2.5 min-w-0">
        <div className="flex items-center justify-between gap-2">
          <span className="text-[11px] font-black uppercase tracking-widest" style={{ color }}>
            {driver?.name_acronym ?? p.driverNumber}
          </span>
          <span className="text-[10px] text-muted uppercase tracking-widest">Radio</span>
        </div>
        <div className="mt-2 flex items-center gap-2">
          <button
            onClick={() => setPlaying((v) => !v)}
            style={{ touchAction: 'manipulation' }}
            className={`text-[11px] font-black uppercase tracking-widest px-3 py-1.5 transition-colors ${playing ? 'bg-f1red text-white' : 'bg-panel text-muted hover:text-white'}`}
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
      <DismissBtn id={at.event.id} onDismiss={onDismiss} />
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
    <div className="pointer-events-auto bg-[#1f1f27] border border-[#38383f] shadow-xl overflow-hidden w-full">
      <div className="flex items-center gap-2 px-3 py-1.5" style={{ background: cfg.bg }}>
        <span className="text-[11px] font-black uppercase tracking-widest" style={{ color: cfg.text }}>
          {isPenalty && !p.flag ? '⚠ PENALTY' : cfg.label}
        </span>
        {p.lapNumber && (
          <span className="text-[10px] font-mono ml-auto" style={{ color: cfg.text, opacity: 0.75 }}>
            L{p.lapNumber}
          </span>
        )}
      </div>
      <div className="flex items-center gap-1 px-3 py-2">
        <p className="flex-1 text-[11px] text-white/80 leading-snug line-clamp-2">{p.message}</p>
        <DismissBtn id={at.event.id} onDismiss={onDismiss} />
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
    <div className="pointer-events-auto bg-[#1f1f27] border border-[#38383f] shadow-xl flex items-center overflow-hidden w-full">
      <span className="w-[3px] self-stretch shrink-0" style={{ background: color }} />
      <div className="flex-1 min-w-0 px-3 py-2.5">
        <div className="text-[10px] text-muted uppercase tracking-widest mb-1">Overtake</div>
        <div className="flex items-center gap-1.5 font-black text-[14px]">
          <span style={{ color }}>{overtaking?.name_acronym ?? p.overtaking}</span>
          <span className="text-muted text-[11px]">▸</span>
          <span className="text-white/60">{overtaken?.name_acronym ?? p.overtaken}</span>
          {p.position && (
            <span className="ml-1 text-[11px] font-bold text-muted">P{p.position}</span>
          )}
        </div>
      </div>
      <DismissBtn id={at.event.id} onDismiss={onDismiss} />
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
    <div className="pointer-events-auto bg-[#1f1f27] border border-[#38383f] shadow-xl flex items-center overflow-hidden w-full">
      <span className="w-[3px] self-stretch shrink-0" style={{ background: color }} />
      <div className="flex-1 min-w-0 px-3 py-2.5">
        <div className="text-[10px] text-muted uppercase tracking-widest mb-1">Pit Stop · L{p.lapNumber}</div>
        <div className="flex items-center gap-2">
          <span className="font-black text-[14px]" style={{ color }}>
            {driver?.name_acronym ?? p.driverNumber}
          </span>
          {p.pitDuration !== null && (
            <span className="text-white/70 text-[12px] font-mono tabular-nums">
              {p.pitDuration.toFixed(1)}s
            </span>
          )}
        </div>
      </div>
      <DismissBtn id={at.event.id} onDismiss={onDismiss} />
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
      className="pointer-events-auto shadow-xl overflow-hidden w-full"
      style={{ background: '#1a0e2e', border: '1px solid #9b59f5' }}
    >
      <div className="flex items-center gap-2 px-3 py-1.5" style={{ background: '#9b59f5' }}>
        <span className="text-[11px] font-black uppercase tracking-widest text-white">
          Fastest Lap
        </span>
        <span className="text-[10px] font-mono text-white/75 ml-auto">L{p.lapNumber}</span>
      </div>
      <div className="flex items-center px-3 py-2.5">
        <span className="font-black text-[14px] flex-1" style={{ color: '#9b59f5' }}>
          {driver?.name_acronym ?? p.driverNumber}
        </span>
        <span className="font-mono text-[13px] tabular-nums" style={{ color: '#9b59f5' }}>
          {fmtLapTime(p.lapTime)}
        </span>
        <DismissBtn id={at.event.id} onDismiss={onDismiss} />
      </div>
    </div>
  )
}
