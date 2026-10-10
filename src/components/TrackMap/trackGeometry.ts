import type { CarData, Location } from "@/api/types";
import { locationToSvg, type TrackBounds } from "@/hooks/useTrackMap";
import type { TelemetrySample } from "@/hooks/useCarDataForLap";
import type { MarshalSector } from "@/data/circuitGeometryTypes";
import { timingSectorForMarshalPost } from "@/timeline/raceControl";
import { resampleToAxis } from "@/utils/telemetry";
import {
  TRACK_SVG_W as SVG_W,
  TRACK_SVG_H as SVG_H,
  TRACK_SVG_PAD as PAD,
} from "@/constants";

export interface SvgPoint {
  sx: number;
  sy: number;
}

/** Session-static SVG geometry derived once from the track outline. */
export interface TrackGeometry {
  pathData: string;
  bounds: TrackBounds;
  innerW: number;
  innerH: number;
  /** Outline points in padded SVG space. */
  svgPts: SvgPoint[];
  /** Normalized cumulative arc length (0–1) for each of `svgPts`. */
  normArc: number[];
}

export interface TrackSegment {
  x1: number;
  y1: number;
  x2: number;
  y2: number;
}

export interface SpeedSegment extends TrackSegment {
  speed: number;
}

export interface TintedSegment extends TrackSegment {
  color: string;
  opacity: number;
}

export interface BrakingHotspot {
  key: string;
  x: number;
  y: number;
  radius: number;
  opacity: number;
}

export interface MarshalHeatmapSegment {
  arcStart: number;
  len: number;
  sector: 1 | 2 | 3;
  index: number;
  marshalNumber: number;
  /** Position along the lap, used to alternate opacity between neighbours. */
  i: number;
}

export interface SvgRect {
  x: number;
  y: number;
  w: number;
  h: number;
}

/** Project an OpenF1 coordinate into padded SVG space. */
export function projectToSvg(
  geom: Pick<TrackGeometry, "bounds" | "innerW" | "innerH">,
  x: number,
  y: number,
): SvgPoint {
  const { sx, sy } = locationToSvg(x, y, geom.bounds, geom.innerW, geom.innerH);
  return { sx: sx + PAD, sy: sy + PAD };
}

/** Project an axis-aligned OpenF1 bounding box into a padded SVG rectangle. */
export function projectBoundsToSvgRect(
  geom: Pick<TrackGeometry, "bounds" | "innerW" | "innerH">,
  box: { minX: number; minY: number; maxX: number; maxY: number },
): SvgRect {
  const { sx: sx1, sy: sy1 } = locationToSvg(
    box.minX,
    box.minY,
    geom.bounds,
    geom.innerW,
    geom.innerH,
  );
  const { sx: sx2, sy: sy2 } = locationToSvg(
    box.maxX,
    box.maxY,
    geom.bounds,
    geom.innerW,
    geom.innerH,
  );
  return {
    x: Math.min(sx1, sx2) + PAD,
    y: Math.min(sy1, sy2) + PAD,
    w: Math.abs(sx2 - sx1),
    h: Math.abs(sy2 - sy1),
  };
}

export function buildTrackGeometry(outline: {
  points: ReadonlyArray<{ x: number; y: number }>;
  bounds: TrackBounds;
}): TrackGeometry {
  const { points, bounds } = outline;
  const innerW = SVG_W - PAD * 2;
  const innerH = SVG_H - PAD * 2;

  const svgPts = points.map((p) => {
    const { sx, sy } = locationToSvg(p.x, p.y, bounds, innerW, innerH);
    return { sx: sx + PAD, sy: sy + PAD };
  });
  const n = svgPts.length;
  const get = (i: number) => svgPts[((i % n) + n) % n]!;
  // Closed Catmull-Rom spline through the outline, expressed as cubic Béziers.
  let pathData = `M${get(0).sx.toFixed(1)},${get(0).sy.toFixed(1)}`;
  for (let i = 0; i < n; i++) {
    const p0 = get(i - 1),
      p1 = get(i),
      p2 = get(i + 1),
      p3 = get(i + 2);
    const cp1x = p1.sx + (p2.sx - p0.sx) / 6;
    const cp1y = p1.sy + (p2.sy - p0.sy) / 6;
    const cp2x = p2.sx - (p3.sx - p1.sx) / 6;
    const cp2y = p2.sy - (p3.sy - p1.sy) / 6;
    pathData += ` C${cp1x.toFixed(1)},${cp1y.toFixed(1)} ${cp2x.toFixed(1)},${cp2y.toFixed(1)} ${p2.sx.toFixed(1)},${p2.sy.toFixed(1)}`;
  }
  pathData += " Z";

  // Normalized cumulative arc length for each outline point — used to map
  // telemetry distance (0–1) onto track geometry for the speed heat overlay.
  const arcLengths: number[] = [0];
  for (let i = 0; i < svgPts.length - 1; i++) {
    const dx = svgPts[i + 1]!.sx - svgPts[i]!.sx;
    const dy = svgPts[i + 1]!.sy - svgPts[i]!.sy;
    arcLengths.push(arcLengths[i]! + Math.sqrt(dx * dx + dy * dy));
  }
  const totalArc = arcLengths[arcLengths.length - 1] || 1;
  const normArc = arcLengths.map((l) => l / totalArc);

  return { pathData, bounds, innerW, innerH, svgPts, normArc };
}

