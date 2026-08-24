import { useQuery, useQueryClient } from "@tanstack/react-query";
import { useEffect, useMemo } from "react";
import { api } from "@/api/endpoints";
import type { CarData } from "@/api/types";
import { CHUNK_MS } from "@/constants";
import { allCarDataWindowQueryOptions } from "@/hooks/useAllCarDataWindow";

const EVICT_RADIUS = 1;

// car_data for ONE driver in the current 5-min window + the next (prefetched),
// mirroring useLocationChunks. One driver's chunk is ~1k rows, so this stays cheap
// — used only for the spotlighted-driver readout, never all drivers at once.
//
// When the all-driver window is already being fetched for the same chunks (the
// leaderboard telemetry columns), pass `sharedAllDriverWindow: true`: the hook
// then subscribes to the exact same all-driver query (deduped by TanStack
// Query, zero extra requests) and filters this driver's rows out of it instead
// of issuing separate per-driver requests.

function chunkDates(sessionStartMs: number, idx: number) {
  return {
    start: new Date(sessionStartMs + idx * CHUNK_MS).toISOString(),
    end: new Date(sessionStartMs + (idx + 1) * CHUNK_MS).toISOString(),
  };
}

export function useCarDataWindow(
  sessionKey: number | null,
  driverNumber: number | null,
  sessionStartMs: number,
  chunkIdx: number,
  options?: {
    /** True when useAllCarDataWindow is active for the same session/chunks. */
    sharedAllDriverWindow?: boolean;
  },
): { data: CarData[]; isPending: boolean } {
  const qc = useQueryClient();
  const shared = options?.sharedAllDriverWindow ?? false;
  const enabled =
    sessionKey !== null && driverNumber !== null && sessionStartMs > 0;

  const makeOptions = (idx: number) => ({
    queryKey: ["carDataWindow", sessionKey, driverNumber, idx] as const,
    queryFn: () => {
      const { start, end } = chunkDates(sessionStartMs, idx);
      return api.carDataForDriver(sessionKey!, driverNumber!, start, end);
    },
    enabled: enabled && !shared,
    staleTime: Infinity,
    gcTime: Infinity,
  });

  const current = useQuery(makeOptions(chunkIdx));
  const next = useQuery(makeOptions(chunkIdx + 1));

  // Shared mode: same query key/fn as useAllCarDataWindow, so this never adds
  // requests beyond what the leaderboard fetches (plus a next-chunk prefetch
  // that the leaderboard will need at the boundary anyway).
  const makeSharedOptions = (idx: number) => ({
    ...allCarDataWindowQueryOptions(sessionKey ?? 0, sessionStartMs, idx),
    enabled: enabled && shared,
  });

  const sharedCurrent = useQuery(makeSharedOptions(chunkIdx));
  const sharedNext = useQuery(makeSharedOptions(chunkIdx + 1));

  useEffect(() => {
    if (!enabled) return;
    const queries = qc.getQueryCache().findAll({
      queryKey: ["carDataWindow"],
      exact: false,
    });

    for (const query of queries) {
      const key = query.queryKey as ["carDataWindow", number, number, number];
      const [, keySessionKey, keyDriverNumber, idx] = key;
      if (
        shared ||
        keySessionKey !== sessionKey ||
        keyDriverNumber !== driverNumber ||
        Math.abs(idx - chunkIdx) > EVICT_RADIUS
      ) {
        qc.removeQueries({ queryKey: key, exact: true });
      }
    }
  }, [qc, enabled, shared, sessionKey, driverNumber, chunkIdx]);

  const data = useMemo(() => {
    if (shared) {
      const merged = [
        ...(sharedCurrent.data ?? []),
        ...(sharedNext.data ?? []),
      ];
      return merged.filter((d) => d.driver_number === driverNumber);
    }
    return [...(current.data ?? []), ...(next.data ?? [])];
  }, [
    shared,
    driverNumber,
    current.data,
    next.data,
    sharedCurrent.data,
    sharedNext.data,
  ]);

  return {
    data,
    isPending: shared ? sharedCurrent.isPending : current.isPending,
  };
}
