import { useQuery, useQueryClient } from '@tanstack/react-query'
import { useEffect, useMemo } from 'react'
import { api } from '@/api/endpoints'
import type { Location } from '@/api/types'
import { CHUNK_MS } from '@/constants'

function chunkKey(sessionKey: number, idx: number) {
  return ['location-chunk', sessionKey, idx] as const
}

function chunkDates(sessionStartMs: number, idx: number) {
  const start = new Date(sessionStartMs + idx * CHUNK_MS).toISOString()
  const end = new Date(sessionStartMs + (idx + 1) * CHUNK_MS).toISOString()
  return { start, end }
}

function fetchChunk(sessionKey: number, sessionStartMs: number, idx: number) {
  const { start, end } = chunkDates(sessionStartMs, idx)
  return api.locationWindow(sessionKey, start, end)
}

export function chunkIndexFor(tMs: number): number {
  return Math.max(0, Math.floor(tMs / CHUNK_MS))
}

// Returns merged Location[] for the current 5-min window + the next (prefetched).
// chunkIdx should be computed by the caller as chunkIndexFor(t).
export function useLocationChunks(
  sessionKey: number | null,
  sessionStartMs: number | null,
  chunkIdx: number,
): { data: Location[]; isPending: boolean } {
  const qc = useQueryClient()

  const enabled = sessionKey !== null && sessionStartMs !== null

  const current = useQuery<Location[]>({
    queryKey: chunkKey(sessionKey!, chunkIdx),
    queryFn: () => fetchChunk(sessionKey!, sessionStartMs!, chunkIdx),
    enabled,
    staleTime: Infinity,
    gcTime: Infinity,
  })

  const next = useQuery<Location[]>({
    queryKey: chunkKey(sessionKey!, chunkIdx + 1),
    queryFn: () => fetchChunk(sessionKey!, sessionStartMs!, chunkIdx + 1),
    enabled,
    staleTime: Infinity,
    gcTime: Infinity,
  })

  // Prefetch chunk after next so there's no gap during fast forward
  useEffect(() => {
    if (!enabled) return
    qc.prefetchQuery({
      queryKey: chunkKey(sessionKey!, chunkIdx + 2),
      queryFn: () => fetchChunk(sessionKey!, sessionStartMs!, chunkIdx + 2),
      staleTime: Infinity,
    })
  }, [qc, enabled, sessionKey, sessionStartMs, chunkIdx])

  // Stable reference: only rebuilds when a chunk actually arrives, not every render.
  // Without this memo, RaceWeekend's t-subscription causes a new array every frame,
  // which forces TrackMap to rebuild all typed-array location indexes at 60 fps.
  const data = useMemo(
    () => [...(current.data ?? []), ...(next.data ?? [])],
    [current.data, next.data],
  )

  return { data, isPending: current.isPending }
}
