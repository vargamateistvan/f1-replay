import { useQuery } from '@tanstack/react-query'
import { api } from '@/api/endpoints'
import type { CarData, Lap } from '@/api/types'

export interface TelemetrySample {
  distM: number   // distance along lap in metres (integrated from speed)
  timeS: number   // session-relative seconds from lap start
  absMs?: number  // absolute wall-clock ms (for binary search by playhead time; absent on interpolated samples)
  speed: number   // km/h
  throttle: number // 0–100
  brake: number    // 0–100
  rpm: number
  gear: number
  drs: number      // raw DRS value (>10 = active)
}

// Integrate speed (km/h) over time (s) → cumulative distance (m)
export function toTelemetrySamples(data: CarData[], lapStartMs: number): TelemetrySample[] {
  if (data.length === 0) return []

  // Sort by date ascending
  const sorted = [...data].sort(
    (a, b) => new Date(a.date).getTime() - new Date(b.date).getTime(),
  )

  const samples: TelemetrySample[] = []
  let distM = 0

  for (let i = 0; i < sorted.length; i++) {
    const row = sorted[i]!
    const tMs = new Date(row.date).getTime() - lapStartMs
    const timeS = tMs / 1000

    if (i > 0) {
      const prev = sorted[i - 1]!
      const dtS = (new Date(row.date).getTime() - new Date(prev.date).getTime()) / 1000
      // average speed over the interval
      const avgKmh = (row.speed + prev.speed) / 2
      distM += (avgKmh / 3.6) * dtS
    }

    samples.push({
      distM,
      timeS,
      absMs: new Date(row.date).getTime(),
      speed: row.speed,
      throttle: row.throttle,
      brake: row.brake,
      rpm: row.rpm,
      gear: row.n_gear,
      drs: row.drs,
    })
  }

  return samples
}

async function fetchCarDataForLap(
  sessionKey: number,
  driverNumber: number,
  lapNumber: number,
): Promise<TelemetrySample[] | null> {
  // Step 1 — get the lap's date range
  const laps = await api.laps(sessionKey, driverNumber)
  const lap: Lap | undefined = laps.find((l) => l.lap_number === lapNumber)
  if (!lap?.date_start || !lap.lap_duration) return null

  const lapStartMs = new Date(lap.date_start).getTime()
  const lapEndMs = lapStartMs + (lap.lap_duration + 2) * 1000

  // Step 2 — fetch car_data for that window
  const raw = await api.carDataForDriver(
    sessionKey,
    driverNumber,
    lap.date_start,
    new Date(lapEndMs).toISOString(),
  )

  return toTelemetrySamples(raw, lapStartMs)
}

export function useCarDataForLap(
  sessionKey: number | null,
  driverNumber: number | null,
  lapNumber: number | null,
) {
  return useQuery({
    queryKey: ['carDataForLap', sessionKey, driverNumber, lapNumber],
    queryFn: () => fetchCarDataForLap(sessionKey!, driverNumber!, lapNumber!),
    enabled: sessionKey !== null && driverNumber !== null && lapNumber !== null,
    staleTime: Infinity,
  })
}
