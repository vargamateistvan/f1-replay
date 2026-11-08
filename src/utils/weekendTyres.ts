import type { Stint } from "@/api/types";
import { STANDARD_WEEKEND_TYRE_ALLOCATION } from "@/constants";

type AllocatedCompound = keyof typeof STANDARD_WEEKEND_TYRE_ALLOCATION;

function isAllocatedCompound(
  compound: Stint["compound"],
): compound is AllocatedCompound {
  return Object.prototype.hasOwnProperty.call(STANDARD_WEEKEND_TYRE_ALLOCATION, compound);
}

export interface DriverTyreEstimate {
  driverNumber: number;
  compounds: {
    compound: AllocatedCompound;
    allocated: number;
    used: number;
    remaining: number;
  }[];
}

/**
 * Estimates set usage from stints that begin on a fresh tyre. OpenF1 does not
 * provide tyre set IDs, so these figures are indicative rather than official.
 */
export function estimateWeekendTyres(stints: Stint[]): DriverTyreEstimate[] {
  const usedByDriver = new Map<number, Map<AllocatedCompound, number>>();

  for (const stint of stints) {
    if (stint.tyre_age_at_start !== 0 || !isAllocatedCompound(stint.compound)) {
      continue;
    }

    const usedByCompound = usedByDriver.get(stint.driver_number) ?? new Map();
    usedByCompound.set(stint.compound, (usedByCompound.get(stint.compound) ?? 0) + 1);
    usedByDriver.set(stint.driver_number, usedByCompound);
  }

  return [...usedByDriver.entries()]
    .sort(([a], [b]) => a - b)
    .map(([driverNumber, usedByCompound]) => ({
      driverNumber,
      compounds: (Object.entries(STANDARD_WEEKEND_TYRE_ALLOCATION) as [
        AllocatedCompound,
        number,
      ][]).map(([compound, allocated]) => {
        const used = usedByCompound.get(compound) ?? 0;
        return {
          compound,
          allocated,
          used,
          remaining: Math.max(0, allocated - used),
        };
      }),
    }));
}
