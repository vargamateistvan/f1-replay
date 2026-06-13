import type { Stint } from '@/api/types'

interface Props {
  stints: Stint[]
  driverNumber: number
  currentLap: number | null
}

type Compound = Stint['compound']

const COMPOUND_STYLE: Record<Compound, { bg: string; letter: string }> = {
  SOFT:         { bg: '#e8002d', letter: 'S' },
  MEDIUM:       { bg: '#f5a623', letter: 'M' },
  HARD:         { bg: '#e0e0e0', letter: 'H' },
  INTERMEDIATE: { bg: '#39b54a', letter: 'I' },
  WET:          { bg: '#1e90ff', letter: 'W' },
  UNKNOWN:      { bg: '#555',    letter: '?' },
}

export function TyreBadge({ stints, driverNumber, currentLap }: Props) {
  const lap = currentLap ?? 0
  const active = stints
    .filter((s) => s.driver_number === driverNumber)
    .find((s) => s.lap_start <= lap && lap <= (s.lap_end ?? 999))

  if (!active) return <span className="text-muted text-[10px]">—</span>

  const { bg, letter } = COMPOUND_STYLE[active.compound] ?? COMPOUND_STYLE.UNKNOWN
  const age = lap - active.lap_start + (active.tyre_age_at_start ?? 0)

  return (
    <span className="flex items-center gap-1">
      <span
        className="w-5 h-5 rounded-full flex items-center justify-center text-[9px] font-black shrink-0"
        style={{ backgroundColor: bg, color: active.compound === 'HARD' ? '#000' : '#fff' }}
        title={active.compound}
      >
        {letter}
      </span>
      <span className="text-[10px] text-muted tabular-nums">{age}</span>
    </span>
  )
}
