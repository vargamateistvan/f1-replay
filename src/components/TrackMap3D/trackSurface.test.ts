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
  resample,
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

describe("buildTrackSurface (Monaco)", () => {
  const surface = buildTrackSurface(monaco, geo, getPitLane(22));
  const enu = ([lng, lat]: number[]) => lngLatToEnu(geo.originLng, geo.originLat, lng!, lat!);

  it("builds track and verge as polygons with a hole", () => {
    expect(surface.track.features).toHaveLength(1);
    expect(surface.track.features[0]!.geometry.coordinates).toHaveLength(2);
    expect(surface.verge.features[0]!.geometry.coordinates).toHaveLength(2);
  });

  it("makes the track 15 m wide", () => {
    const [outer, inner] = surface.track.features[0]!.geometry.coordinates;
    const a = enu(outer![0]!);
    let best = Infinity;
    for (const p of inner!) {
      const b = enu(p);
      best = Math.min(best, Math.hypot(a.x - b.x, a.y - b.y));
    }
    expect(best).toBeGreaterThan(14);
    expect(best).toBeLessThan(16);
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
