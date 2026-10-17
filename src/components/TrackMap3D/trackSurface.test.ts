import { describe, expect, it } from "vitest";
import monacoJson from "@/data/circuit-geometry/22-2025.json";
import type { CircuitGeometry } from "@/data/circuitGeometryTypes";
import { getCircuitGeoref } from "@/data/circuitGeoref";
import { getPitLane } from "@/data/pitLanes";
import { lngLatToEnu } from "@/utils/georef";
import { buildTrackSurface, normals, offsetLine, resample } from "./trackSurface";

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

  it("adds kerbs at the corners and a pit lane", () => {
    expect(surface.kerbsBase.features).toHaveLength(monaco.corners.length * 2);
    expect(surface.kerbsStripes.features.length).toBeGreaterThan(monaco.corners.length * 4);
    expect(surface.pitLane.features).toHaveLength(1);
  });

  it("lays a 6 × 3 chequered start grid", () => {
    expect(surface.startBase.features).toHaveLength(1);
    expect(surface.startSquares.features).toHaveLength(9);
  });
});
