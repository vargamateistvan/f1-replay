import type { RaceControl } from '@/api/types'

interface Props {
  entries: RaceControl[]
  sessionTimeMs: number
  sessionStartMs: number
}

interface BannerStyle {
  bg: string
  text: string
  label: string
}

const FLAG_STYLES: Record<string, BannerStyle> = {
  YELLOW:              { bg: '#f5d400', text: '#000', label: '⚑ YELLOW FLAG' },
  DOUBLE_YELLOW:       { bg: '#f5d400', text: '#000', label: '⚑⚑ DOUBLE YELLOW' },
  RED:                 { bg: '#e8002d', text: '#fff', label: '⚑ RED FLAG' },
  SAFETY_CAR:          { bg: '#f5a623', text: '#000', label: '🚗 SAFETY CAR' },
  VIRTUAL_SAFETY_CAR:  { bg: '#f5a623', text: '#000', label: 'VSC DEPLOYED' },
  CHEQUERED:           { bg: '#fff',    text: '#000', label: '🏁 CHEQUERED FLAG' },
  BLACK_AND_WHITE:     { bg: '#888',    text: '#fff', label: '◩ BLACK & WHITE FLAG' },
}

// The most recent flag-type race control message at or before the current time.
function activeFlag(
  entries: RaceControl[],
  currentT: number,
): BannerStyle | null {
  let last: RaceControl | null = null
  for (const e of entries) {
    if (e.flag === null) continue
    if (new Date(e.date).getTime() > currentT) break
    last = e
  }
  if (!last || !last.flag) return null
  if (last.flag === 'CLEAR' || last.flag === 'GREEN') return null
  return FLAG_STYLES[last.flag] ?? null
}

export function FlagBanner({ entries, sessionTimeMs, sessionStartMs }: Props) {
  const currentT = sessionStartMs + sessionTimeMs
  const banner = activeFlag(entries, currentT)

  if (!banner) return null

  return (
    <div
      className="w-full px-4 py-1 flex items-center justify-center gap-2 animate-pulse-slow"
      style={{ backgroundColor: banner.bg, color: banner.text }}
    >
      <span className="text-[11px] font-black uppercase tracking-[0.25em]">
        {banner.label}
      </span>
    </div>
  )
}
