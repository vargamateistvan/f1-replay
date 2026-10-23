import type { CircuitGeometry } from "@/data/circuitGeometryTypes";
import { F1_UNITS_PER_METRE } from "@/constants";

export type CircuitDirection = "clockwise" | "anticlockwise";

export interface CircuitStats {
  /** Centerline length — within ~1% of the official figure. */
  lengthKm: number;
  /** Distinct corner numbers (5 and 5a count once); null for GPS-baked circuits. */
  turns: number | null;
  direction: CircuitDirection;
}

export interface CircuitThumbnail {
  /** Closed outline path. */
  path: string;
  /** Opening part of the lap, drawn with an arrowhead to show direction. */
  arrowPath: string;
  /** Start/finish tick across the track at the first centerline point. */
  startLine: { x1: number; y1: number; x2: number; y2: number };
}

type Geometry = Pick<CircuitGeometry, "x" | "y" | "corners" | "rotation" | "source">;

export function circuitStats(geometry: Geometry): CircuitStats {
  const { x, y } = geometry;
  const n = x.length;
  let length = 0;
  let twiceArea = 0;
  for (let i = 0; i < n; i++) {
    const j = (i + 1) % n;
    length += Math.hypot(x[j]! - x[i]!, y[j]! - y[i]!);
    twiceArea += x[i]! * y[j]! - x[j]! * y[i]!;
  }
  return {
    lengthKm: length / F1_UNITS_PER_METRE / 1000,
    turns:
      geometry.source === "openf1-gps" || geometry.corners.length === 0
        ? null
        : new Set(geometry.corners.map((c) => c.number)).size,
    // The F1 frame is Y-up, so a positive shoelace area is anticlockwise.
    direction: twiceArea > 0 ? "anticlockwise" : "clockwise",
  };
}

const fmt = (v: number) => v.toFixed(1);

function toPath(points: { x: number; y: number }[], close: boolean): string {
  const d = points.map((p, i) => `${i === 0 ? "M" : "L"}${fmt(p.x)} ${fmt(p.y)}`);
  return d.join("") + (close ? "Z" : "");
}

// Outline fitted into a width × height box, oriented like the main track map
// (Y flipped to SVG, then the baked broadcast rotation applied).
export function circuitThumbnail(
  geometry: Geometry,
  width: number,
  height: number,
  pad: number,
  arrowFraction: number,
): CircuitThumbnail | null {
  const n = geometry.x.length;
  if (n < 3) return null;
  const theta = (-geometry.rotation * Math.PI) / 180;
  const cos = Math.cos(theta);
  const sin = Math.sin(theta);
  const rotated = geometry.x.map((x, i) => {
    const sy = -geometry.y[i]!;
    return { x: x * cos - sy * sin, y: x * sin + sy * cos };
  });

  let minX = Infinity;
  let maxX = -Infinity;
  let minY = Infinity;
  let maxY = -Infinity;
  for (const p of rotated) {
    minX = Math.min(minX, p.x);
    maxX = Math.max(maxX, p.x);
    minY = Math.min(minY, p.y);
    maxY = Math.max(maxY, p.y);
  }
  const spanX = maxX - minX || 1;
  const spanY = maxY - minY || 1;
  const scale = Math.min((width - pad * 2) / spanX, (height - pad * 2) / spanY);
  const offX = (width - spanX * scale) / 2;
  const offY = (height - spanY * scale) / 2;
  const pts = rotated.map((p) => ({
    x: (p.x - minX) * scale + offX,
    y: (p.y - minY) * scale + offY,
  }));

  const arrowEnd = Math.max(2, Math.round(n * arrowFraction));
  const a = pts[0]!;
  const b = pts[1]!;
  const len = Math.hypot(b.x - a.x, b.y - a.y) || 1;
  const half = pad * 0.7;
  const nx = (-(b.y - a.y) / len) * half;
  const ny = ((b.x - a.x) / len) * half;

  return {
    path: toPath(pts, true),
    arrowPath: toPath(pts.slice(0, arrowEnd + 1), false),
    startLine: { x1: a.x - nx, y1: a.y - ny, x2: a.x + nx, y2: a.y + ny },
  };
}
