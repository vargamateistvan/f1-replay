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
  readonly focusDriver?: number | null
  readonly pulseDrivers?: readonly number[]
}

export function TrackMap({ sessionKey, drivers, locationData, sessionStartMs, focusDriver = null, pulseDrivers }: Props) {
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

  // Catmull-Rom → cubic Bézier: fit smooth curves through every GPS point.
  // Wraps around so the lap join is also smooth.
  const svgPts = points.map((p) => {
    const { sx, sy } = locationToSvg(p.x, p.y, bounds, innerW, innerH)
    return { sx: sx + PAD, sy: sy + PAD }
  })
  const n = svgPts.length
  const get = (i: number) => svgPts[((i % n) + n) % n]
  let pathData = `M${get(0).sx.toFixed(1)},${get(0).sy.toFixed(1)}`
  for (let i = 0; i < n; i++) {
    const p0 = get(i - 1), p1 = get(i), p2 = get(i + 1), p3 = get(i + 2)
    const cp1x = p1.sx + (p2.sx - p0.sx) / 6
    const cp1y = p1.sy + (p2.sy - p0.sy) / 6
    const cp2x = p2.sx - (p3.sx - p1.sx) / 6
    const cp2y = p2.sy - (p3.sy - p1.sy) / 6
    pathData += ` C${cp1x.toFixed(1)},${cp1y.toFixed(1)} ${cp2x.toFixed(1)},${cp2y.toFixed(1)} ${p2.sx.toFixed(1)},${p2.sy.toFixed(1)}`
  }
  pathData += ' Z'

  // Interpolate each driver's position at the current playhead time t (session-relative ms)
  const carPositions: Array<{ num: number; x: number; y: number }> = []
  for (const [num, idx] of locationIndexes) {
    const pos = interpolateXY(idx, t)
    if (pos) carPositions.push({ num, ...pos })
  }

  const pulseSet = new Set(pulseDrivers ?? [])

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

      {/* Car dots — when a driver is focused, dim the rest and enlarge the pick */}
      {carPositions
        .slice()
        .sort((a, b) => (a.num === focusDriver ? 1 : 0) - (b.num === focusDriver ? 1 : 0))
        .map(({ num, x, y }) => {
          const driver = driverByNumber.get(num)
          const color = teamColor(driver?.team_colour, '#ffffff')
          const { sx, sy } = locationToSvg(x, y, bounds, innerW, innerH)
          const focused = focusDriver === num
          const dimmed = focusDriver !== null && !focused
          const showLabel = focusDriver === null || focused
          const pulsing = pulseSet.has(num)
          return (
            <g
              key={num}
              transform={`translate(${(sx + PAD).toFixed(1)},${(sy + PAD).toFixed(1)})`}
              opacity={dimmed ? 0.3 : 1}
            >
              {pulsing && (
                <circle r={6} fill="none" stroke="#ffffff" strokeWidth={1.5}>
                  <animate attributeName="r" from="6" to="14" dur="0.8s" repeatCount="indefinite" />
                  <animate attributeName="stroke-opacity" from="0.9" to="0" dur="0.8s" repeatCount="indefinite" />
                </circle>
              )}
              {focused && (
                <circle r={9} fill="none" stroke={color} strokeWidth={1.5} strokeOpacity={0.5} />
              )}
              <circle
                r={focused ? 6.5 : 4.5}
                fill={color}
                stroke="#ffffff"
                strokeWidth={focused ? 1.6 : 1.2}
                strokeOpacity={focused ? 0.9 : 0.6}
              />
              {showLabel && (
                <text x={focused ? 10 : 7} y={-5} fontSize={focused ? 9 : 8} fill={color} fontFamily="Inter, sans-serif" fontWeight="900" letterSpacing="0.04em">
                  {driver?.name_acronym ?? num}
                </text>
              )}
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