/** Index of the first element whose `valueOf(el)` is ≥ `target` (clamped to the last index). */
function lowerBound<T>(
  arr: readonly T[],
  target: number,
  valueOf: (el: T) => number,
): number {
  let lo = 0;
  let hi = arr.length - 1;
  while (lo < hi) {
    const mid = (lo + hi) >>> 1;
    if (valueOf(arr[mid]!) < target) lo = mid + 1;
    else hi = mid;
  }
  return lo;
}

/** Index of the outline point nearest to (x, y), by squared distance. */
export function nearestSvgPointIndex(
  svgPts: readonly SvgPoint[],
  x: number,
  y: number,
): number {
  let bestIdx = 0;
  let bestDist = Infinity;
  for (let j = 0; j < svgPts.length; j++) {
    const dx = svgPts[j]!.sx - x;
    const dy = svgPts[j]!.sy - y;
    const d = dx * dx + dy * dy;
    if (d < bestDist) {
      bestDist = d;
      bestIdx = j;
    }
  }
  return bestIdx;
}

/** Call `fn` with each outline segment's midpoint arc position (0–1). */
function mapOutlineSegments<T>(
  geom: TrackGeometry,
  fn: (segment: TrackSegment, midNorm: number) => T,
): T[] {
  const { svgPts, normArc } = geom;
  return svgPts.slice(0, -1).map((pt, i) => {
    const next = svgPts[i + 1]!;
    const midNorm = (normArc[i]! + normArc[i + 1]!) / 2;
    return fn({ x1: pt.sx, y1: pt.sy, x2: next.sx, y2: next.sy }, midNorm);
  });
}

/** Colour each outline segment by the lap's recorded speed at that distance. */
export function buildHeatSegments(
  geom: TrackGeometry | null,
  samples: readonly TelemetrySample[] | null | undefined,
): SpeedSegment[] {
  if (!geom || !samples?.length) return [];
  const totalDist = samples[samples.length - 1]!.distM || 1;
  return mapOutlineSegments(geom, (segment, midNorm) => {
    const lo = lowerBound(samples, midNorm * totalDist, (s) => s.distM);
    const sample = samples[lo] ?? samples[samples.length - 1]!;
    return { ...segment, speed: sample.speed };
  });
}

/** Elevation tint from a reference driver's GPS z-values (baked geometry only). */
export function buildElevationSegments(
  geom: TrackGeometry | null,
  locationData: readonly Location[],
  referenceDriver: number | null,
  lightMode: boolean,
): TintedSegment[] {
  if (!geom || referenceDriver == null) return [];

  const samples = locationData
    .filter((loc) => loc.driver_number === referenceDriver)
    .map((loc) => ({
      t: new Date(loc.date).getTime(),
      x: loc.x,
      y: loc.y,
      z: loc.z,
    }))
    .sort((a, b) => a.t - b.t);

  if (samples.length < 2) return [];

  const cumulative: number[] = [0];
  for (let i = 1; i < samples.length; i++) {
    const prev = samples[i - 1]!;
    const curr = samples[i]!;
    cumulative.push(
      cumulative[i - 1]! + Math.hypot(curr.x - prev.x, curr.y - prev.y),
    );
  }

  const totalDist = cumulative.at(-1) || 1;
  if (totalDist <= 0) return [];

  const normSamples = samples.map((sample, i) => ({
    norm: cumulative[i]! / totalDist,
    z: sample.z,
  }));

  let minZ = Number.POSITIVE_INFINITY;
  let maxZ = Number.NEGATIVE_INFINITY;
  for (const sample of normSamples) {
    if (sample.z < minZ) minZ = sample.z;
    if (sample.z > maxZ) maxZ = sample.z;
  }

  const zRange = maxZ - minZ;
  if (!Number.isFinite(zRange) || zRange < 0.5) return [];

  return mapOutlineSegments(geom, (segment, midNorm) => {
    const lo = lowerBound(normSamples, midNorm, (s) => s.norm);
    const sample = normSamples[lo] ?? normSamples.at(-1)!;
    const rawRatio = (sample.z - minZ) / zRange;
    const ratio = Number.isFinite(rawRatio)
      ? Math.max(0, Math.min(rawRatio, 1))
      : 0;
    const hue = Math.round(220 - ratio * 190);
    const lightness = lightMode ? 42 : 58;
    return {
      ...segment,
      color: `hsl(${hue},78%,${lightness}%)`,
      opacity: 0.14 + ratio * 0.34,
    };
  });
}

