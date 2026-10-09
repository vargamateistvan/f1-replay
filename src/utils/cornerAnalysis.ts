import {
  CORNER_BRAKE_GAP_M,
  CORNER_BRAKE_LOOKBACK_M,
  CORNER_BRAKE_ON_PCT,
  CORNER_FULL_THROTTLE_PCT,
  CORNER_THROTTLE_LOOKAHEAD_M,
} from "@/constants";
import type { TelemetrySample } from "@/hooks/useCarDataForLap";
import type { CornerZone } from "@/utils/corners";

export interface CornerDriverMetrics {
  /** Speed (km/h) where the corner zone starts. */
  entrySpeed: number;
  /** Slowest speed (km/h) through the zone. */
  minSpeed: number;
  /** Lap distance (m) of the slowest point. */
  minSpeedDist: number;
  /** Speed (km/h) where the corner zone ends. */
  exitSpeed: number;
  /** Lap distance (m) where the final braking phase begins, null when no braking. */
  brakeDist: number | null;
  /** Metres between the braking point and the apex (larger = earlier braking). */
  brakeBeforeApexM: number | null;
  /** Lap distance (m) where the driver is back to full throttle after the slowest point. */
  fullThrottleDist: number | null;
  /** Metres between the apex and full throttle (smaller = earlier). */
  fullThrottleAfterApexM: number | null;
  /** True when the corner is taken without braking and without leaving full throttle. */
  isFlat: boolean;
  /** Seconds spent between zone start and zone end. */
  zoneTimeS: number;
}

export interface LapSegment {
  key: string;
  kind: "corner" | "straight";
  label: string;
  startDistance: number;
  endDistance: number;
  /** Source corner zone for `kind === "corner"`. */
  zone: CornerZone | null;
}

export interface DeltaSummary {
  /** Total delta (s) accumulated in corner segments; + = slower than reference. */
  corners: number;
  /** Total delta (s) accumulated on straights; + = slower than reference. */
  straights: number;
  total: number;
  /** Index of the segment with the largest time gain, null when nothing is gained. */
  biggestGainIndex: number | null;
  /** Index of the segment with the largest time loss, null when nothing is lost. */
  biggestLossIndex: number | null;
}

/**
 * Linearly interpolates `pick(sample)` at a lap distance. Distances outside the
 * sampled range clamp to the first/last sample. Samples must be sorted by distM.
 */
export function valueAtDistance(
  samples: readonly TelemetrySample[],
  distance: number,
  pick: (sample: TelemetrySample) => number,
): number | null {
  const n = samples.length;
  if (n === 0 || !Number.isFinite(distance)) return null;
  const first = samples[0]!;
  const last = samples[n - 1]!;
  if (distance <= first.distM) return pick(first);
  if (distance >= last.distM) return pick(last);

  let lo = 0;
  let hi = n - 1;
  while (hi - lo > 1) {
    const mid = (lo + hi) >>> 1;
    if (samples[mid]!.distM <= distance) lo = mid;
    else hi = mid;
  }

  const a = samples[lo]!;
  const b = samples[hi]!;
  const span = b.distM - a.distM;
  const alpha = span > 0 ? (distance - a.distM) / span : 0;
  const av = pick(a);
  return av + (pick(b) - av) * alpha;
}

const pickTime = (s: TelemetrySample) => s.timeS;
const pickSpeed = (s: TelemetrySample) => s.speed;

/** Lap distance reached at `timeS` seconds into the lap (clamped to the samples). */
export function distanceAtTime(
  samples: readonly TelemetrySample[],
  timeS: number,
): number | null {
  const n = samples.length;
  if (n === 0 || !Number.isFinite(timeS)) return null;
  if (timeS <= samples[0]!.timeS) return samples[0]!.distM;
  if (timeS >= samples[n - 1]!.timeS) return samples[n - 1]!.distM;

  let lo = 0;
  let hi = n - 1;
  while (hi - lo > 1) {
    const mid = (lo + hi) >>> 1;
    if (samples[mid]!.timeS <= timeS) lo = mid;
    else hi = mid;
  }
  const a = samples[lo]!;
  const b = samples[hi]!;
  const span = b.timeS - a.timeS;
  const alpha = span > 0 ? (timeS - a.timeS) / span : 0;
  return a.distM + (b.distM - a.distM) * alpha;
}

