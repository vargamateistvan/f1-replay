import { useMemo } from 'react'
import { useTrackOutline, locationToSvg } from '@/hooks/useTrackMap'
import { buildIndex, interpolateXY } from '@/timeline/interpolate'
import { useTimeline } from '@/timeline/clock'
import { teamColor } from '@/utils/color'
import type { Driver, Location } from '@/api/types'

const SVG_W = 600
const SVG_H = 400
const PAD = 24

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
      style={{ background: '#0b1120' }}
    >
      {/* Track surface — wide dark stroke + thinner lighter stroke for edge contrast */}
      <path d={pathData} fill="none" stroke="#1e2d4a" strokeWidth={12} strokeLinecap="round" strokeLinejoin="round" />
      <path d={pathData} fill="none" stroke="#2e4268" strokeWidth={7} strokeLinecap="round" strokeLinejoin="round" />
      <path d={pathData} fill="none" stroke="#3d5580" strokeWidth={3} strokeLinecap="round" strokeLinejoin="round" />

      {/* Car dots */}
      {carPositions.map(({ num, x, y }) => {
        const driver = driverByNumber.get(num)
        const color = teamColor(driver?.team_colour, '#ffffff')
        const { sx, sy } = locationToSvg(x, y, bounds, innerW, innerH)
        return (
          <g key={num} transform={`translate(${(sx + PAD).toFixed(1)},${(sy + PAD).toFixed(1)})`}>
            <circle r={5} fill={color} stroke="#000" strokeWidth={1} />
            <text x={7} y={4} fontSize={8} fill={color} fontFamily="monospace" fontWeight="bold">
              {driver?.name_acronym ?? num}
            </text>
          </g>
        )
      })}

      {/* No-data hint when location window hasn't loaded yet */}
      {locationIndexes.size === 0 && (
        <text x={SVG_W / 2} y={SVG_H / 2} textAnchor="middle" fill="#4a5568" fontSize={11} fontFamily="monospace">
          Press ▶ to start replay
        </text>
      )}
    </svg>
  )
}
