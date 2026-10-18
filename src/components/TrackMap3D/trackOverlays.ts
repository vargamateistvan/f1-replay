/**
 * Track markup and telemetry overlays for the 3D map, mirroring the 2D map's
 * enhanced visuals (start/finish line, S1/S2 ticks, direction chevrons, speed
 * heat, lap delta, elevation, braking hotspots, pit rejoin ghost).
 *
 * Per-segment telemetry reuses the 2D builders in `trackGeometry.ts`: they
 * only need ordered points plus normalized arc length, so we hand them the
 * centerline in lng/lat (`buildArcPolyline`).
 */
import type { ExpressionSpecification } from "mapbox-gl";
import type { CircuitGeometry } from "@/data/circuitGeometryTypes";
import { interpolateXY, type LocationIndex } from "@/timeline/interpolate";
import type {
  ArcPolyline,
  BrakingHotspot,
  SpeedSegment,
} from "@/components/TrackMap/trackGeometry";
import { speedToColor } from "@/components/TrackMap/trackMapFormat";
import {
  type CircuitGeoref,
  enuToLngLat,
  f1ToEnu,
  f1ToLngLat,
} from "@/utils/georef";
import type {
  FeatureCollection,
  LineFeature,
  LngLat,
  PointFeature,
} from "./mapFeatures";

/** Half-length of the start/finish and sector ticks, in metres. */
const TICK_HALF_M = 9;
const ARROW_COUNT = 10;

/**
 * The centerline as an `ArcPolyline` for the 2D overlay builders: `sx`/`sy`
 * carry lng/lat, `normArc` is arc length in the F1 frame (uniformly scaled
 * metres, so identical to the 2D map's SVG-space arc).
 */
export function buildArcPolyline(
  geom: CircuitGeometry,
  geo: CircuitGeoref,
): ArcPolyline {
  const svgPts = geom.x.map((x, i) => {
    const [lng, lat] = f1ToLngLat(geo, x, geom.y[i]!);
    return { sx: lng, sy: lat };
  });
  const cum = [0];
  for (let i = 1; i < geom.x.length; i++) {
    cum.push(
      cum[i - 1]! +
        Math.hypot(geom.x[i]! - geom.x[i - 1]!, geom.y[i]! - geom.y[i - 1]!),
    );
  }
  const total = cum[cum.length - 1] || 1;
  return { svgPts, normArc: cum.map((c) => c / total) };
}

/** Ground tick across the track at centerline index `i`, ±`halfM` metres. */
function tickAt(
  geom: CircuitGeometry,
  geo: CircuitGeoref,
  i: number,
  halfM: number,
): { line: LngLat[]; normal: { x: number; y: number }; at: { x: number; y: number } } {
  const n = geom.x.length;
  const a = f1ToEnu(geo, geom.x[i]!, geom.y[i]!);
  const b = f1ToEnu(geo, geom.x[(i + 1) % n]!, geom.y[(i + 1) % n]!);
  const len = Math.hypot(b.x - a.x, b.y - a.y) || 1;
  const normal = { x: -(b.y - a.y) / len, y: (b.x - a.x) / len };
  const end = (s: number) =>
    enuToLngLat(geo.originLng, geo.originLat, a.x + normal.x * halfM * s, a.y + normal.y * halfM * s);
  return { line: [end(1), end(-1)], normal, at: a };
}

/**
 * S1 / S2 ticks where sectors 2 and 3 begin (`boundaries`, lap fractions;
 * thirds by default as on the 2D map), plus a label point just off the track.
 */
