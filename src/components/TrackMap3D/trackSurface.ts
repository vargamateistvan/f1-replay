/**
 * Ground-truth track surface for the 3D map: real-width asphalt, verge and
 * pit-lane polygons, striped kerbs at the corners and a chequered start grid,
 * all built by offsetting the baked centerline in local metres.
 */
import type { CircuitGeometry } from "@/data/circuitGeometryTypes";
import {
  MAP3D_KERB_BLOCK_M,
  MAP3D_KERB_WIDTH_M,
  MAP3D_PIT_LANE_HALF_WIDTH_M,
  MAP3D_START_GRID_COLUMNS,
  MAP3D_START_GRID_DEPTH_M,
  MAP3D_START_GRID_ROWS,
  MAP3D_TRACK_HALF_WIDTH_M,
  MAP3D_VERGE_M,
} from "@/constants";
import { type CircuitGeoref, enuToLngLat, f1ToEnu } from "@/utils/georef";
import type { FeatureCollection, LngLat } from "./mapFeatures";

interface P {
  x: number;
  y: number;
}

export interface PolygonFeature {
  type: "Feature";
  properties: Record<string, string | number>;
  geometry: { type: "Polygon"; coordinates: LngLat[][] };
}

export type PolygonCollection = FeatureCollection<PolygonFeature>;

const polygons = (rings: LngLat[][][]): PolygonCollection => ({
  type: "FeatureCollection",
  features: rings.map((coordinates) => ({
    type: "Feature",
    properties: {},
    geometry: { type: "Polygon", coordinates },
  })),
});

/** Resample a polyline at `step` metres (closed loops wrap back to the start). */
export function resample(points: readonly P[], step: number, closed: boolean): P[] {
  const pts = closed ? [...points, points[0]!] : [...points];
  const out: P[] = [];
  let carry = 0;
  for (let i = 0; i < pts.length - 1; i++) {
    const a = pts[i]!;
    const b = pts[i + 1]!;
    const len = Math.hypot(b.x - a.x, b.y - a.y);
    let d = carry;
    while (d < len) {
      const u = d / len;
      out.push({ x: a.x + (b.x - a.x) * u, y: a.y + (b.y - a.y) * u });
      d += step;
    }
    carry = d - len;
  }
  if (!closed) out.push(pts[pts.length - 1]!);
  return out;
}

/** Unit left-hand normal at each point, from the central-difference tangent. */
export function normals(pts: readonly P[], closed: boolean): P[] {
  const n = pts.length;
  return pts.map((_, i) => {
    const prev = pts[closed ? (i - 1 + n) % n : Math.max(0, i - 1)]!;
    const next = pts[closed ? (i + 1) % n : Math.min(n - 1, i + 1)]!;
    const tx = next.x - prev.x;
    const ty = next.y - prev.y;
    const len = Math.hypot(tx, ty) || 1;
    return { x: -ty / len, y: tx / len };
  });
}

/**
 * Offset a resampled polyline by `d` metres along its left normal (negative =
 * right). Points that would run backwards — the inside of a corner tighter
 * than `|d|` — are dropped so the ring doesn't fold over itself.
 */
export function offsetLine(
  pts: readonly P[],
  nrm: readonly P[],
  d: number,
): P[] {
  const out: P[] = [];
  for (let i = 0; i < pts.length; i++) {
    const p = { x: pts[i]!.x + nrm[i]!.x * d, y: pts[i]!.y + nrm[i]!.y * d };
    const prev = out[out.length - 1];
    if (prev && i > 0) {
      const tx = pts[i]!.x - pts[i - 1]!.x;
      const ty = pts[i]!.y - pts[i - 1]!.y;
      if ((p.x - prev.x) * tx + (p.y - prev.y) * ty <= 0) continue;
    }
    out.push(p);
  }
  return out;
}

/** Ring of a closed band between offsets `a` and `b` (as a polygon with a hole). */
function loopBand(pts: readonly P[], nrm: readonly P[], a: number, b: number, toLL: (p: P) => LngLat) {
  const close = (ring: LngLat[]) => [...ring, ring[0]!];
  const outer = offsetLine(pts, nrm, Math.max(a, b)).map(toLL);
  const inner = offsetLine(pts, nrm, Math.min(a, b)).map(toLL).reverse();
  return [close(outer), close(inner)];
}

/** Closed polygon for an open band between offsets `a` and `b`. */
function stripBand(pts: readonly P[], nrm: readonly P[], a: number, b: number, toLL: (p: P) => LngLat) {
  const left = offsetLine(pts, nrm, a).map(toLL);
  const right = offsetLine(pts, nrm, b).map(toLL).reverse();
  const ring = [...left, ...right];
  return [[...ring, ring[0]!]];
}

/** Signed curvature sign at index i: + turning left, - turning right. */
function turnSign(pts: readonly P[], i: number, span: number): number {
  const n = pts.length;
  const a = pts[(i - span + n) % n]!;
  const b = pts[i]!;
  const c = pts[(i + span) % n]!;
  const cross = (b.x - a.x) * (c.y - b.y) - (b.y - a.y) * (c.x - b.x);
  return cross >= 0 ? 1 : -1;
}

