import type { Stint } from "@/api/types";

export interface LapTyre {
  compound: Stint["compound"];
  /** Tyre age in laps at the start of the lap, including laps run before this stint. */
  age: number;
  stintNumber: number;
}

/** Tyre fitted to `driverNumber` on `lapNumber`, or null when no stint covers it. */
export function tyreForLap(
  stints: readonly Stint[],
  driverNumber: number,
  lapNumber: number,
): LapTyre | null {
  const stint = stints.find(
    (s) =>
      s.driver_number === driverNumber &&
      s.lap_start <= lapNumber &&
      lapNumber <= (s.lap_end ?? Number.POSITIVE_INFINITY),
  );
  if (!stint) return null;

  return {
    compound: stint.compound ?? "UNKNOWN",
    age: Math.max(0, lapNumber - stint.lap_start + (stint.tyre_age_at_start ?? 0)),
    stintNumber: stint.stint_number,
  };
}
