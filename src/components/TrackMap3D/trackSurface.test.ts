import { describe, expect, it } from "vitest";
import monacoJson from "@/data/circuit-geometry/22-2025.json";
import type { CircuitGeometry } from "@/data/circuitGeometryTypes";
import { getCircuitGeoref } from "@/data/circuitGeoref";
import { getPitLane } from "@/data/pitLanes";
import { lngLatToEnu } from "@/utils/georef";
import {
  buildFlagZones,
  buildTrackSurface,
  kerbRuns,
  normals,
  offsetLine,
  removeLoops,
  resample,
  trimLoopOverlap,
} from "./trackSurface";

const monaco = monacoJson as CircuitGeometry;
const geo = getCircuitGeoref(22, 2025)!;

describe("resample / normals / offsetLine", () => {
  it("resamples a square loop at a fixed step", () => {
    const sq = [
      { x: 0, y: 0 },
      { x: 10, y: 0 },
      { x: 10, y: 10 },
      { x: 0, y: 10 },
    ];
    expect(resample(sq, 1, true)).toHaveLength(40);
    expect(resample([{ x: 0, y: 0 }, { x: 5, y: 0 }], 1, false)).toHaveLength(6);
  });

  it("points normals to the left of travel and offsets along them", () => {
    const line = resample([{ x: 0, y: 0 }, { x: 10, y: 0 }], 1, false);
    const n = normals(line, false);
    expect(n[3]).toEqual({ x: -0, y: 1 });
    const left = offsetLine(line, n, 2);
    expect(left.every((p) => p.y === 2)).toBe(true);
  });

  it("trims a closed centerline whose end overshoots its start", () => {
    // Heading east from (0,0); the last two points run past the start.
    const loop = [
      { x: 0, y: 0 },
      { x: 100, y: 0 },
      { x: 100, y: 100 },
      { x: -50, y: 100 },
      { x: -50, y: 0 },
      { x: -10, y: 0 },
      { x: 5, y: 0 },
      { x: 12, y: 0 },
    ];
    expect(trimLoopOverlap(loop)).toEqual(loop.slice(0, 6));
    // A clean loop is left alone.
    expect(trimLoopOverlap(loop.slice(0, 6))).toEqual(loop.slice(0, 6));
  });

  it("cuts the loop an edge forms where it crosses itself", () => {
    // Right, up, back left across the first leg, then on: a small swallowtail.
    const loop = removeLoops([
      { x: 0, y: 0 },
      { x: 10, y: 0 },
      { x: 10, y: 4 },
      { x: 5, y: -2 },
      { x: 5, y: -10 },
    ]);
    expect(loop).toHaveLength(4);
    expect(loop[1]!.x).toBeCloseTo(6.667, 2);
    expect(loop[1]!.y).toBeCloseTo(0, 6);
  });

  it("drops points that would fold back inside a tight corner", () => {
    // A U-turn of radius 3; offsetting 5 to the inside overshoots the centre.
    const arc = Array.from({ length: 31 }, (_, i) => {
      const a = (i / 30) * Math.PI;
      return { x: 3 * Math.cos(a), y: 3 * Math.sin(a) };
    });
    const pts = resample(arc, 0.2, false);
    const inside = offsetLine(pts, normals(pts, false), 5);
    expect(inside.length).toBeLessThan(pts.length / 2);
  });
});

describe("normals smoothing", () => {
  it("averages direction over the span, so a kinked polyline gives a gentle normal", () => {
    const kinked = resample([{ x: 0, y: 0 }, { x: 50, y: 0 }, { x: 100, y: 10 }], 1, false);
    const corner = kinked.findIndex((p) => p.x >= 50);
    const sharp = normals(kinked, false, 1);
    const smooth = normals(kinked, false, 12);
    // Just past the kink the 1-sample normal has fully turned; the smoothed
    // one is still between the two directions.
    const turned = (n: { x: number; y: number }) => Math.atan2(-n.x, n.y);
    expect(Math.abs(turned(sharp[corner + 1]!))).toBeCloseTo(Math.atan2(10, 50), 2);
    expect(Math.abs(turned(smooth[corner + 1]!))).toBeLessThan(Math.atan2(10, 50));
  });
});

describe("kerbRuns", () => {
  it("finds one inside kerb per corner of a square, on the left for an anticlockwise lap", () => {
    const square = resample(
      [
        { x: 0, y: 0 },
        { x: 400, y: 0 },
        { x: 400, y: 400 },
        { x: 0, y: 400 },
      ],
      5,
      true,
    );
    const runs = kerbRuns(square, 5);
    expect(runs).toHaveLength(4);
    expect(runs.every((r) => r.side === 1)).toBe(true);
  });

  it("alternates sides through a chicane-like S bend", () => {
    // Out along an S (left then right), back on a wide loop.
    const s = resample(
      [
        { x: 0, y: 0 },
        { x: 300, y: 0 },
        { x: 350, y: 60 },
        { x: 400, y: 0 },
        { x: 700, y: 0 },
        { x: 700, y: -600 },
        { x: 0, y: -600 },
      ],
      5,
      true,
    );
    const sides = kerbRuns(s, 5).map((r) => r.side);
    expect(sides).toContain(1);
    expect(sides).toContain(-1);
  });

  it("finds none on a straight-sided giant loop", () => {
    expect(kerbRuns([{ x: 0, y: 0 }, { x: 5, y: 0 }], 5)).toEqual([]);
  });
});

