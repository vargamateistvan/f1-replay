import { useQuery } from '@tanstack/react-query'
import { api } from '@/api/endpoints'
import type { Location } from '@/api/types'
import { TRACK_OUTLINE_LAP } from '@/constants'

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
  // Uniform scale so the real-world aspect ratio is preserved (letterbox if needed).
  const scale = Math.min(svgW / bounds.width, svgH / bounds.height)
  const mapW = bounds.width * scale
  const mapH = bounds.height * scale
  const offX = (svgW - mapW) / 2
  const offY = (svgH - mapH) / 2
  const sx = (x - bounds.minX) * scale + offX
  const sy = mapH - (y - bounds.minY) * scale + offY  // flip Y axis
  return { sx, sy }
}

// Derives track outline via two sequential calls:
//   1. Fetch laps to get the date range of a clean lap
//   2. Fetch location data for that driver within that window
export function useTrackOutline(sessionKey: number | null, driverNumber: number | null, preferredLap = TRACK_OUTLINE_LAP) {
  return useQuery({
    queryKey: ['trackOutline', sessionKey, driverNumber, preferredLap],
    queryFn: async () => {
      // Step 1 — find a clean lap with a known date range
      const laps = await api.laps(sessionKey!, driverNumber!)
      const validLaps = laps.filter(
        (l) => l.date_start && l.lap_duration !== null && l.lap_duration! > 30,
      )
      // Try the preferred lap number; fall back to lap 3, then any valid lap
      const lap =
        validLaps.find((l) => l.lap_number === preferredLap) ??
        validLaps.find((l) => l.lap_number === 3) ??
        validLaps[0]

      if (!lap?.date_start || !lap.lap_duration) return null

      const startDate = lap.date_start
      // Add 2-second buffer at the end so the car completes the lap fully
      const endMs = new Date(lap.date_start).getTime() + (lap.lap_duration + 2) * 1000
      const endDate = new Date(endMs).toISOString()

      // Step 2 — fetch location points for that driver+window
      return api.locationForDriver(sessionKey!, driverNumber!, startDate, endDate)
    },
    enabled: sessionKey !== null && driverNumber !== null,
    staleTime: Infinity,
    select: (data) => {
      if (!data?.length) return null
      const bounds = computeTrackBounds(data)
      return { points: data, bounds }
    },
  })
}
