import { useQuery } from '@tanstack/react-query'
import { api } from '@/api/endpoints'
import type { CarData } from '@/api/types'
import { CHUNK_MS } from '@/constants'

// car_data for ALL drivers in the current 5-min window + the next (prefetched),
// mirroring useLocationChunks/useCarDataWindow. One window is ~22k rows, so this
// is a single heavy-ish request per chunk — only enable it where the live
// telemetry columns are actually shown (the leaderboard view).

function chunkDates(sessionStartMs: number, idx: number) {
  return {
    start: new Date(sessionStartMs + idx * CHUNK_MS).toISOString(),
    end: new Date(sessionStartMs + (idx + 1) * CHUNK_MS).toISOString(),
  }
}

export function useAllCarDataWindow(
  sessionKey: number | null,
  sessionStartMs: number,
  chunkIdx: number,
  enabled: boolean,
): { data: CarData[]; isPending: boolean } {
  const on = enabled && sessionKey !== null && sessionStartMs > 0

  const makeOptions = (idx: number) => ({
    queryKey: ['allCarDataWindow', sessionKey, idx] as const,
    queryFn: () => {
      const { start, end } = chunkDates(sessionStartMs, idx)
      return api.carDataWindowAll(sessionKey!, start, end)
    },
    enabled: on && idx >= 0,
    staleTime: Infinity,
    gcTime: Infinity,
  })

  const current = useQuery(makeOptions(chunkIdx))
  const next = useQuery(makeOptions(chunkIdx + 1))

  return {
    data: [...(current.data ?? []), ...(next.data ?? [])],
    isPending: on && current.isPending,
  }
}
