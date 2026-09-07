import {
  CORNER_HIGH_SPEED_KMH,
  CORNER_LOW_SPEED_KMH,
  CORNER_ZONE_RECOVERY,
} from "@/constants";

export type CornerSpeedClass = "low" | "medium" | "high";

export interface CornerApex {
  /** Display label, e.g. "1" or "6A". */
  label: string;
  /** Distance along the lap in metres. */
  distance: number;
}

export interface CornerZone {
  key: string;
  /** Labels of every corner merged into this zone, in track order. */
  labels: string[];
  /** Apex distances of every corner merged into this zone. */
  apexes: number[];
  startDistance: number;
  endDistance: number;
  speedClass: CornerSpeedClass;
  /** Minimum speed through the zone, in the same unit as the input speeds. */
  minSpeed: number;
}

export function classifyCornerSpeed(minSpeedKmh: number): CornerSpeedClass {
  if (minSpeedKmh < CORNER_LOW_SPEED_KMH) return "low";
  if (minSpeedKmh >= CORNER_HIGH_SPEED_KMH) return "high";
  return "medium";
}

export function cornerSpeedLabel(speedClass: CornerSpeedClass): string {
  if (speedClass === "low") return "Low speed";
  if (speedClass === "high") return "High speed";
  return "Medium speed";
}

/** Index of the sample whose distance is closest to `distance`. */
function nearestIndex(xDist: readonly number[], distance: number): number {
  let lo = 0;
  let hi = xDist.length - 1;
  while (lo < hi - 1) {
    const mid = (lo + hi) >>> 1;
    if (xDist[mid]! <= distance) lo = mid;
    else hi = mid;
  }
  const dLo = Math.abs(xDist[lo]! - distance);
  const dHi = Math.abs(xDist[hi]! - distance);
  return dLo <= dHi ? lo : hi;
}

/**
 * Walks downhill from `fromIdx` to the local speed minimum, so the zone is
 * anchored on the actual slowest point rather than the geometric apex (which
 * can sit slightly off the braking trace).
 */
function localMinIndex(
  speeds: readonly number[],
  fromIdx: number,
  radius: number,
): number {
  const start = Math.max(0, fromIdx - radius);
  const end = Math.min(speeds.length - 1, fromIdx + radius);
  let bestIdx = fromIdx;
  let bestSpeed = speeds[fromIdx] ?? Infinity;
  for (let i = start; i <= end; i++) {
    const speed = speeds[i]!;
    if (speed < bestSpeed) {
      bestSpeed = speed;
      bestIdx = i;
    }
  }
  return bestIdx;
}

/**
 * Expands outward from the apex until speed recovers to `CORNER_ZONE_RECOVERY`
 * of the surrounding straight-line speed, which brackets the braking zone and
 * the corner exit the way broadcast graphics do.
 */
function expandZone(
  speeds: readonly number[],
  apexIdx: number,
): { startIdx: number; endIdx: number } {
  const apexSpeed = speeds[apexIdx]!;

  let peakBefore = apexSpeed;
  for (let i = apexIdx; i >= 0; i--) {
    const speed = speeds[i]!;
    if (speed > peakBefore) peakBefore = speed;
    else if (speed < peakBefore * 0.98 && peakBefore > apexSpeed) break;
  }

  let peakAfter = apexSpeed;
  for (let i = apexIdx; i < speeds.length; i++) {
    const speed = speeds[i]!;
    if (speed > peakAfter) peakAfter = speed;
    else if (speed < peakAfter * 0.98 && peakAfter > apexSpeed) break;
  }

  const enterThreshold = Math.max(apexSpeed, peakBefore * CORNER_ZONE_RECOVERY);
  const exitThreshold = Math.max(apexSpeed, peakAfter * CORNER_ZONE_RECOVERY);

  let startIdx = apexIdx;
  while (startIdx > 0 && speeds[startIdx - 1]! < enterThreshold) startIdx--;

  let endIdx = apexIdx;
  const last = speeds.length - 1;
  while (endIdx < last && speeds[endIdx + 1]! < exitThreshold) endIdx++;

  return { startIdx, endIdx };
}

/**
 * Builds shaded corner zones for the telemetry charts.
 *
 * Corners are anchored on the local speed minimum near each apex, expanded to
 * cover the braking and exit phases, then merged when they overlap so corner
 * complexes read as a single band (matching F1 broadcast lap-time analysis).
 *
 * Returns an empty array when there is not enough telemetry to classify.
 */
export function buildCornerZones(
  corners: readonly CornerApex[],
  xDist: readonly number[],
  speeds: readonly number[],
): CornerZone[] {
  if (corners.length === 0 || xDist.length < 2 || speeds.length < 2) return [];

  // Roughly 40 m either side of the geometric apex, in sample indices.
  const lapDistance = xDist[xDist.length - 1]! - xDist[0]!;
  if (!Number.isFinite(lapDistance) || lapDistance <= 0) return [];
  const perSample = lapDistance / (xDist.length - 1);
  const searchRadius = Math.max(1, Math.round(40 / Math.max(perSample, 1e-6)));

  const raw = corners
    .filter((corner) => Number.isFinite(corner.distance))
    .map((corner) => {
      const seedIdx = nearestIndex(xDist, corner.distance);
      const apexIdx = localMinIndex(speeds, seedIdx, searchRadius);
      const { startIdx, endIdx } = expandZone(speeds, apexIdx);
      return {
        label: corner.label,
        apexDistance: xDist[apexIdx]!,
        startDistance: xDist[startIdx]!,
        endDistance: xDist[endIdx]!,
        minSpeed: speeds[apexIdx]!,
      };
    })
    .sort((a, b) => a.apexDistance - b.apexDistance);

  const merged: CornerZone[] = [];
  for (const corner of raw) {
    const previous = merged[merged.length - 1];

    if (previous && corner.startDistance <= previous.endDistance) {
      previous.labels.push(corner.label);
      previous.apexes.push(corner.apexDistance);
      previous.endDistance = Math.max(previous.endDistance, corner.endDistance);
      previous.minSpeed = Math.min(previous.minSpeed, corner.minSpeed);
      previous.speedClass = classifyCornerSpeed(previous.minSpeed);
      previous.key = `corner-zone-${previous.labels.join("-")}`;
      continue;
    }

    merged.push({
      key: `corner-zone-${corner.label}`,
      labels: [corner.label],
      apexes: [corner.apexDistance],
      startDistance: corner.startDistance,
      endDistance: corner.endDistance,
      speedClass: classifyCornerSpeed(corner.minSpeed),
      minSpeed: corner.minSpeed,
    });
  }

  return merged;
}
