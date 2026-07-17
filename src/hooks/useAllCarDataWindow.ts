import { useQuery, useQueryClient } from "@tanstack/react-query";
import { useEffect } from "react";
import { api } from "@/api/endpoints";
import type { CarData } from "@/api/types";
import { CHUNK_MS } from "@/constants";

// How many chunks to keep on each side of the current position — mirrors
// useLocationChunks' EVICT_RADIUS.
const EVICT_RADIUS = 1;

// car_data for ALL drivers in the current 5-min window + the next (prefetched),
// mirroring useLocationChunks/useCarDataWindow. One window is ~22k rows, so this
// is a single heavy-ish request per chunk — only enable it where the live
// telemetry columns are actually shown (the leaderboard view).

function chunkDates(sessionStartMs: number, idx: number) {
  return {
    start: new Date(sessionStartMs + idx * CHUNK_MS).toISOString(),
    end: new Date(sessionStartMs + (idx + 1) * CHUNK_MS).toISOString(),
  };
}

export function useAllCarDataWindow(
  sessionKey: number | null,
  sessionStartMs: number,
  chunkIdx: number,
  enabled: boolean,
): { data: CarData[]; isPending: boolean } {
  const on = enabled && sessionKey !== null && sessionStartMs > 0;
  const qc = useQueryClient();

  const makeOptions = (idx: number) => ({
    queryKey: ["allCarDataWindow", sessionKey, idx] as const,
    queryFn: () => {
      const { start, end } = chunkDates(sessionStartMs, idx);
      return api.carDataWindowAll(sessionKey!, start, end);
    },
    enabled: on && idx >= 0,
    staleTime: Infinity,
    gcTime: Infinity,
  });

  const previous = useQuery(makeOptions(chunkIdx - 1));
  const current = useQuery(makeOptions(chunkIdx));
  const next = useQuery(makeOptions(chunkIdx + 1));

  // Evict chunks outside the keep window and anything left over from a
  // previously viewed session — with staleTime/gcTime: Infinity these never
  // expire on their own, and at ~22k rows per window they're the single
  // heaviest query on the page. Left unbounded, scrubbing plus a couple of
  // session switches accumulates enough to trip mobile browsers'
  // memory-pressure reload.
  useEffect(() => {
    if (!on) return;
    const queries = qc.getQueryCache().findAll({
      queryKey: ["allCarDataWindow"],
      exact: false,
    });
    for (const query of queries) {
      const key = query.queryKey as ["allCarDataWindow", number, number];
      const [, keySessionKey, idx] = key;
      if (
        keySessionKey !== sessionKey ||
        Math.abs(idx - chunkIdx) > EVICT_RADIUS
      ) {
        qc.removeQueries({ queryKey: key, exact: true });
      }
    }
  }, [qc, on, sessionKey, chunkIdx]);

  return {
    // Include previous chunk so playhead-aligned lookup can always find the
    // latest sample <= t right after chunk boundaries.
    data: [
      ...(previous.data ?? []),
      ...(current.data ?? []),
      ...(next.data ?? []),
    ],
    isPending: on && current.isPending,
  };
}
