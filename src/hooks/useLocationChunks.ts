import { useQuery, useQueryClient } from "@tanstack/react-query";
import { useEffect, useMemo } from "react";
import { api } from "@/api/endpoints";
import type { Location } from "@/api/types";
import { CHUNK_MS, LOCATION_CHUNK_MS } from "@/constants";

function chunkKey(sessionKey: number, idx: number) {
  return ["location-chunk", sessionKey, idx] as const;
}

function chunkDates(sessionStartMs: number, idx: number) {
  const start = new Date(
    sessionStartMs + idx * LOCATION_CHUNK_MS,
  ).toISOString();
  const end = new Date(
    sessionStartMs + (idx + 1) * LOCATION_CHUNK_MS,
  ).toISOString();
  return { start, end };
}

function fetchChunk(sessionKey: number, sessionStartMs: number, idx: number) {
  const { start, end } = chunkDates(sessionStartMs, idx);
  return api.locationWindow(sessionKey, start, end);
}

export function mergeLocationChunkData(
  previous: Location[] | undefined,
  current: Location[] | undefined,
  next: Location[] | undefined,
  includeNextChunk: boolean,
): Location[] {
  return [
    ...(previous ?? []),
    ...(current ?? []),
    ...(includeNextChunk ? (next ?? []) : []),
  ];
}

export function chunkIndexFor(tMs: number): number {
  return Math.max(0, Math.floor(tMs / CHUNK_MS));
}

export function locationChunkIndexFor(tMs: number): number {
  return Math.max(0, Math.floor(tMs / LOCATION_CHUNK_MS));
}

export function getLocationPrefetchOffsets(playbackSpeed: number): number[] {
  if (playbackSpeed >= 16) return [2, 3, 4, 5, 6, 7, 8];
  if (playbackSpeed >= 8) return [2, 3, 4, 5, 6];
  return [2, 3];
}

export function getEarlyLocationPrefetchMs(playbackSpeed: number): number {
  if (playbackSpeed >= 16) return 4 * 60_000;
  if (playbackSpeed >= 8) return 3 * 60_000;
  return 60_000;
}

// How many chunks to keep on each side of the current position.
const EVICT_RADIUS = 4;

// Returns merged Location[] for the current 5-min window + the next (prefetched).
// chunkIdx should be computed by the caller as chunkIndexFor(t).
// tMs (optional) enables early prefetch: when within 60 s of the boundary we
// immediately kick off chunkIdx+3 rather than waiting for chunkIdx to tick over.
export function useLocationChunks(
  sessionKey: number | null,
  sessionStartMs: number | null,
  chunkIdx: number,
  tMs?: number,
  options?: {
    includeNextChunk?: boolean;
    prefetchChunks?: boolean;
    playbackSpeed?: number;
  },
): { data: Location[]; isPending: boolean } {
  const qc = useQueryClient();

  const enabled = sessionKey !== null && sessionStartMs !== null;
  const includeNextChunk = options?.includeNextChunk ?? true;
  const prefetchChunks = options?.prefetchChunks ?? true;
  const playbackSpeed = options?.playbackSpeed ?? 1;
  const prefetchOffsets = getLocationPrefetchOffsets(playbackSpeed);
  const earlyPrefetchMs = getEarlyLocationPrefetchMs(playbackSpeed);
  const furthestPrefetchOffset =
    prefetchOffsets[prefetchOffsets.length - 1] ?? 3;
  const keepRadius = Math.max(EVICT_RADIUS, furthestPrefetchOffset);

  const current = useQuery<Location[]>({
    queryKey: chunkKey(sessionKey!, chunkIdx),
    queryFn: () => fetchChunk(sessionKey!, sessionStartMs!, chunkIdx),
    enabled,
    staleTime: Infinity,
    gcTime: Infinity,
  });

  const previous = useQuery<Location[]>({
    queryKey: chunkKey(sessionKey!, Math.max(0, chunkIdx - 1)),
    queryFn: () => fetchChunk(sessionKey!, sessionStartMs!, chunkIdx - 1),
    enabled: enabled && chunkIdx > 0,
    staleTime: Infinity,
    gcTime: Infinity,
  });

  const next = useQuery<Location[]>({
    queryKey: chunkKey(sessionKey!, chunkIdx + 1),
    queryFn: () => fetchChunk(sessionKey!, sessionStartMs!, chunkIdx + 1),
    enabled: enabled && includeNextChunk,
    staleTime: Infinity,
    gcTime: Infinity,
  });

  // Prefetch farther ahead at high playback speeds so fast-forward does not outrun
  // the network. Base headroom is +2/+3, then +4 at 8x and +5 at 16x.
  useEffect(() => {
    if (!enabled || !prefetchChunks) return;
    for (const offset of prefetchOffsets) {
      qc.prefetchQuery({
        queryKey: chunkKey(sessionKey!, chunkIdx + offset),
        queryFn: () =>
          fetchChunk(sessionKey!, sessionStartMs!, chunkIdx + offset),
        staleTime: Infinity,
      });
    }
  }, [
    qc,
    enabled,
    prefetchChunks,
    prefetchOffsets,
    sessionKey,
    sessionStartMs,
    chunkIdx,
  ]);

  // Early-prefetch the furthest future chunk when the playhead is near the next
  // boundary so the network request starts before chunkIdx increments.
  const nearBoundary =
    tMs !== undefined &&
    tMs % LOCATION_CHUNK_MS > LOCATION_CHUNK_MS - earlyPrefetchMs;
  useEffect(() => {
    if (!enabled || !nearBoundary || !prefetchChunks) return;
    qc.prefetchQuery({
      queryKey: chunkKey(sessionKey!, chunkIdx + furthestPrefetchOffset),
      queryFn: () =>
        fetchChunk(
          sessionKey!,
          sessionStartMs!,
          chunkIdx + furthestPrefetchOffset,
        ),
      staleTime: Infinity,
    });
  }, [
    qc,
    earlyPrefetchMs,
    enabled,
    furthestPrefetchOffset,
    nearBoundary,
    prefetchChunks,
    sessionKey,
    sessionStartMs,
    chunkIdx,
  ]);

  // Evict chunks outside the keep window to bound memory on long replays, and
  // drop every chunk left over from a previously viewed session — with
  // staleTime/gcTime: Infinity these never expire on their own, so without
  // this a few session switches accumulate enough location data (thousands
  // of points per chunk) to trip mobile browsers' memory-pressure reload.
  useEffect(() => {
    if (!enabled) return;
    const queries = qc.getQueryCache().findAll({
      queryKey: ["location-chunk"],
      exact: false,
    });
    for (const query of queries) {
      const key = query.queryKey as ["location-chunk", number, number];
      const [, keySessionKey, idx] = key;
      if (
        keySessionKey !== sessionKey ||
        Math.abs(idx - chunkIdx) > keepRadius
      ) {
        qc.removeQueries({ queryKey: key, exact: true });
      }
    }
  }, [qc, enabled, sessionKey, chunkIdx, keepRadius]);

  // Stable reference: only rebuilds when a chunk actually arrives, not every render.
  // Without this memo, RaceWeekend's t-subscription causes a new array every frame,
  // which forces TrackMap to rebuild all typed-array location indexes at 60 fps.
  const data = useMemo(
    () =>
      mergeLocationChunkData(
        previous.data,
        current.data,
        next.data,
        includeNextChunk,
      ),
    [previous.data, current.data, includeNextChunk, next.data],
  );

  return { data, isPending: current.isPending && data.length === 0 };
}
