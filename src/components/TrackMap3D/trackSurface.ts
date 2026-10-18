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
  MAP3D_SECTOR_RIBBON_M,
  MAP3D_START_GRID_COLUMNS,
  MAP3D_START_GRID_DEPTH_M,
  MAP3D_START_GRID_ROWS,
  MAP3D_TRACK_HALF_WIDTH_M,
  MAP3D_VERGE_M,
} from "@/constants";
import { type CircuitGeoref, enuToLngLat, f1ToEnu } from "@/utils/georef";
import { timingSectorForMarshalPost } from "@/timeline/raceControl";
import type { FeatureCollection, LineFeature, LngLat } from "./mapFeatures";

interface P {
  x: number;
  y: number;
}

export interface PolygonFeature {
  type: "Feature";
  id?: number;
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

/**
 * Drop trailing points of a closed loop that run past its start (baked
 * centerlines often overshoot the line by a few metres). Closing such a loop
 * makes it double back on itself at the seam, which folds the offset edges.
 */
export function trimLoopOverlap(points: readonly P[], withinM = 50): P[] {
  if (points.length < 4) return [...points];
  const p0 = points[0]!;
  const p1 = points[1]!;
  const tx = p1.x - p0.x;
  const ty = p1.y - p0.y;
  let end = points.length;
  while (end > 3) {
    const p = points[end - 1]!;
    const dx = p.x - p0.x;
    const dy = p.y - p0.y;
    // Ahead of the start along the opening direction, and close to it.
    if (dx * tx + dy * ty > 0 && Math.hypot(dx, dy) < withinM) end--;
    else break;
  }
  return points.slice(0, end);
}

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

/**
 * Unit left-hand normal at each point, from the tangent across ±`span`
 * samples. A wide span (≈ ±12 m) averages out the kinks where the 5 m-spaced
 * source centerline bends, so offset edges stay smooth.
 */
export function normals(pts: readonly P[], closed: boolean, span = 1): P[] {
  const n = pts.length;
  return pts.map((_, i) => {
    const prev = pts[closed ? (i - span + n * span) % n : Math.max(0, i - span)]!;
    const next = pts[closed ? (i + span) % n : Math.min(n - 1, i + span)]!;
    const tx = next.x - prev.x;
    const ty = next.y - prev.y;
    const len = Math.hypot(tx, ty) || 1;
    return { x: -ty / len, y: tx / len };
  });
}

/**
 * Cut the small loops an offset edge forms where it crosses itself (the
 * outside of a hairpin tighter than the offset): when segment i and a later
 * segment j within `window` samples cross, everything between them is
 * replaced by the crossing point. Without this the strip polygons self-
 * intersect and Mapbox fills them wrongly.
 */
export function removeLoops(points: readonly P[], window = 80): P[] {
  const pts = [...points];
  const hit = (a: P, b: P, c: P, d: P): P | null => {
    const rx = b.x - a.x;
    const ry = b.y - a.y;
    const sx = d.x - c.x;
    const sy = d.y - c.y;
    const den = rx * sy - ry * sx;
    if (den === 0) return null;
    const t = ((c.x - a.x) * sy - (c.y - a.y) * sx) / den;
    const u = ((c.x - a.x) * ry - (c.y - a.y) * rx) / den;
    if (t <= 0 || t >= 1 || u <= 0 || u >= 1) return null;
    return { x: a.x + t * rx, y: a.y + t * ry };
  };
  for (let i = 0; i < pts.length - 3; i++) {
    for (let j = Math.min(pts.length - 2, i + window); j >= i + 2; j--) {
      const x = hit(pts[i]!, pts[i + 1]!, pts[j]!, pts[j + 1]!);
      if (x) {
        // Keep the outermost crossing so nested loops go in one cut.
        pts.splice(i + 1, j - i, x);
        break;
      }
    }
  }
  return pts;
}

/** Share of the local turning radius an inside offset may use. */
const INSIDE_RADIUS_SHARE = 0.9;

/**
 * Offset a resampled polyline by `d` metres along its left normal (negative =
 * right). Toward the inside of a bend the offset is capped at 90 % of the
 * local turning radius (from how fast the normals turn), so the inside edge
 * of a hairpin tighter than `|d|` never crosses past the turn's centre. Any
 * point that would still run backwards is dropped and leftover loops are cut.
 */
export function offsetLine(
  pts: readonly P[],
  nrm: readonly P[],
  d: number,
): P[] {
  const out: P[] = [];
  const last = pts.length - 1;
  for (let i = 0; i < pts.length; i++) {
    let di = d;
    const a = nrm[Math.max(0, i - 1)]!;
    const b = nrm[Math.min(last, i + 1)]!;
    const pa = pts[Math.max(0, i - 1)]!;
    const pb = pts[Math.min(last, i + 1)]!;
    const ds = Math.hypot(pb.x - pa.x, pb.y - pa.y);
    // Signed turn of the normal (+ = turning left); the inside is that side.
    const turn = Math.atan2(a.x * b.y - a.y * b.x, a.x * b.x + a.y * b.y);
    if (ds > 0 && turn * d > 0) {
      const radius = ds / Math.abs(turn);
      di = Math.sign(d) * Math.min(Math.abs(d), INSIDE_RADIUS_SHARE * radius);
    }
    const p = { x: pts[i]!.x + nrm[i]!.x * di, y: pts[i]!.y + nrm[i]!.y * di };
    const prev = out[out.length - 1];
    if (prev && i > 0) {
      const tx = pts[i]!.x - pts[i - 1]!.x;
      const ty = pts[i]!.y - pts[i - 1]!.y;
      if ((p.x - prev.x) * tx + (p.y - prev.y) * ty <= 0) continue;
    }
    out.push(p);
  }
  return removeLoops(out);
}

/**
 * A closed band between offsets `a` and `b` along a loop, as a chain of
 * simple strip polygons `chunk` samples long that share their end edges.
 *
 * Not one ring-with-a-hole: on a circuit that crosses itself (Suzuka's
 * figure of eight) or folds at a hairpin, those rings self-intersect and
 * Mapbox's triangulation fills the gaps between the lobes solid.
 */
function loopStrips(
  pts: readonly P[],
  nrm: readonly P[],
  a: number,
  b: number,
  chunk: number,
  toLL: (p: P) => LngLat,
): LngLat[][][] {
  const n = pts.length;
  const out: LngLat[][][] = [];
  for (let start = 0; start < n; start += chunk) {
    const idx: number[] = [];
    for (let k = start; k <= Math.min(start + chunk, n); k++) idx.push(k % n);
    out.push(...stripPolygons(idx.map((i) => pts[i]!), idx.map((i) => nrm[i]!), a, b, toLL));
  }
  return out;
}

/** Closed polygon for an open band between offsets `a` and `b`. */
/** True when two non-adjacent edges of the (implicitly closed) ring cross. */
export function ringSelfIntersects(ring: readonly P[]): boolean {
  const n = ring.length;
  const cross = (a: P, b: P, c: P) => (b.x - a.x) * (c.y - a.y) - (b.y - a.y) * (c.x - a.x);
  for (let i = 0; i < n; i++) {
    const a = ring[i]!;
    const b = ring[(i + 1) % n]!;
    for (let j = i + 2; j < n; j++) {
      if (i === 0 && j === n - 1) continue; // shares the closing vertex
      const c = ring[j]!;
      const d = ring[(j + 1) % n]!;
      if (cross(a, b, c) * cross(a, b, d) < 0 && cross(c, d, a) * cross(c, d, b) < 0) return true;
    }
  }
  return false;
}

/**
 * Polygons for the band between offsets `a` and `b` along an open run —
 * normally one strip. A strip whose ring would cross itself (an edge curling
 * behind the strip's end in a very tight corner) is split in half and
 * retried, so Mapbox only ever gets simple polygons; a piece too small to
 * split that still crosses is dropped.
 */
function stripPolygons(
  pts: readonly P[],
  nrm: readonly P[],
  a: number,
  b: number,
  toLL: (p: P) => LngLat,
  depth = 0,
): LngLat[][][] {
  const ring = [...offsetLine(pts, nrm, a), ...offsetLine(pts, nrm, b).reverse()];
  if (ring.length < 3) return [];
  if (ringSelfIntersects(ring)) {
    if (pts.length <= 3 || depth >= 8) return [];
    const mid = Math.floor(pts.length / 2);
    return [
      ...stripPolygons(pts.slice(0, mid + 1), nrm.slice(0, mid + 1), a, b, toLL, depth + 1),
      ...stripPolygons(pts.slice(mid), nrm.slice(mid), a, b, toLL, depth + 1),
    ];
  }
  const ll = ring.map(toLL);
  // One polygon with a single closed ring.
  return [[[...ll, ll[0]!]]];
}

/**
 * Kerb runs from the track's own curvature: at every sample, the turn (°)
 * between the heading over the previous and the next `windowM` metres,
 * smoothed over ±`smoothM`; where it exceeds `thresholdDeg` the inside of the
 * turn gets a kerb. Long corners get one continuous kerb and chicanes flip
 * sides, without relying on a corner list.
 *
 * Returns runs of sample indices (inclusive, may wrap past the end) with the
 * inside side: +1 left, -1 right.
 */
export function kerbRuns(
  pts: readonly P[],
  stepM: number,
  { windowM = 40, smoothM = 30, thresholdDeg = 14 } = {},
): Array<{ from: number; to: number; side: 1 | -1 }> {
  const n = pts.length;
  if (n < 8) return [];
  const k = Math.max(1, Math.round(windowM / stepM));
  const at = (i: number) => pts[((i % n) + n) % n]!;
  const turn = pts.map((_, i) => {
    const a = at(i - k);
    const b = at(i);
    const c = at(i + k);
    const h1 = Math.atan2(b.y - a.y, b.x - a.x);
    const h2 = Math.atan2(c.y - b.y, c.x - b.x);
    return ((((h2 - h1 + 3 * Math.PI) % (2 * Math.PI)) - Math.PI) * 180) / Math.PI;
  });
  const m = Math.max(1, Math.round(smoothM / stepM));
  // Running-window mean over the closed loop.
  const smooth: number[] = new Array(n);
  let sum = 0;
  for (let j = -m; j <= m; j++) sum += turn[((j % n) + n) % n]!;
  for (let i = 0; i < n; i++) {
    smooth[i] = sum / (2 * m + 1);
    sum += turn[(i + m + 1) % n]! - turn[(((i - m) % n) + n) % n]!;
  }
  const sideAt = (i: number) => {
    const v = smooth[((i % n) + n) % n]!;
    return Math.abs(v) > thresholdDeg ? (Math.sign(v) as 1 | -1) : 0;
  };
  // Start scanning at a boundary so a run never straddles the loop seam.
  let first = 0;
  while (first < n && sideAt(first) === sideAt(first - 1)) first++;
  if (first === n) return [];
  const runs: Array<{ from: number; to: number; side: 1 | -1 }> = [];
  let i = first;
  while (i < first + n) {
    const side = sideAt(i);
    let j = i;
    while (j + 1 < first + n && sideAt(j + 1) === side) j++;
    if (side !== 0) runs.push({ from: i, to: j, side });
    i = j + 1;
  }
  return runs;
}

/**
 * One asphalt polygon per marshal post, from the post to the next post in
 * track order (the last wraps to the first); feature `id` is the post number
 * so flags can be painted with feature state, like the line version.
 */
export function buildFlagZones(geom: CircuitGeometry, geo: CircuitGeoref): PolygonCollection {
  const toLL = (p: P): LngLat => enuToLngLat(geo.originLng, geo.originLat, p.x, p.y);
  const center = resample(
    trimLoopOverlap(geom.x.map((x, i) => f1ToEnu(geo, x, geom.y[i]!))),
    STEP_M,
    true,
  );
  const nrm = normals(center, true, Math.round(NORMAL_SPAN_M / STEP_M));
  const n = center.length;
  const posts = geom.marshalSectors
    .map((ms) => {
      const p = f1ToEnu(geo, ms.trackPosition.x, ms.trackPosition.y);
      let best = 0;
      let bestD = Infinity;
      for (let i = 0; i < n; i++) {
        const d = (center[i]!.x - p.x) ** 2 + (center[i]!.y - p.y) ** 2;
        if (d < bestD) {
          bestD = d;
          best = i;
        }
      }
      return { number: ms.number, index: best };
    })
    .sort((a, b) => a.index - b.index);
  const half = MAP3D_TRACK_HALF_WIDTH_M;
  return {
    type: "FeatureCollection",
    // A post's stretch may come out as several pieces; they share its id.
    features: posts.flatMap((post, k) => {
      const end = posts[(k + 1) % posts.length]!.index;
      const span = posts.length === 1 ? n : (end - post.index + n) % n;
      const idx = Array.from({ length: span + 1 }, (_, j) => (post.index + j) % n);
      return stripPolygons(
        idx.map((i) => center[i]!),
        idx.map((i) => nrm[i]!),
        half,
        -half,
        toLL,
      ).map((coordinates): PolygonFeature => ({
        type: "Feature",
        id: post.number,
        properties: { marshal: post.number },
        geometry: { type: "Polygon", coordinates },
      }));
    }),
  };
}

/** The baked centerline resampled at 1 m in local metres, with smoothed normals. */
function sampledCenterline(geom: CircuitGeometry, geo: CircuitGeoref) {
  const center = resample(
    trimLoopOverlap(geom.x.map((x, i) => f1ToEnu(geo, x, geom.y[i]!))),
    STEP_M,
    true,
  );
  const nrm = normals(center, true, Math.round(NORMAL_SPAN_M / STEP_M));
  const toLL = (p: P): LngLat => enuToLngLat(geo.originLng, geo.originLat, p.x, p.y);
  return { center, nrm, toLL };
}

/**
 * Timing sector (1–3) of every 1 m centerline sample. With marshal posts,
 * each post's stretch takes the sector the flag logic maps that post to
 * (`timingSectorForMarshalPost`), so sector colour changes exactly where the
 * flagged posts are; otherwise the lap is split into equal thirds.
 */
export function sectorOfSamples(
  geom: CircuitGeometry,
  center: readonly P[],
  geo: CircuitGeoref,
): Array<1 | 2 | 3> {
  const n = center.length;
  const thirds = () =>
    center.map((_, i) => (Math.min(3, Math.floor((3 * i) / n) + 1) as 1 | 2 | 3));
  if (geom.marshalSectors.length < 3) return thirds();
  const total = Math.max(
    geom.marshalSectors.length,
    ...geom.marshalSectors.map((m) => m.number),
  );
  const posts = geom.marshalSectors
    .map((ms) => {
      const p = f1ToEnu(geo, ms.trackPosition.x, ms.trackPosition.y);
      let best = 0;
      let bestD = Infinity;
      for (let i = 0; i < n; i++) {
        const d = (center[i]!.x - p.x) ** 2 + (center[i]!.y - p.y) ** 2;
        if (d < bestD) {
          bestD = d;
          best = i;
        }
      }
      return { index: best, sector: timingSectorForMarshalPost(ms.number, total) };
    })
    .sort((a, b) => a.index - b.index);
  const out = new Array<1 | 2 | 3>(n);
  posts.forEach((post, k) => {
    const end = posts[(k + 1) % posts.length]!.index;
    const span = (end - post.index + n) % n || n;
    for (let j = 0; j < span; j++) out[(post.index + j) % n] = post.sector;
  });
  return out;
}

/** Contiguous runs of equal sector along the loop (a run may wrap the seam). */
function sectorRuns(sectors: readonly (1 | 2 | 3)[]): Array<{ sector: 1 | 2 | 3; from: number; to: number }> {
  const n = sectors.length;
  let first = 0;
  while (first < n && sectors[first] === sectors[(first - 1 + n) % n]) first++;
  if (first === n) return [{ sector: sectors[0]!, from: 0, to: n }];
  const runs: Array<{ sector: 1 | 2 | 3; from: number; to: number }> = [];
  let i = first;
  while (i < first + n) {
    const sector = sectors[i % n]!;
    let j = i;
    while (j + 1 < first + n && sectors[(j + 1) % n] === sector) j++;
    // Include the next sample so neighbouring runs meet without a gap.
    runs.push({ sector, from: i, to: j + 1 });
    i = j + 1;
  }
  return runs;
}

export interface SectorZones {
  /** Asphalt-width bands, one or more strips per sector (feature id = sector). */
  paint: PolygonCollection;
  /** Wider bands under the asphalt for the always-on condition ribbon. */
  ribbon: PolygonCollection;
  /** Centerline per sector for the zoomed-out glow (feature id = sector). */
  lines: FeatureCollection<LineFeature>;
  /** Lap fractions (0–1) where sector 2 and sector 3 begin. */
  boundaries: [number, number];
}

/**
 * Timing-sector geometry for the 2D map's sector flag colours: the condition
 * ribbon (green → flag colour per sector), sector paint on the asphalt, and a
 * low-zoom line glow. Feature ids are the sector number so one feature-state
 * write recolours every strip of that sector.
 */
export function buildSectorZones(geom: CircuitGeometry, geo: CircuitGeoref): SectorZones {
  const { center, nrm, toLL } = sampledCenterline(geom, geo);
  const n = center.length;
  const sectors = sectorOfSamples(geom, center, geo);
  const half = MAP3D_TRACK_HALF_WIDTH_M;
  const ribbonHalf = half + MAP3D_SECTOR_RIBBON_M;
  const chunk = Math.round(STRIP_CHUNK_M / STEP_M);
  const paint: PolygonFeature[] = [];
  const ribbon: PolygonFeature[] = [];
  const lines: LineFeature[] = [];
  for (const run of sectorRuns(sectors)) {
    const idx: number[] = [];
    for (let k = run.from; k <= run.to; k++) idx.push(k % n);
    const pts = idx.map((i) => center[i]!);
    const nr = idx.map((i) => nrm[i]!);
    for (let s = 0; s < pts.length - 1; s += chunk) {
      const e = Math.min(pts.length, s + chunk + 1);
      const slicePts = pts.slice(s, e);
      const sliceNrm = nr.slice(s, e);
      const feature = (coordinates: LngLat[][]): PolygonFeature => ({
        type: "Feature",
        id: run.sector,
        properties: { sector: run.sector },
        geometry: { type: "Polygon", coordinates },
      });
      paint.push(...stripPolygons(slicePts, sliceNrm, half, -half, toLL).map(feature));
      ribbon.push(
        ...stripPolygons(slicePts, sliceNrm, ribbonHalf, -ribbonHalf, toLL).map(feature),
      );
    }
    lines.push({
      type: "Feature",
      id: run.sector,
      properties: { sector: run.sector },
      geometry: { type: "LineString", coordinates: pts.map(toLL) },
    });
  }
  const startOf = (s: 2 | 3) => {
    const i = sectors.findIndex((v, k) => v === s && sectors[(k - 1 + n) % n] !== s);
    return i < 0 ? (s === 2 ? 1 / 3 : 2 / 3) : i / n;
  };
  return {
    paint: { type: "FeatureCollection", features: paint },
    ribbon: { type: "FeatureCollection", features: ribbon },
    lines: { type: "FeatureCollection", features: lines },
    boundaries: [startOf(2), startOf(3)],
  };
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
/** Edge directions are averaged over ±this many metres. */
const NORMAL_SPAN_M = 12;
/** Length of each asphalt / verge strip polygon. */
const STRIP_CHUNK_M = 50;
/** Curvature is sampled at this spacing for kerb detection. */
const KERB_SAMPLE_M = 5;

export function buildTrackSurface(
  geom: CircuitGeometry,
  geo: CircuitGeoref,
  pitLane?: { x: readonly number[]; y: readonly number[] } | null,
): TrackSurface {
  const toLL = (p: P): LngLat => enuToLngLat(geo.originLng, geo.originLat, p.x, p.y);
  const center = resample(
    trimLoopOverlap(geom.x.map((x, i) => f1ToEnu(geo, x, geom.y[i]!))),
    STEP_M,
    true,
  );
  const nrm = normals(center, true, Math.round(NORMAL_SPAN_M / STEP_M));
  const half = MAP3D_TRACK_HALF_WIDTH_M;

  const chunk = Math.round(STRIP_CHUNK_M / STEP_M);
  // Verge as two bands outside the asphalt (not one wide band under it), so
  // the translucent casing never doubles up where pieces meet.
  const verge = polygons([
    ...loopStrips(center, nrm, half, half + MAP3D_VERGE_M, chunk, toLL),
    ...loopStrips(center, nrm, -half, -(half + MAP3D_VERGE_M), chunk, toLL),
  ]);
  const track = polygons(loopStrips(center, nrm, half, -half, chunk, toLL));

  let pit: PolygonCollection = polygons([]);
  if (pitLane && pitLane.x.length > 1) {
    const lane = resample(
      pitLane.x.map((x, i) => f1ToEnu(geo, x, pitLane.y[i]!)),
      STEP_M,
      false,
    );
    const pitHalf = MAP3D_PIT_LANE_HALF_WIDTH_M;
    pit = polygons(
      stripPolygons(lane, normals(lane, false, Math.round(NORMAL_SPAN_M / STEP_M)), pitHalf, -pitHalf, toLL),
    );
  }

  // Kerbs on the inside of every stretch that turns, as a base strip plus
  // every other 2 m block for the stripes.
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
    kerbBase.push(...stripPolygons(pts, nr, inner, outer, toLL));
    const block = Math.max(1, Math.round(MAP3D_KERB_BLOCK_M / STEP_M));
    for (let s = 0; s + block < pts.length; s += block * 2) {
      kerbStripes.push(
        ...stripPolygons(pts.slice(s, s + block + 1), nr.slice(s, s + block + 1), inner, outer, toLL),
      );
    }
  };
  const every = Math.round(KERB_SAMPLE_M / STEP_M);
  const coarse = center.filter((_, i) => i % every === 0);
  for (const run of kerbRuns(coarse, KERB_SAMPLE_M)) {
    addKerb(run.from * every, run.to * every + every, run.side);
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