/**
 * Prepends a synthetic sample at the timing line (timeS = 0). car_data starts
 * at the first sample after the line, so the lap's true start is extrapolated
 * back from the first sample's speed.
 */
export function withLapStart(
  samples: readonly TelemetrySample[],
): TelemetrySample[] {
  const first = samples[0];
  if (!first || !(first.timeS > 0)) return [...samples];
  const start: TelemetrySample = {
    ...first,
    timeS: 0,
    distM: first.distM - (first.timeS * first.speed) / 3.6,
  };
  // Synthetic sample: it has no wall-clock timestamp of its own.
  delete start.absMs;
  return [start, ...samples];
}

export interface AlignedLap {
  samples: TelemetrySample[];
  /** Distances of the timing lines crossed: lap start, sector lines, finish. */
  anchors: number[];
  /** Distance of the timing line at lap start. */
  startDistance: number;
  /** Distance of the timing line at lap end. */
  finishDistance: number;
}

export interface LapTiming {
  /** Official lap time (s). */
  lapS: number | null;
  /** Official sector 1 and sector 2 times (s); used as extra timing anchors. */
  sectorsS?: readonly (number | null)[];
}

/** Times (s from lap start) at which the lap crosses each known timing line. */
function anchorTimes({ lapS, sectorsS }: LapTiming): number[] {
  if (lapS === null || !(lapS > 0)) return [];
  const s1 = sectorsS?.[0];
  const s2 = sectorsS?.[1];
  if (s1 && s2 && s1 > 0 && s2 > 0 && s1 + s2 < lapS) {
    return [s1, s1 + s2, lapS];
  }
  return [lapS];
}

function isStrictlyIncreasing(values: readonly number[]): boolean {
  for (let i = 1; i < values.length; i++) {
    if (!(values[i]! > values[i - 1]!)) return false;
  }
  return values.length >= 2;
}

/** Piecewise-linear map of `d` from `src` anchor space to `dst` anchor space. */
function mapPiecewise(d: number, src: readonly number[], dst: readonly number[]) {
  let k = 0;
  while (k < src.length - 2 && d > src[k + 1]!) k++;
  const scale = (dst[k + 1]! - dst[k]!) / (src[k + 1]! - src[k]!);
  return dst[k]! + (d - src[k]!) * scale;
}

/**
 * Anchors a lap at the timing lines it crosses: the lap start, the official
 * sector lines and the finish. When `target` is given, distances are rescaled
 * piecewise so each timing line lands exactly where the target lap crossed it.
 * This removes most of the drift of speed-integrated distance, and segment
 * times add up to the official lap time.
 */
export function alignLap(
  samples: readonly TelemetrySample[],
  timing: LapTiming,
  target?: Pick<AlignedLap, "anchors">,
): AlignedLap | null {
  if (samples.length < 2) return null;
  const anchored = withLapStart(samples);
  const times = anchorTimes(timing);
  const own = [
    anchored[0]!.distM,
    ...(times.length > 0
      ? times.map((t) => distanceAtTime(anchored, t)!)
      : [anchored[anchored.length - 1]!.distM]),
  ];
  if (!isStrictlyIncreasing(own)) return null;

  if (!target) {
    return {
      samples: anchored,
      anchors: own,
      startDistance: own[0]!,
      finishDistance: own[own.length - 1]!,
    };
  }

  let src = own;
  let dst = target.anchors;
  // Fall back to start/finish only when the laps know different timing lines.
  if (src.length !== dst.length) {
    src = [own[0]!, own[own.length - 1]!];
    dst = [dst[0]!, dst[dst.length - 1]!];
  }
  if (!isStrictlyIncreasing(dst)) return null;

  return {
    samples: anchored.map((s) => ({ ...s, distM: mapPiecewise(s.distM, src, dst) })),
    anchors: [...dst],
    startDistance: dst[0]!,
    finishDistance: dst[dst.length - 1]!,
  };
}