/** True when two non-adjacent edges of the closed ring cross (earcut can't fill it). */
function selfIntersects(ring: number[][]): boolean {
  const n = ring.length - 1; // last point repeats the first
  const cross = (a: number[], b: number[], c: number[]) =>
    (b[0]! - a[0]!) * (c[1]! - a[1]!) - (b[1]! - a[1]!) * (c[0]! - a[0]!);
  for (let i = 0; i < n; i++) {
    const a = ring[i]!;
    const b = ring[i + 1]!;
    for (let j = i + 2; j < n; j++) {
      if (i === 0 && j === n - 1) continue; // shares the closing vertex
      const c = ring[j]!;
      const d = ring[j + 1]!;
      if (
        cross(a, b, c) * cross(a, b, d) < 0 &&
        cross(c, d, a) * cross(c, d, b) < 0
      ) {
        return true;
      }
    }
  }
  return false;
}

// The latest baked layout of every circuit, including Suzuka's figure of
// eight, Monaco's Loews hairpin and the GPS-baked venues (Madring, KL).
const LATEST_LAYOUTS = (() => {
  const latest = new Map<number, number>();
  for (const path of Object.keys(import.meta.glob("@/data/circuit-geometry/*.json"))) {
    const [, key, year] = path.match(/(\d+)-(\d+)\.json$/)!.map(Number) as [number, number, number];
    latest.set(key, Math.max(latest.get(key) ?? 0, year));
  }
  return [...latest].sort((a, b) => a[0] - b[0]);
})();

describe.each(LATEST_LAYOUTS)("buildTrackSurface draws only simple polygons — circuit %i (%i)", (key, year) => {
  it("never produces a self-crossing ring (Mapbox would fill the gaps black)", async () => {
    const { loadCircuitGeometry } = await import("@/data/circuitGeometry");
    const g = (await loadCircuitGeometry(key, year))!;
    const s = buildTrackSurface(g, getCircuitGeoref(key, year)!, getPitLane(key));
    for (const f of [...s.track.features, ...s.verge.features]) {
      for (const ring of f.geometry.coordinates) {
        expect(selfIntersects(ring)).toBe(false);
      }
    }
  });
});

describe("buildTrackSurface (Monaco)", () => {
  const surface = buildTrackSurface(monaco, geo, getPitLane(22));
  const enu = ([lng, lat]: number[]) => lngLatToEnu(geo.originLng, geo.originLat, lng!, lat!);

  it("builds track and verge as simple strips (no holes)", () => {
    expect(surface.track.features.length).toBeGreaterThan(10);
    for (const f of [...surface.track.features, ...surface.verge.features]) {
      expect(f.geometry.coordinates).toHaveLength(1);
    }
  });

  it("makes the track 15 m wide", () => {
    // A strip ring runs down the left edge and back up the right one, so its
    // first point faces the last point before closing across the track.
    const [ring] = surface.track.features[3]!.geometry.coordinates;
    const left = enu(ring![0]!);
    const right = enu(ring![ring!.length - 2]!);
    const width = Math.hypot(left.x - right.x, left.y - right.y);
    expect(width).toBeGreaterThan(14);
    expect(width).toBeLessThan(16);
  });

  it("adds kerbs where the track turns and a pit lane", () => {
    // Monaco has 19 numbered corners; some merge into one long kerb.
    expect(surface.kerbsBase.features.length).toBeGreaterThan(10);
    expect(surface.kerbsBase.features.length).toBeLessThan(30);
    expect(surface.kerbsStripes.features.length).toBeGreaterThan(surface.kerbsBase.features.length * 3);
    expect(surface.pitLane.features).toHaveLength(1);
  });

  it("paints one flag zone per marshal post, keyed by post number", () => {
    const zones = buildFlagZones(monaco, geo);
    expect(zones.features.map((f) => f.id).sort((a, b) => a! - b!)).toEqual(
      monaco.marshalSectors.map((m) => m.number).sort((a, b) => a - b),
    );
    expect(zones.features[0]!.geometry.type).toBe("Polygon");
  });

  it("lays a 6 × 3 chequered start grid", () => {
    expect(surface.startBase.features).toHaveLength(1);
    expect(surface.startSquares.features).toHaveLength(9);
  });
});
