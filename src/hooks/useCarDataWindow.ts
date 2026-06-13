import { useQuery } from '@tanstack/react-query'
import { api } from '@/api/endpoints'
import type { CarData } from '@/api/types'
import { CHUNK_MS } from '@/constants'

// car_data for ONE driver in the current 5-min window + the next (prefetched),
// mirroring useLocationChunks. One driver's chunk is ~1k rows, so this stays cheap
// — used only for the spotlighted-driver readout, never all drivers at once.

function chunkDates(sessionStartMs: number, idx: number) {
  return {
    start: new Date(sessionStartMs + idx * CHUNK_MS).toISOString(),
    end: new Date(sessionStartMs + (idx + 1) * CHUNK_MS).toISOString(),
  }
}

export function useCarDataWindow(
  sessionKey: number | null,
  driverNumber: number | null,
  sessionStartMs: number,
  chunkIdx: number,
): { data: CarData[]; isPending: boolean } {
  const enabled = sessionKey !== null && driverNumber !== null && sessionStartMs > 0

  const makeOptions = (idx: number) => ({
    queryKey: ['carDataWindow', sessionKey, driverNumber, idx] as const,
    queryFn: () => {
      const { start, end } = chunkDates(sessionStartMs, idx)
      return api.carDataForDriver(sessionKey!, driverNumber!, start, end)
    },
    enabled,
    staleTime: Infinity,
    gcTime: Infinity,
  })

  const current = useQuery(makeOptions(chunkIdx))
  const next = useQuery(makeOptions(chunkIdx + 1))

  return {
    data: [...(current.data ?? []), ...(next.data ?? [])],
    isPending: current.isPending,
  }
}
