import { useMemo } from 'react'
import { useTrackOutline, locationToSvg } from '@/hooks/useTrackMap'
import { buildIndex, interpolateXY } from '@/timeline/interpolate'
import { useTimeline } from '@/timeline/clock'
import { teamColor } from '@/utils/color'
import type { Driver, Location } from '@/api/types'
import { TRACK_SVG_W as SVG_W, TRACK_SVG_H as SVG_H, TRACK_SVG_PAD as PAD } from '@/constants'

interface Props {
  readonly sessionKey: number | null
  readonly drivers: Driver[]
  readonly locationData: Location[]
  readonly sessionStartMs: number
}

export function TrackMap({ sessionKey, drivers, locationData, sessionStartMs }: Props) {
  // TrackMap owns its t subscription so the animation loop is isolated here
  const { t } = useTimeline()

  const firstDriver = drivers[0] ?? null
  const { data: outline, isPending } = useTrackOutline(
    sessionKey,
    firstDriver?.driver_number ?? null,
  )

  const driverByNumber = useMemo(
    () => new Map(drivers.map((d) => [d.driver_number, d])),
    [drivers],
  )

  // Group location points by driver and build a typed-array index per driver.
  // Rebuilds only when locationData or sessionStartMs changes (not on every frame).
  const locationIndexes = useMemo(() => {
    const byDriver = new Map<number, Array<{ t: number; x: number; y: number }>>()
    for (const loc of locationData) {
      const relT = new Date(loc.date).getTime() - sessionStartMs
      let arr = byDriver.get(loc.driver_number)
      if (!arr) { arr = []; byDriver.set(loc.driver_number, arr) }
      arr.push({ t: relT, x: loc.x, y: loc.y })
    }
    const indexes = new Map<number, ReturnType<typeof buildIndex>>()
    for (const [num, pts] of byDriver) {
      pts.sort((a, b) => a.t - b.t)
      indexes.set(num, buildIndex(pts))
    }
    return indexes
  }, [locationData, sessionStartMs])

  if (!sessionKey) {
    return (
      <div className="flex items-center justify-center w-full h-full text-muted text-sm">
        Select a session to load the track
      </div>
    )
  }

  if (isPending) {
    return (
      <div className="flex items-center justify-center w-full h-full text-muted text-sm animate-pulse">
        Loading track outline…
      </div>
    )
  }

  if (!outline) {
    return (
      <div className="flex items-center justify-center w-full h-full text-muted text-sm">
        No location data available for this session
      </div>
    )
  }

  const { points, bounds } = outline
  const innerW = SVG_W - PAD * 2
  const innerH = SVG_H - PAD * 2

  const pathData =
    points
      .map((p, i) => {
        const { sx, sy } = locationToSvg(p.x, p.y, bounds, innerW, innerH)
        return `${i === 0 ? 'M' : 'L'}${(sx + PAD).toFixed(1)},${(sy + PAD).toFixed(1)}`
      })
      .join(' ') + ' Z'

  // Interpolate each driver's position at the current playhead time t (session-relative ms)
  const carPositions: Array<{ num: number; x: number; y: number }> = []
  for (const [num, idx] of locationIndexes) {
    const pos = interpolateXY(idx, t)
    if (pos) carPositions.push({ num, ...pos })
  }

  return (
    <svg
      viewBox={`0 0 ${SVG_W} ${SVG_H}`}
      className="w-full h-full"
      style={{ background: '#15151e' }}
    >
      {/* Track surface: thick grey base + thin white highlight */}
      <path d={pathData} fill="none" stroke="#38383f" strokeWidth={11} strokeLinecap="round" strokeLinejoin="round" />
      <path d={pathData} fill="none" stroke="#4a4a55" strokeWidth={7} strokeLinecap="round" strokeLinejoin="round" />
      <path d={pathData} fill="none" stroke="#ffffff" strokeWidth={1.5} strokeLinecap="round" strokeLinejoin="round" strokeOpacity={0.15} />

      {/* Car dots */}
      {carPositions.map(({ num, x, y }) => {
        const driver = driverByNumber.get(num)
        const color = teamColor(driver?.team_colour, '#ffffff')
        const { sx, sy } = locationToSvg(x, y, bounds, innerW, innerH)
        return (
          <g key={num} transform={`translate(${(sx + PAD).toFixed(1)},${(sy + PAD).toFixed(1)})`}>
            <circle r={4.5} fill={color} stroke="#ffffff" strokeWidth={1.2} strokeOpacity={0.6} />
            <text x={7} y={-5} fontSize={8} fill={color} fontFamily="Inter, sans-serif" fontWeight="900" letterSpacing="0.04em">
              {driver?.name_acronym ?? num}
            </text>
          </g>
        )
      })}

      {/* No-data hint */}
      {locationIndexes.size === 0 && (
        <text x={SVG_W / 2} y={SVG_H / 2} textAnchor="middle" fill="#636369" fontSize={11} fontFamily="Inter, sans-serif">
          Press ▶ to start replay
        </text>
      )}
    </svg>
  )
}
