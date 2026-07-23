import { useQuery, useQueryClient } from "@tanstack/react-query";
import { useEffect, useMemo } from "react";
import { api } from "@/api/endpoints";
import type { CarData } from "@/api/types";
import { CHUNK_MS } from "@/constants";

const EVICT_RADIUS = 1;

// car_data for ONE driver in the current 5-min window + the next (prefetched),
// mirroring useLocationChunks. One driver's chunk is ~1k rows, so this stays cheap
// — used only for the spotlighted-driver readout, never all drivers at once.

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
): { data: CarData[]; isPending: boolean } {
  const qc = useQueryClient();
  const enabled =
    sessionKey !== null && driverNumber !== null && sessionStartMs > 0;

  const makeOptions = (idx: number) => ({
    queryKey: ["carDataWindow", sessionKey, driverNumber, idx] as const,
    queryFn: () => {
      const { start, end } = chunkDates(sessionStartMs, idx);
      return api.carDataForDriver(sessionKey!, driverNumber!, start, end);
    },
    enabled,
    staleTime: Infinity,
    gcTime: Infinity,
  });

  const current = useQuery(makeOptions(chunkIdx));
  const next = useQuery(makeOptions(chunkIdx + 1));

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
        keySessionKey !== sessionKey ||
        keyDriverNumber !== driverNumber ||
        Math.abs(idx - chunkIdx) > EVICT_RADIUS
      ) {
        qc.removeQueries({ queryKey: key, exact: true });
      }
    }
  }, [qc, enabled, sessionKey, driverNumber, chunkIdx]);

  const data = useMemo(
    () => [...(current.data ?? []), ...(next.data ?? [])],
    [current.data, next.data],
  );

  return {
    data,
    isPending: current.isPending,
  };
}