export function buildSectorMarkers(
  geom: CircuitGeometry,
  geo: CircuitGeoref,
  arc: ArcPolyline,
  boundaries: [number, number] = [1 / 3, 2 / 3],
): { ticks: FeatureCollection<LineFeature>; labels: FeatureCollection<PointFeature> } {
  const ticks: LineFeature[] = [];
  const labels: PointFeature[] = [];
  for (const [target, label] of [
    [boundaries[0], "S1"],
    [boundaries[1], "S2"],
  ] as const) {
    const idx = Math.max(0, arc.normArc.findIndex((v) => v >= target) - 1);
    const tick = tickAt(geom, geo, idx, TICK_HALF_M * 0.9);
    ticks.push({
      type: "Feature",
      properties: { label },
      geometry: { type: "LineString", coordinates: tick.line },
    });
    const off = TICK_HALF_M * 1.6;
    labels.push({
      type: "Feature",
      properties: { label },
      geometry: {
        type: "Point",
        coordinates: enuToLngLat(
          geo.originLng,
          geo.originLat,
          tick.at.x + tick.normal.x * off,
          tick.at.y + tick.normal.y * off,
        ),
      },
    });
  }
  return {
    ticks: { type: "FeatureCollection", features: ticks },
    labels: { type: "FeatureCollection", features: labels },
  };
}

/** Ten chevrons evenly along the lap; `bearing` is the race direction. */
export function buildDirectionArrows(
  geom: CircuitGeometry,
  geo: CircuitGeoref,
): FeatureCollection<PointFeature> {
  const n = geom.x.length;
  const features: PointFeature[] = [];
  if (n < 12) return { type: "FeatureCollection", features };
  for (let k = 0; k < ARROW_COUNT; k++) {
    const i = Math.floor((k / ARROW_COUNT) * (n - 1));
    const a = f1ToEnu(geo, geom.x[i]!, geom.y[i]!);
    const b = f1ToEnu(geo, geom.x[(i + 1) % n]!, geom.y[(i + 1) % n]!);
    const bearing = ((Math.atan2(b.x - a.x, b.y - a.y) * 180) / Math.PI + 360) % 360;
    features.push({
      type: "Feature",
      properties: { bearing },
      geometry: { type: "Point", coordinates: f1ToLngLat(geo, geom.x[i]!, geom.y[i]!) },
    });
  }
  return { type: "FeatureCollection", features };
}

/** The centerline (lng/lat) as one open line, for gradient-coloured overlays. */
export function buildArcLine(arc: ArcPolyline): LineFeature {
  return {
    type: "Feature",
    properties: {},
    geometry: {
      type: "LineString",
      coordinates: arc.svgPts.map((p) => [p.sx, p.sy] as LngLat),
    },
  };
}

/** `color` (hex or `hsl(...)`) with an alpha channel. */
export function withAlpha(color: string, alpha: number): string {
  const a = Math.max(0, Math.min(1, alpha)).toFixed(3);
  const hsl = /^hsl\(([^)]+)\)$/i.exec(color.trim());
  if (hsl) return `hsla(${hsl[1]},${a})`;
  const hex = /^#?([0-9a-f]{6})$/i.exec(color.trim());
  if (hex) {
    const n = parseInt(hex[1]!, 16);
    return `rgba(${(n >> 16) & 255},${(n >> 8) & 255},${n & 255},${a})`;
  }
  return color;
}

/**
 * A `line-gradient` for the arc line from per-segment colours. Segment i runs
 * between centerline points i and i+1 (as the 2D builders emit them), so its
 * stop sits at that span's mid-arc. One continuous line avoids the blobs and
 * wedge gaps that per-segment lines leave at every joint.
 */
export function gradientFromSegments(
  arc: ArcPolyline,
  segments: ReadonlyArray<{ color: string; opacity: number }>,
): ExpressionSpecification | null {
  if (segments.length === 0) return null;
  const stops: Array<number | string> = [];
  let last = -1;
  segments.forEach((seg, i) => {
    const a = arc.normArc[i];
    const b = arc.normArc[i + 1];
    if (a === undefined || b === undefined) return;
    const mid = (a + b) / 2;
    if (mid <= last) return; // stops must strictly increase
    last = mid;
    stops.push(mid, withAlpha(seg.color, seg.opacity));
  });
  if (stops.length < 4) return null;
  return [
    "interpolate",
    ["linear"],
    ["line-progress"],
    ...stops,
  ] as ExpressionSpecification;
}

/** Speed-heat segments with the 2D map's colours. */
export function heatColors(
  segments: readonly SpeedSegment[],
): Array<{ color: string; opacity: number }> {
  return segments.map((s) => ({ color: speedToColor(s.speed), opacity: 0.9 }));
}