export interface TrackSurface {
  verge: PolygonCollection;
  track: PolygonCollection;
  pitLane: PolygonCollection;
  kerbsBase: PolygonCollection;
  kerbsStripes: PolygonCollection;
  startBase: PolygonCollection;
  startSquares: PolygonCollection;
}

const STEP_M = 1;
/** Kerb extents around each corner apex, in metres along the track. */
const INSIDE_KERB = [-22, 18] as const;
const OUTSIDE_KERB = [8, 40] as const;

export function buildTrackSurface(
  geom: CircuitGeometry,
  geo: CircuitGeoref,
  pitLane?: { x: readonly number[]; y: readonly number[] } | null,
): TrackSurface {
  const toLL = (p: P): LngLat => enuToLngLat(geo.originLng, geo.originLat, p.x, p.y);
  const center = resample(
    geom.x.map((x, i) => f1ToEnu(geo, x, geom.y[i]!)),
    STEP_M,
    true,
  );
  const nrm = normals(center, true);
  const half = MAP3D_TRACK_HALF_WIDTH_M;

  const verge = polygons([loopBand(center, nrm, -(half + MAP3D_VERGE_M), half + MAP3D_VERGE_M, toLL)]);
  const track = polygons([loopBand(center, nrm, -half, half, toLL)]);

  let pit: PolygonCollection = polygons([]);
  if (pitLane && pitLane.x.length > 1) {
    const lane = resample(
      pitLane.x.map((x, i) => f1ToEnu(geo, x, pitLane.y[i]!)),
      STEP_M,
      false,
    );
    const pitHalf = MAP3D_PIT_LANE_HALF_WIDTH_M;
    pit = polygons([stripBand(lane, normals(lane, false), pitHalf, -pitHalf, toLL)]);
  }

  // Kerbs: an inside kerb through each apex and an outside kerb on the exit,
  // as a base strip plus every other 2 m block for the stripes.
  const n = center.length;
  const kerbBase: LngLat[][][] = [];
  const kerbStripes: LngLat[][][] = [];
  const addKerb = (from: number, to: number, side: number) => {
    const idx: number[] = [];
    for (let k = from; k <= to; k++) idx.push(((k % n) + n) % n);
    const pts = idx.map((i) => center[i]!);
    const nr = idx.map((i) => nrm[i]!);
    const inner = side * half;
    const outer = side * (half + MAP3D_KERB_WIDTH_M);
    kerbBase.push(stripBand(pts, nr, inner, outer, toLL));
    const block = Math.max(1, Math.round(MAP3D_KERB_BLOCK_M / STEP_M));
    for (let s = 0; s + block < pts.length; s += block * 2) {
      kerbStripes.push(
        stripBand(pts.slice(s, s + block + 1), nr.slice(s, s + block + 1), inner, outer, toLL),
      );
    }
  };
  for (const corner of geom.corners) {
    const c = f1ToEnu(geo, corner.trackPosition.x, corner.trackPosition.y);
    let apex = 0;
    let best = Infinity;
    for (let i = 0; i < n; i++) {
      const d = (center[i]!.x - c.x) ** 2 + (center[i]!.y - c.y) ** 2;
      if (d < best) {
        best = d;
        apex = i;
      }
    }
    const turn = turnSign(center, apex, 15);
    // Left turn → inside is the left (+normal) side.
    addKerb(apex + INSIDE_KERB[0] / STEP_M, apex + INSIDE_KERB[1] / STEP_M, turn);
    addKerb(apex + OUTSIDE_KERB[0] / STEP_M, apex + OUTSIDE_KERB[1] / STEP_M, -turn);
  }

  // Start line: a chequered grid across the track at centerline index 0.
  const depth = MAP3D_START_GRID_DEPTH_M;
  const rows = MAP3D_START_GRID_ROWS;
  const cols = MAP3D_START_GRID_COLUMNS;
  const p0 = center[0]!;
  const nr0 = nrm[0]!;
  const t0 = { x: nr0.y, y: -nr0.x }; // forward tangent
  const at = (along: number, across: number): LngLat =>
    toLL({
      x: p0.x + t0.x * along + nr0.x * across,
      y: p0.y + t0.y * along + nr0.y * across,
    });
  const quad = (a0: number, a1: number, c0: number, c1: number) => [
    [at(a0, c0), at(a1, c0), at(a1, c1), at(a0, c1), at(a0, c0)],
  ];
  const startBase = polygons([quad(-depth / 2, depth / 2, -half, half)]);
  const squares: LngLat[][][] = [];
  const rowM = depth / rows;
  const colM = (2 * half) / cols;
  for (let r = 0; r < rows; r++) {
    for (let c = 0; c < cols; c++) {
      if ((r + c) % 2 === 0) continue;
      const a0 = -depth / 2 + r * rowM;
      const c0 = -half + c * colM;
      squares.push(quad(a0, a0 + rowM, c0, c0 + colM));
    }
  }

  return {
    verge,
    track,
    pitLane: pit,
    kerbsBase: polygons(kerbBase),
    kerbsStripes: polygons(kerbStripes),
    startBase,
    startSquares: polygons(squares),
  };
}
