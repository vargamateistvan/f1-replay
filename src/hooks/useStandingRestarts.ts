import { useMemo } from "react";
import { useQueries, type UseQueryResult } from "@tanstack/react-query";
import { api } from "@/api/endpoints";
import { isAuthError } from "@/api/client";
import type { Position, RaceControl } from "@/api/types";
import { LIVE_POLL_SLOW_MS } from "@/utils/live";
import {
  detectLightsOut,
  leaderAt,
  standingRestartSearches,
} from "@/utils/standingRestart";

function lightsOutTimes(
  results: UseQueryResult<number | null>[],
): number[] {
  return results
    .map((result) => result.data ?? null)
    .filter((ms): ms is number => ms !== null)
    .sort((a, b) => a - b);
}

/**
 * Lights-out times (absolute UTC ms, ascending) of standing restarts after a
 * red flag. Each restart costs one small `car_data` request for the leader.
 */
export function useStandingRestarts(
  sessionKey: number | null,
  raceControl: readonly RaceControl[] | undefined,
  positions: readonly Position[] | undefined,
  options: { enabled?: boolean; isLive?: boolean } = {},
): number[] {
  const { enabled = true, isLive = false } = options;
  const targets = useMemo(() => {
    if (!enabled || sessionKey === null || !raceControl?.length) return [];
    return standingRestartSearches(raceControl).flatMap((search) => {
      const driverNumber = leaderAt(positions ?? [], search.fromMs);
      return driverNumber === null ? [] : [{ ...search, driverNumber }];
    });
  }, [enabled, sessionKey, raceControl, positions]);

  const results = useQueries({
    combine: lightsOutTimes,
    queries: targets.map(({ fromMs, toMs, driverNumber }) => ({
      queryKey: ["standingRestart", sessionKey, driverNumber, fromMs],
      queryFn: async () =>
        detectLightsOut(
          await api.carDataForDriver(
            sessionKey!,
            driverNumber,
            new Date(fromMs).toISOString(),
            new Date(toMs).toISOString(),
          ),
        ),
      staleTime: isLive ? 0 : Infinity,
      // Live: keep looking until the cars have left the grid.
      refetchInterval: (query: {
        state: { data: number | null | undefined; error: unknown };
      }) =>
        isLive && query.state.data == null && !isAuthError(query.state.error)
          ? LIVE_POLL_SLOW_MS
          : false,
    })),
  });

  return results;
}