/** Braking hotspots as points; `radius` stays in 2D SVG units. */
export function buildHotspotPoints(
  hotspots: readonly BrakingHotspot[],
): FeatureCollection<PointFeature> {
  return {
    type: "FeatureCollection",
    features: hotspots.map((h) => ({
      type: "Feature",
      properties: { radius: h.radius, opacity: h.opacity },
      geometry: { type: "Point", coordinates: [h.x, h.y] },
    })),
  };
}

/** Canvas chevron matching the 2D direction arrow, pointing up (north). */
export function drawChevron(
  ctx: CanvasRenderingContext2D,
  unit: number,
  color: string,
): void {
  const c = 4 * unit;
  ctx.save();
  ctx.translate(c, c);
  // 2D path "M-3.4,-1.5 L2.8,0 L-3.4,1.5" points along +x; rotate to point up.
  ctx.rotate(-Math.PI / 2);
  ctx.beginPath();
  ctx.moveTo(-3.4 * unit, -1.5 * unit);
  ctx.lineTo(2.8 * unit, 0);
  ctx.lineTo(-3.4 * unit, 1.5 * unit);
  ctx.strokeStyle = color;
  ctx.lineWidth = 0.9 * unit;
  ctx.lineCap = "round";
  ctx.lineJoin = "round";
  ctx.stroke();
  ctx.restore();
}

/**
 * Canvas pit rejoin ghost matching the 2D `PitRejoinGhost` (without its
 * label, which the map draws as text). Canvas side is `2 * 10 * unit`.
 */
export function drawPitGhost(
  ctx: CanvasRenderingContext2D,
  unit: number,
  color: string,
): void {
  const c = 10 * unit;
  const circle = (r: number) => {
    ctx.beginPath();
    ctx.arc(c, c, r * unit, 0, Math.PI * 2);
  };
  ctx.save();
  ctx.fillStyle = color;
  ctx.globalAlpha = 0.12;
  circle(9);
  ctx.fill();
  ctx.globalAlpha = 0.95;
  ctx.strokeStyle = color;
  ctx.lineWidth = 1.4 * unit;
  ctx.setLineDash([2.4 * unit, 1.8 * unit]);
  circle(6);
  ctx.stroke();
  ctx.setLineDash([]);
  circle(1.6);
  ctx.fill();
  ctx.restore();
}

/**
 * The focused car's recent path, oldest → newest, sampled every `stepMs` over
 * the last `windowMs` before `t`. Null when there's not enough trace (or the
 * car is off track) to draw a line.
 */
export function buildTrail(
  idx: LocationIndex,
  t: number,
  geo: CircuitGeoref,
  windowMs: number,
  stepMs: number,
): LineFeature | null {
  if (idx.times.length < 2) return null;
  const first = idx.times[0]!;
  const coords: LngLat[] = [];
  for (let s = Math.max(first, t - windowMs); s <= t; s += stepMs) {
    const p = interpolateXY(idx, s);
    if (!p || (p.x === 0 && p.y === 0)) continue;
    coords.push(f1ToLngLat(geo, p.x, p.y));
  }
  const now = interpolateXY(idx, t);
  if (now && !(now.x === 0 && now.y === 0)) coords.push(f1ToLngLat(geo, now.x, now.y));
  if (coords.length < 2) return null;
  return { type: "Feature", properties: {}, geometry: { type: "LineString", coordinates: coords } };
}

/** `line-gradient` fading from transparent (oldest) to `hex` (the car). */
export function trailGradient(hex: string): ExpressionSpecification {
  const m = /^#?([0-9a-f]{6})$/i.exec(hex.trim());
  const n = m ? parseInt(m[1]!, 16) : 0xffffff;
  const rgb = `${(n >> 16) & 255},${(n >> 8) & 255},${n & 255}`;
  return [
    "interpolate",
    ["linear"],
    ["line-progress"],
    0,
    `rgba(${rgb},0)`,
    1,
    `rgba(${rgb},0.9)`,
  ] as ExpressionSpecification;
}
