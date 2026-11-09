/**
 * Trackside 3D objects for the 3D map: barriers (tyre walls behind the
 * gravel, concrete elsewhere, walls on street circuits) topped by catch
 * fences, the pit wall, and the start-light gantry. Pure builders; Mapbox
 * layers in `tracksideLayers.ts`.
 */
import type { CircuitGeometry } from "@/data/circuitGeometryTypes";
import {
  MAP3D_BARRIER_GAP_M,
  MAP3D_BARRIER_HEIGHT_M,
  MAP3D_BARRIER_MIN_RUN_M,
  MAP3D_BARRIER_PIT_CLEAR_M,
  MAP3D_BARRIER_RAMP_M,
  MAP3D_BARRIER_RUNOFF_GAP_M,
  MAP3D_BARRIER_THICKNESS_M,
  MAP3D_FENCE_HEIGHT_M,
  MAP3D_GANTRY_BEAM_M,
  MAP3D_GANTRY_CLEARANCE_M,
  MAP3D_PIT_LANE_HALF_WIDTH_M,
  MAP3D_PIT_WALL_MAX_GAP_M,
  MAP3D_KERB_WIDTH_M,
  MAP3D_TRACK_HALF_WIDTH_M,
  MAP3D_TRACKSIDE_COLORS,
  MAP3D_TYRE_WALL_BLOCK_M,
  MAP3D_VERGE_M,
  MAP3D_WALL_GAP_M,
  MAP3D_WALL_HEIGHT_M,
} from "@/constants";
import { isStreetCircuit } from "@/data/circuitRunoff";
import type { CircuitGeoref } from "@/utils/georef";
import type { LngLat } from "./mapFeatures";
import {
  cappedOffset,
  cornerRuns,
  cornerRunoff,
  frameQuad,
  type PolygonCollection,
  type PolygonFeature,
  sampledCenterline,
  sampledPitLane,
  STRIP_CHUNK_M,
  stripPolygons,
} from "./trackSurface";

interface P {
  x: number;
  y: number;
}

/** Extrusion style carried on each feature: colour and base/top height (m). */
export type ExtrusionProps = { color: string; base: number; height: number };

export interface Trackside {
  /** Opaque extrusions: barriers, pit wall, gantry. */
  solid: PolygonCollection;
  /** Translucent catch fences on top of the barriers. */
  fence: PolygonCollection;
}

/** Nearest-point lookups over a fixed point set via a uniform grid. */
export function pointIndex(points: readonly P[], cell = 16) {
  const grid = new Map<number, number[]>();
  const key = (cx: number, cy: number) => (cx + 1e5) * 2e5 + (cy + 1e5);
  points.forEach((p, i) => {
    const k = key(Math.floor(p.x / cell), Math.floor(p.y / cell));
    const bucket = grid.get(k);
    if (bucket) bucket.push(i);
    else grid.set(k, [i]);
  });
  return {
    /** Closest point within `maxD` (distance Infinity and index -1 if none). */
    nearest(p: P, maxD: number): { d: number; i: number } {
      const r = Math.ceil(maxD / cell);
      const cx = Math.floor(p.x / cell);
      const cy = Math.floor(p.y / cell);
      let best = maxD * maxD;
      let bestI = -1;
      for (let dx = -r; dx <= r; dx++) {
        for (let dy = -r; dy <= r; dy++) {
          for (const i of grid.get(key(cx + dx, cy + dy)) ?? []) {
            const q = points[i]!;
            const d = (q.x - p.x) ** 2 + (q.y - p.y) ** 2;
            if (d < best) {
              best = d;
              bestI = i;
            }
          }
        }
      }
      return bestI < 0 ? { d: Infinity, i: -1 } : { d: Math.sqrt(best), i: bestI };
    },
  };
}

/** Running mean over ±`half` samples of a closed loop (a step becomes a ramp). */
export function smoothLoop(values: ArrayLike<number>, half: number): number[] {
  const n = values.length;
  if (half < 1 || n === 0) return Array.from(values);
  const at = (i: number) => values[((i % n) + n) % n]!;
  const out = new Array<number>(n);
  let sum = 0;
  for (let j = -half; j <= half; j++) sum += at(j);
  for (let i = 0; i < n; i++) {
    out[i] = sum / (2 * half + 1);
    sum += at(i + half + 1) - at(i - half);
  }
  return out;
}

/**
 * Runs of consecutive `true` samples at least `minLen` long. On a closed
 * loop a run may wrap past the end (`to` ≥ n); a fully clear loop is one run.
 */