/** Green where the current lap is ahead of the reference lap, red where behind. */
export function buildDeltaSegments(
  geom: TrackGeometry | null,
  currentSamples: TelemetrySample[] | null | undefined,
  referenceSamples: TelemetrySample[] | null | undefined,
): TintedSegment[] {
  if (!geom || !currentSamples?.length || !referenceSamples?.length) {
    return [];
  }

  const resampledReference = resampleToAxis(currentSamples, referenceSamples);
  const totalDist = currentSamples.at(-1)?.distM || 1;

  return mapOutlineSegments(geom, (segment, midNorm) => {
    const lo = lowerBound(currentSamples, midNorm * totalDist, (s) => s.distM);
    const current = currentSamples[lo] ?? currentSamples.at(-1)!;
    const reference = resampledReference[lo] ?? resampledReference.at(-1)!;
    const deltaS = reference.timeS - current.timeS;
    const rawIntensity = Math.abs(deltaS) / 0.18;
    const intensity = Number.isFinite(rawIntensity)
      ? Math.min(rawIntensity, 1)
      : 0;
    return {
      ...segment,
      color: deltaS >= 0 ? "#33d17a" : "#ff5b6e",
      opacity: 0.1 + intensity * 0.38,
    };
  });
}

/** Peak-brake points of each hard braking zone on the lap (max 8). */
export function buildBrakingHotspots(
  geom: TrackGeometry | null,
  samples: readonly TelemetrySample[] | null | undefined,
): BrakingHotspot[] {
  if (!geom || !samples?.length) return [];

  const totalDist = samples.at(-1)?.distM || 1;
  const peaks: TelemetrySample[] = [];
  let currentPeak: TelemetrySample | null = null;

  for (const sample of samples) {
    const hardBrake = sample.brake >= 72 && sample.speed >= 90;
    if (hardBrake) {
      if (!currentPeak || sample.brake > currentPeak.brake) {
        currentPeak = sample;
      }
    } else if (currentPeak) {
      peaks.push(currentPeak);
      currentPeak = null;
    }
  }
  if (currentPeak) peaks.push(currentPeak);

  const { svgPts, normArc } = geom;
  return peaks.slice(0, 8).map((sample, index) => {
    const sampleNorm = totalDist > 0 ? sample.distM / totalDist : 0;
    const pointIndex = normArc.findIndex((value) => value >= sampleNorm);
    const point =
      svgPts[pointIndex === -1 ? svgPts.length - 1 : pointIndex] ?? svgPts[0]!;
    const rawIntensity = (sample.brake - 70) / 30;
    const intensity = Number.isFinite(rawIntensity)
      ? Math.max(0, Math.min(rawIntensity, 1))
      : 0;
    return {
      key: `brake-hotspot-${index}-${sample.distM.toFixed(0)}`,
      x: point.sx,
      y: point.sy,
      radius: 4 + intensity * 5,
      opacity: 0.14 + intensity * 0.24,
    };
  });
}

/** Min / average / max speed (km/h) across a lap. */
export function computeSpeedStats(
  samples: readonly TelemetrySample[] | null | undefined,
): { min: number; avg: number; max: number } | null {
  if (!samples?.length) return null;
  let min = Number.POSITIVE_INFINITY;
  let max = Number.NEGATIVE_INFINITY;
  let sum = 0;
  for (const sample of samples) {
    const speed = sample.speed;
    if (speed < min) min = speed;
    if (speed > max) max = speed;
    sum += speed;
  }
  return { min, avg: sum / samples.length, max };
}

/**
 * One arc segment per marshal post, ordered along the lap. Each segment runs
 * from its post to the next one (the last runs to the finish line).
 */
export function buildMarshalHeatmapSegments(
  geom: TrackGeometry | null,
  marshalSectors: readonly MarshalSector[] | undefined,
): MarshalHeatmapSegment[] {
  if (!geom || !marshalSectors?.length) return [];
  const { svgPts, normArc } = geom;
  const total = marshalSectors.length;

  // Map each marshal sector to the nearest svgPts index → normArc position.
  const postArcs = marshalSectors.map((ms, i) => {
    const { sx, sy } = projectToSvg(
      geom,
      ms.trackPosition.x,
      ms.trackPosition.y,
    );
    const bestIdx = nearestSvgPointIndex(svgPts, sx, sy);
    return {
      arc: normArc[bestIdx]!,
      sector: timingSectorForMarshalPost(ms.number, total),
      index: i,
      marshalNumber: ms.number,
    };
  });

  postArcs.sort((a, b) => a.arc - b.arc);

  return postArcs.map((post, i) => {
    const next = postArcs[i + 1];
    const arcStart = post.arc;
    const arcEnd = next ? next.arc : 1;
    const len = Math.max(arcEnd - arcStart, 0.001);
    return {
      arcStart,
      len,
      sector: post.sector,
      index: post.index,
      marshalNumber: post.marshalNumber,
      i,
    };
  });
}

/**
 * The car_data row nearest the playhead (first row at or after `targetMs`),
 * or null when the nearest row is more than 30 s away.
 */
export function carDataAt(
  rows: readonly CarData[],
  targetMs: number,
): CarData | null {
  if (!rows.length) return null;
  const lo = lowerBound(rows, targetMs, (row) => new Date(row.date).getTime());
  const s = rows[lo] ?? rows[rows.length - 1]!;
  const diff = Math.abs(new Date(s.date).getTime() - targetMs);
  return diff < 30_000 ? s : null;
}
