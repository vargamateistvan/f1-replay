import { useTrackOutline, locationToSvg } from '@/hooks/useTrackMap'
import type { Driver } from '@/api/types'

const SVG_W = 600
const SVG_H = 400
const PAD = 24

interface CarPos { driverNumber: number; x: number; y: number }

interface Props {
  sessionKey: number | null
  drivers: Driver[]
  carPositions: CarPos[]
}

export function TrackMap({ sessionKey, drivers, carPositions }: Props) {
  const firstDriver = drivers[0] ?? null
  const { data: outline, isPending } = useTrackOutline(
    sessionKey,
    firstDriver?.driver_number ?? null,
  )

  const driverByNumber = new Map(drivers.map((d) => [d.driver_number, d]))

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
        Loading track…
      </div>
    )
  }

  if (!outline) {
    return (
      <div className="flex items-center justify-center w-full h-full text-muted text-sm">
        No location data available
      </div>
    )
  }

  const { points, bounds } = outline

  // Build SVG path from location points
  const pathData = points
    .map((p, i) => {
      const { sx, sy } = locationToSvg(p.x, p.y, bounds, SVG_W - PAD * 2, SVG_H - PAD * 2)
      return `${i === 0 ? 'M' : 'L'}${(sx + PAD).toFixed(1)},${(sy + PAD).toFixed(1)}`
    })
    .join(' ') + ' Z'

  return (
    <svg
      viewBox={`0 0 ${SVG_W} ${SVG_H}`}
      className="w-full h-full"
      style={{ background: '#0b1120' }}
    >
      {/* Track outline */}
      <path
        d={pathData}
        fill="none"
        stroke="#2a3a5c"
        strokeWidth={10}
        strokeLinecap="round"
        strokeLinejoin="round"
      />
      <path
        d={pathData}
        fill="none"
        stroke="#3d4f6e"
        strokeWidth={6}
        strokeLinecap="round"
        strokeLinejoin="round"
      />

      {/* Car dots */}
      {carPositions.map(({ driverNumber, x, y }) => {
        const driver = driverByNumber.get(driverNumber)
        const color = driver ? `#${driver.team_colour}` : '#ffffff'
        const { sx, sy } = locationToSvg(x, y, bounds, SVG_W - PAD * 2, SVG_H - PAD * 2)
        return (
          <g key={driverNumber} transform={`translate(${sx + PAD},${sy + PAD})`}>
            <circle r={5} fill={color} stroke="#000" strokeWidth={1} />
            <text
              x={7} y={4}
              fontSize={8}
              fill={color}
              fontFamily="monospace"
              fontWeight="bold"
            >
              {driver?.name_acronym ?? driverNumber}
            </text>
          </g>
        )
      })}
    </svg>
  )
}