/** Seconds a lap took to cover [from, to]; null when there is no telemetry. */
export function timeBetween(
  samples: readonly TelemetrySample[],
  from: number,
  to: number,
): number | null {
  const start = valueAtDistance(samples, from, pickTime);
  const end = valueAtDistance(samples, to, pickTime);
  if (start === null || end === null) return null;
  return end - start;
}

export function cornerZoneLabel(zone: Pick<CornerZone, "labels">): string {
  const first = zone.labels[0] ?? "?";
  const last = zone.labels[zone.labels.length - 1] ?? first;
  return zone.labels.length > 1 ? `T${first}–${last}` : `T${first}`;
}

/**
 * Measures how a single lap negotiates one corner zone: entry/min/exit speed,
 * braking point, return to full throttle and time spent in the zone.
 *
 * Brake/throttle points are reported relative to `apexDistance`. Pass the
 * reference lap's `minSpeedDist` so every driver is measured against the same
 * point; it defaults to this lap's own slowest point.
 */
export function analyzeCornerZone(
  zone: CornerZone,
  samples: readonly TelemetrySample[],
  apexDistance?: number,
): CornerDriverMetrics | null {
  if (samples.length < 2) return null;
  const { startDistance, endDistance } = zone;
  if (!(endDistance > startDistance)) return null;

  const entrySpeed = valueAtDistance(samples, startDistance, pickSpeed);
  const exitSpeed = valueAtDistance(samples, endDistance, pickSpeed);
  const zoneTimeS = timeBetween(samples, startDistance, endDistance);
  if (entrySpeed === null || exitSpeed === null || zoneTimeS === null) {
    return null;
  }

  let minSpeed = Math.min(entrySpeed, exitSpeed);
  let minSpeedDist = entrySpeed <= exitSpeed ? startDistance : endDistance;
  let minThrottle = Infinity;
  for (const sample of samples) {
    if (sample.distM < startDistance) continue;
    if (sample.distM > endDistance) break;
    if (sample.speed < minSpeed) {
      minSpeed = sample.speed;
      minSpeedDist = sample.distM;
    }
    if (sample.throttle < minThrottle) minThrottle = sample.throttle;
  }

  // Last braking phase that ends at or before the slowest point. Short brake-off
  // gaps are bridged; earlier, separate taps (e.g. a brush before a kink) are not.
  const brakeWindowStart = startDistance - CORNER_BRAKE_LOOKBACK_M;
  let lastBrakeIdx = -1;
  for (let i = 0; i < samples.length; i++) {
    const sample = samples[i]!;
    if (sample.distM < brakeWindowStart) continue;
    if (sample.distM > minSpeedDist) break;
    if (sample.brake >= CORNER_BRAKE_ON_PCT) lastBrakeIdx = i;
  }

  let brakeDist: number | null = null;
  if (lastBrakeIdx >= 0) {
    let runStart = lastBrakeIdx;
    for (let i = lastBrakeIdx - 1; i >= 0; i--) {
      const sample = samples[i]!;
      if (sample.distM < brakeWindowStart) break;
      if (sample.brake >= CORNER_BRAKE_ON_PCT) runStart = i;
      else if (samples[runStart]!.distM - sample.distM > CORNER_BRAKE_GAP_M) break;
    }
    brakeDist = samples[runStart]!.distM;
  }

  const throttleWindowEnd = endDistance + CORNER_THROTTLE_LOOKAHEAD_M;
  let fullThrottleDist: number | null = null;
  for (const sample of samples) {
    if (sample.distM < minSpeedDist) continue;
    if (sample.distM > throttleWindowEnd) break;
    if (sample.throttle >= CORNER_FULL_THROTTLE_PCT) {
      fullThrottleDist = sample.distM;
      break;
    }
  }

  const apex =
    apexDistance !== undefined && Number.isFinite(apexDistance)
      ? apexDistance
      : minSpeedDist;
  const isFlat =
    brakeDist === null &&
    (minThrottle === Infinity || minThrottle >= CORNER_FULL_THROTTLE_PCT);

  return {
    entrySpeed,
    minSpeed,
    minSpeedDist,
    exitSpeed,
    brakeDist,
    brakeBeforeApexM: brakeDist === null ? null : apex - brakeDist,
    fullThrottleDist,
    fullThrottleAfterApexM:
      fullThrottleDist === null ? null : fullThrottleDist - apex,
    isFlat,
    zoneTimeS,
  };
}

