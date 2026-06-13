export type SectorTier = 'fastest' | 'personal' | 'fast' | 'normal' | 'none'

interface Props {
  tier: SectorTier
  title?: string
}

// Coloured rectangle matching F1.com sector-status encoding:
//   fastest  = purple (session best)
//   personal = yellow (driver personal best)
//   fast     = green  (within threshold of best but not best)
//   normal   = dim    (set but unimpressive)
//   none     = empty  (not yet set)
export function SectorBar({ tier, title }: Props) {
  const colour: Record<SectorTier, string> = {
    fastest:  'bg-[#9b59f5]',
    personal: 'bg-[#f5d400]',
    fast:     'bg-[#39b54a]',
    normal:   'bg-white/30',
    none:     'bg-panel',
  }
  return (
    <div
      title={title}
      className={`w-7 h-[7px] shrink-0 ${colour[tier]}`}
    />
  )
}
