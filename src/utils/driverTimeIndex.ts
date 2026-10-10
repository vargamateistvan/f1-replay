import { upperBoundByValue } from "@/utils/sortedTime";

/** One driver's records, sorted by timestamp (ties keep input order). */
export interface DriverTimeSeries<T> {
  readonly ms: readonly number[];
  readonly items: readonly T[];
}

export type DriverTimeIndex<T> = ReadonlyMap<number, DriverTimeSeries<T>>;

/**
 * Groups records by driver and sorts each group by `getMs`, parsing every
 * timestamp once so per-frame lookups are a binary search instead of a scan.
 * Records whose timestamp is not finite are dropped.
 */
export function buildDriverTimeIndex<T extends { driver_number: number }>(
  records: readonly T[],
  getMs: (record: T) => number,
): DriverTimeIndex<T> {
  const groups = new Map<number, { ms: number; item: T }[]>();
  for (const item of records) {
    const ms = getMs(item);
    if (!Number.isFinite(ms)) continue;
    let group = groups.get(item.driver_number);
    if (!group) {
      group = [];
      groups.set(item.driver_number, group);
    }
    group.push({ ms, item });
  }

  const index = new Map<number, DriverTimeSeries<T>>();
  for (const [driverNumber, group] of groups) {
    group.sort((a, b) => a.ms - b.ms);
    index.set(driverNumber, {
      ms: group.map((g) => g.ms),
      items: group.map((g) => g.item),
    });
  }
  return index;
}

/** Each driver's latest record at or before `cutoffMs`. */
export function latestPerDriverAt<T>(
  index: DriverTimeIndex<T>,
  cutoffMs: number,
): Map<number, T> {
  const out = new Map<number, T>();
  for (const [driverNumber, series] of index) {
    const idx = upperBoundByValue(series.ms, cutoffMs, (ms) => ms) - 1;
    if (idx >= 0) out.set(driverNumber, series.items[idx]!);
  }
  return out;
}

/** How many records each driver has at or before `cutoffMs` (zero counts omitted). */
export function countPerDriverAt<T>(
  index: DriverTimeIndex<T>,
  cutoffMs: number,
): Map<number, number> {
  const out = new Map<number, number>();
  for (const [driverNumber, series] of index) {
    const count = upperBoundByValue(series.ms, cutoffMs, (ms) => ms);
    if (count > 0) out.set(driverNumber, count);
  }
  return out;
}