/**
 * Splits a lap into alternating straight and corner segments that tile
 * [lapStartDistance, lapEndDistance] without gaps, so per-segment deltas sum
 * to the lap delta.
 */
export function buildLapSegments(
  zones: readonly CornerZone[],
  lapEndDistance: number,
  lapStartDistance = 0,
): LapSegment[] {
  if (
    !Number.isFinite(lapEndDistance) ||
    !Number.isFinite(lapStartDistance) ||
    lapEndDistance <= lapStartDistance
  ) {
    return [];
  }

  const sorted = [...zones].sort((a, b) => a.startDistance - b.startDistance);
  const segments: LapSegment[] = [];
  let cursor = lapStartDistance;
  let previousLabel = "Start";

  const pushStraight = (to: number, nextLabel: string) => {
    if (to <= cursor) return;
    segments.push({
      key: `straight-${segments.length}`,
      kind: "straight",
      label: `${previousLabel} → ${nextLabel}`,
      startDistance: cursor,
      endDistance: to,
      zone: null,
    });
  };

  for (const zone of sorted) {
    const start = Math.min(Math.max(zone.startDistance, cursor), lapEndDistance);
    const end = Math.min(Math.max(zone.endDistance, start), lapEndDistance);
    const label = cornerZoneLabel(zone);
    const lastTurn = zone.labels[zone.labels.length - 1];

    pushStraight(start, label);
    cursor = Math.max(cursor, start);

    if (end > start) {
      segments.push({
        key: zone.key,
        kind: "corner",
        label,
        startDistance: start,
        endDistance: end,
        zone,
      });
      cursor = end;
    }
    previousLabel = lastTurn ? `T${lastTurn}` : label;
  }

  pushStraight(lapEndDistance, "Finish");
  return segments;
}

/**
 * Time delta per segment of `other` versus `ref`, in seconds.
 * Positive = `other` is slower than the reference through that segment.
 */
export function segmentDeltas(
  segments: readonly LapSegment[],
  ref: readonly TelemetrySample[],
  other: readonly TelemetrySample[],
): (number | null)[] {
  return segments.map((segment) => {
    const refTime = timeBetween(ref, segment.startDistance, segment.endDistance);
    const otherTime = timeBetween(
      other,
      segment.startDistance,
      segment.endDistance,
    );
    if (refTime === null || otherTime === null) return null;
    return otherTime - refTime;
  });
}

export function summarizeSegmentDeltas(
  segments: readonly LapSegment[],
  deltas: readonly (number | null)[],
): DeltaSummary {
  let corners = 0;
  let straights = 0;
  let biggestGainIndex: number | null = null;
  let biggestLossIndex: number | null = null;

  segments.forEach((segment, index) => {
    const delta = deltas[index];
    if (delta === null || delta === undefined || !Number.isFinite(delta)) {
      return;
    }
    if (segment.kind === "corner") corners += delta;
    else straights += delta;

    if (delta < 0 && (biggestGainIndex === null || delta < deltas[biggestGainIndex]!)) {
      biggestGainIndex = index;
    }
    if (delta > 0 && (biggestLossIndex === null || delta > deltas[biggestLossIndex]!)) {
      biggestLossIndex = index;
    }
  });

  return {
    corners,
    straights,
    total: corners + straights,
    biggestGainIndex,
    biggestLossIndex,
  };
}
