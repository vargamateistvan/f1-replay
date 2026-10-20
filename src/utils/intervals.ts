import type { Interval } from "@/api/types";

// OpenF1 interval fields are mixed-type: number, string tokens ("LAP", "PIT"),
// and stringified numeric gaps such as "+0.842".
export function parseIntervalSeconds(
  value: number | string | null,
): number | null {
  if (typeof value === "number") {
    return Number.isFinite(value) ? value : null;
  }
  if (typeof value !== "string") return null;

  const normalized = value.trim().replace(/^\+/, "");
  if (!normalized) return null;

  const parsed = Number(normalized);
  return Number.isFinite(parsed) ? parsed : null;
}

/** Each driver's latest interval row at or before `cutoffUtcMs`. */
export function latestIntervalRows(
  intervals: readonly Interval[],
  cutoffUtcMs: number,
): Map<number, Pick<Interval, "interval" | "gap_to_leader">> {
  const latest = new Map<number, { ms: number; row: Interval }>();
  for (const iv of intervals) {
    const ms = new Date(iv.date).getTime();
    if (ms > cutoffUtcMs) continue;
    const prev = latest.get(iv.driver_number);
    if (!prev || ms > prev.ms) latest.set(iv.driver_number, { ms, row: iv });
  }
  const out = new Map<number, Pick<Interval, "interval" | "gap_to_leader">>();
  for (const [num, { row }] of latest) {
    out.set(num, { interval: row.interval, gap_to_leader: row.gap_to_leader });
  }
  return out;
}
