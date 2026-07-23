import type { QueryFilters } from "@/api/endpoints";

export function lapsQueryKey(
  sessionKey: number | null,
  driverNumber?: number,
  filters?: QueryFilters,
) {
  return ["laps", sessionKey, driverNumber, filters] as const;
}
