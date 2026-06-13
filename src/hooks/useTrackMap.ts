import { useQuery } from '@tanstack/react-query'
import { api } from '@/api/endpoints'
import type { Location } from '@/api/types'

export interface TrackBounds {
  minX: number; maxX: number; minY: number; maxY: number
  width: number; height: number
}

export function computeTrackBounds(locations: Location[]): TrackBounds {
  let minX = Infinity, maxX = -Infinity
  let minY = Infinity, maxY = -Infinity
  for (const l of locations) {
    if (l.x < minX) minX = l.x
    if (l.x > maxX) maxX = l.x
    if (l.y < minY) minY = l.y
    if (l.y > maxY) maxY = l.y
  }
  return { minX, maxX, minY, maxY, width: maxX - minX, height: maxY - minY }
}

export function locationToSvg(x: number, y: number, bounds: TrackBounds, svgW: number, svgH: number) {
  const nx = (x - bounds.minX) / bounds.width
  const ny = 1 - (y - bounds.minY) / bounds.height // flip Y axis
  return { sx: nx * svgW, sy: ny * svgH }
}

// Fetches one lap of location data to use as track outline
export function useTrackOutline(sessionKey: number | null, driverNumber: number | null, lapNumber = 2) {
  return useQuery({
    queryKey: ['trackOutline', sessionKey, driverNumber, lapNumber],
    queryFn: () => api.locationLap(sessionKey!, driverNumber!, lapNumber),
    enabled: sessionKey !== null && driverNumber !== null,
    staleTime: Infinity,
    select: (data) => {
      if (!data.length) return null
      const bounds = computeTrackBounds(data)
      return { points: data, bounds }
    },
  })
}