export function clearRuns(
  clear: ArrayLike<boolean | number>,
  closed: boolean,
  minLen: number,
): Array<{ from: number; to: number }> {
  const n = clear.length;
  const at = (i: number) => Boolean(clear[closed ? i % n : i]);
  let first = 0;
  if (closed) {
    while (first < n && at(first)) first++;
    if (first === n) return n >= minLen ? [{ from: 0, to: n }] : [];
  }
  const end = closed ? first + n : n;
  const runs: Array<{ from: number; to: number }> = [];
  let i = first;
  while (i < end) {
    if (!at(i)) {
      i++;
      continue;
    }
    let j = i;
    while (j + 1 < end && at(j + 1)) j++;
    if (j - i + 1 >= minLen) runs.push({ from: i, to: j });
    i = j + 1;
  }
  return runs;
}

const feature = (coordinates: LngLat[][], properties: ExtrusionProps): PolygonFeature => ({
  type: "Feature",
  properties,
  geometry: { type: "Polygon", coordinates },
});

export function buildTrackside(
  geom: CircuitGeometry,
  geo: CircuitGeoref,
  pitLane?: { x: readonly number[]; y: readonly number[] } | null,
): Trackside {
  const { center, nrm, toLL } = sampledCenterline(geom, geo);
  const n = center.length;
  const half = MAP3D_TRACK_HALF_WIDTH_M;
  const edge = half + MAP3D_VERGE_M;
  const street = isStreetCircuit(geom.circuitKey);
  const thick = MAP3D_BARRIER_THICKNESS_M;
  const chunk = Math.round(STRIP_CHUNK_M);
  const minRun = Math.round(MAP3D_BARRIER_MIN_RUN_M);
  const track = pointIndex(center);
  const lane = sampledPitLane(pitLane, geo);
  const laneIndex = lane ? pointIndex(lane.lane) : null;
  const solid: PolygonFeature[] = [];
  const fence: PolygonFeature[] = [];
  const colors = MAP3D_TRACKSIDE_COLORS;
  const at = (p: P, nr: P, d: number): P => ({ x: p.x + nr.x * d, y: p.y + nr.y * d });

  // ── Barriers along both sides of the lap ──
  const corners = cornerRuns(center);
  const runoff = cornerRunoff(center, street ? [] : corners);
  const gravel = { 1: new Uint8Array(n), [-1]: new Uint8Array(n) } as Record<1 | -1, Uint8Array>;
  if (!street) {
    for (const run of runoff.runs) {
      for (let i = run.from; i <= run.to; i++) gravel[run.side][((i % n) + n) % n] = 1;
    }
  }
  const barrierHeight = street ? MAP3D_WALL_HEIGHT_M : MAP3D_BARRIER_HEIGHT_M;
  const fenceTop = barrierHeight + MAP3D_FENCE_HEIGHT_M;
  for (const side of [1, -1] as const) {
    const raw = Array.from(gravel[side], (g, i) =>
      street
        ? edge + MAP3D_WALL_GAP_M
        : g
          ? half + Math.max(MAP3D_VERGE_M, MAP3D_KERB_WIDTH_M) +
            runoff.widths[side][i]! + MAP3D_BARRIER_RUNOFF_GAP_M
          : edge + MAP3D_BARRIER_GAP_M,
    );
    // Sweep out behind the gravel and back, rather than stepping.
    const dist = smoothLoop(raw, Math.round(MAP3D_BARRIER_RAMP_M / 2))
      .map((d, i) => Math.max(d, raw[i]!));
    const inner = dist.map((d) => side * d);
    const outer = dist.map((d) => side * (d + thick));
    const fenceIn = dist.map((d) => side * (d + thick * 0.4));
    const fenceOut = dist.map((d) => side * (d + thick * 0.6));
    // Drop the barrier wherever it would sit on the asphalt or verge (here or
    // on a neighbouring stretch, or pulled in at a hairpin) or across the pit lane.
    const clear = center.map((p, i) => {
      const q = at(p, nrm[i]!, cappedOffset(center, nrm, i, inner[i]!));
      if (track.nearest(q, edge).d < edge) return false;
      return !laneIndex || laneIndex.nearest(q, MAP3D_BARRIER_PIT_CLEAR_M).d >= MAP3D_BARRIER_PIT_CLEAR_M;
    });
    const tyreBlock = Math.max(1, Math.round(MAP3D_TYRE_WALL_BLOCK_M));
    // Tyre-wall blocks alternate colours; plain walls are one colour.
    const colorAt = (k: number) =>
      gravel[side][k % n]
        ? colors.tyres[Math.floor(k / tyreBlock) % 2]!
        : colors.wall;
    const slice = (from: number, to: number) => {
      const idx: number[] = [];
      for (let k = from; k <= to; k++) idx.push(k % n);
      return {
        pts: idx.map((i) => center[i]!),
        nr: idx.map((i) => nrm[i]!),
        pick: (values: readonly number[]) => idx.map((i) => values[i]!),
      };
    };
    for (const run of clearRuns(clear, true, minRun)) {
      // Colour pieces: break where the colour changes or every 50 m.
      let start = run.from;
      for (let k = run.from + 1; k <= run.to; k++) {
        if (k === run.to || colorAt(k) !== colorAt(start) || k - start >= chunk) {
          const s = slice(start, k);
          for (const ring of stripPolygons(s.pts, s.nr, s.pick(inner), s.pick(outer), toLL)) {
            solid.push(feature(ring, { color: colorAt(start), base: 0, height: barrierHeight }));
          }
          start = k;
        }
      }
      for (let c = run.from; c < run.to; c += chunk) {
        const s = slice(c, Math.min(c + chunk, run.to));
        for (const ring of stripPolygons(s.pts, s.nr, s.pick(fenceIn), s.pick(fenceOut), toLL)) {
          fence.push(feature(ring, { color: colors.fence, base: barrierHeight, height: fenceTop }));
        }
      }
    }
  }

  // ── Pit wall between the pit lane and the track ──
  if (lane) {
    const { lane: lp, laneNrm } = lane;
    const pitHalf = MAP3D_PIT_LANE_HALF_WIDTH_M;
    const wallIn = pitHalf + 0.4;
    // Side of the lane the track is on, per sample (0 = no wall here).
    const sides = lp.map((p, j) => {
      const near = track.nearest(p, MAP3D_PIT_WALL_MAX_GAP_M);
      if (near.i < 0) return 0;
      const q = center[near.i]!;
      const nr = laneNrm[j]!;
      const s = (q.x - p.x) * nr.x + (q.y - p.y) * nr.y >= 0 ? 1 : -1;
      const wall = at(p, nr, s * (wallIn + thick / 2));
      return track.nearest(wall, edge).d < edge ? 0 : s;
    });
    for (const side of [1, -1] as const) {
      for (const run of clearRuns(sides.map((s) => s === side), false, minRun)) {
        for (let c = run.from; c < run.to; c += chunk) {
          const e = Math.min(c + chunk, run.to);
          const pts = lp.slice(c, e + 1);
          const nr = laneNrm.slice(c, e + 1);
          for (const ring of stripPolygons(pts, nr, side * wallIn, side * (wallIn + thick), toLL)) {
            solid.push(feature(ring, { color: colors.wall, base: 0, height: MAP3D_WALL_HEIGHT_M }));
          }
          const fIn = side * (wallIn + thick * 0.4);
          const fOut = side * (wallIn + thick * 0.6);
          for (const ring of stripPolygons(pts, nr, fIn, fOut, toLL)) {
            fence.push(
              feature(ring, {
                color: colors.fence,
                base: MAP3D_WALL_HEIGHT_M,
                height: MAP3D_WALL_HEIGHT_M + MAP3D_FENCE_HEIGHT_M,
              }),
            );
          }
        }
      }
    }
  }

  // ── Start-light gantry over the line ──
  const nr0 = nrm[0]!;
  const quad = frameQuad(center[0]!, { x: nr0.y, y: -nr0.x }, nr0, toLL);
  const span = edge + 1;
  const low = MAP3D_GANTRY_CLEARANCE_M;
  const top = low + MAP3D_GANTRY_BEAM_M;
  const beam = 0.6;
  for (const s of [1, -1]) {
    solid.push(feature(quad(-0.4, 0.4, s * span - 0.4, s * span + 0.4), { color: colors.gantry, base: 0, height: top }));
  }
  solid.push(feature(quad(-beam, beam, -span, span), { color: colors.gantry, base: low, height: top }));
  // Five light pods facing the grid.
  for (let k = -2; k <= 2; k++) {
    const c = k * 1.3;
    solid.push(
      feature(quad(-beam - 0.35, -beam, c - 0.4, c + 0.4), {
        color: colors.lights,
        base: low + 0.15,
        height: top - 0.15,
      }),
    );
  }

  return {
    solid: { type: "FeatureCollection", features: solid },
    fence: { type: "FeatureCollection", features: fence },
  };
}
