import { describe, expect, it } from "vitest";
import silverstoneJson from "@/data/circuit-geometry/2-2025.json";
import monacoJson from "@/data/circuit-geometry/22-2025.json";
import {
  MAP3D_BARRIER_HEIGHT_M,
  MAP3D_FENCE_HEIGHT_M,
  MAP3D_TRACK_HALF_WIDTH_M,
  MAP3D_TRACKSIDE_COLORS,
  MAP3D_VERGE_M,
  MAP3D_WALL_HEIGHT_M,
} from "@/constants";
import type { CircuitGeometry } from "@/data/circuitGeometryTypes";
import { getCircuitGeoref } from "@/data/circuitGeoref";
import { getPitLane } from "@/data/pitLanes";
import { f1ToEnu, lngLatToEnu } from "@/utils/georef";
import { buildTrackside, clearRuns, pointIndex, smoothLoop, type ExtrusionProps } from "./trackside";

const silverstone = silverstoneJson as CircuitGeometry;
const monaco = monacoJson as CircuitGeometry;
const ssGeo = getCircuitGeoref(2, 2025)!;
const mcGeo = getCircuitGeoref(22, 2025)!;

describe("pointIndex", () => {
  const pts = [
    { x: 0, y: 0 },
    { x: 30, y: 0 },
    { x: 100, y: 100 },
  ];
  it("finds the closest point within range", () => {
    expect(pointIndex(pts).nearest({ x: 26, y: 3 }, 20)).toEqual({ d: 5, i: 1 });
  });
  it("reports nothing beyond range", () => {
    expect(pointIndex(pts).nearest({ x: 60, y: 60 }, 20)).toEqual({ d: Infinity, i: -1 });
  });
});

describe("smoothLoop", () => {
  it("turns a step into a ramp, wrapping round the loop", () => {
    const out = smoothLoop([0, 0, 0, 0, 3, 3, 3, 3], 1);
    expect(out[3]).toBeCloseTo(1);
    expect(out[4]).toBeCloseTo(2);
    expect(out[0]).toBeCloseTo(1); // neighbours index 7 across the seam
    expect(out[1]).toBe(0);
  });
});

describe("clearRuns", () => {
  it("finds runs of clear samples, dropping short ones", () => {
    expect(clearRuns([1, 1, 1, 0, 1, 0, 1, 1], false, 2)).toEqual([
      { from: 0, to: 2 },
      { from: 6, to: 7 },
    ]);
  });
  it("joins a run across the seam of a closed loop", () => {
    expect(clearRuns([1, 1, 0, 0, 1, 1], true, 2)).toEqual([{ from: 4, to: 7 }]);
  });
  it("treats a fully clear loop as one run back to the start", () => {
    expect(clearRuns([1, 1, 1], true, 2)).toEqual([{ from: 0, to: 3 }]);
  });
});

const ofColor = (features: ReturnType<typeof buildTrackside>["solid"]["features"], color: string) =>
  features.filter((f) => (f.properties as ExtrusionProps).color === color);

/** Closest approach of any vertex to the centerline, in metres. */
function minClearance(
  features: ReturnType<typeof buildTrackside>["solid"]["features"],
  geom: CircuitGeometry,
  geo: NonNullable<ReturnType<typeof getCircuitGeoref>>,
) {
  const center = geom.x.map((x, i) => f1ToEnu(geo, x, geom.y[i]!));
  const index = pointIndex(center);
  let min = Infinity;
  for (const f of features) {
    for (const [lng, lat] of f.geometry.coordinates[0]!) {
      const p = lngLatToEnu(geo.originLng, geo.originLat, lng!, lat!);
      min = Math.min(min, index.nearest(p, 40).d);
    }
  }
  return min;
}

describe("buildTrackside (Silverstone)", () => {
  const side = buildTrackside(silverstone, ssGeo, getPitLane(2));
  const walls = [
    ...ofColor(side.solid.features, MAP3D_TRACKSIDE_COLORS.wall),
    ...MAP3D_TRACKSIDE_COLORS.tyres.flatMap((c) => ofColor(side.solid.features, c)),
  ];

  it("puts red/white tyre walls behind the gravel and plain barriers elsewhere", () => {
    for (const c of MAP3D_TRACKSIDE_COLORS.tyres) {
      expect(ofColor(side.solid.features, c).length).toBeGreaterThan(20);
    }
    expect(ofColor(side.solid.features, MAP3D_TRACKSIDE_COLORS.wall).length).toBeGreaterThan(20);
    for (const f of walls) {
      expect(f.properties).toMatchObject({ base: 0 });
      expect([MAP3D_BARRIER_HEIGHT_M, MAP3D_WALL_HEIGHT_M]).toContain(f.properties.height);
    }
  });

  it("tops the barriers with a catch fence", () => {
    expect(side.fence.features.length).toBeGreaterThan(20);
    const f = side.fence.features[0]!.properties as ExtrusionProps;
    expect(f.height - f.base).toBe(MAP3D_FENCE_HEIGHT_M);
    expect(f.color).toBe(MAP3D_TRACKSIDE_COLORS.fence);
  });

  it("never puts a barrier on the asphalt or verge", () => {
    // Raw (unsmoothed) centerline vertices, so allow a metre of tolerance.
    expect(minClearance(walls, silverstone, ssGeo)).toBeGreaterThan(
      MAP3D_TRACK_HALF_WIDTH_M + MAP3D_VERGE_M - 1,
    );
  });

  it("raises a start-light gantry with five lights over the line", () => {
    const gantry = ofColor(side.solid.features, MAP3D_TRACKSIDE_COLORS.gantry);
    expect(gantry).toHaveLength(3); // two posts and the beam
    const lights = ofColor(side.solid.features, MAP3D_TRACKSIDE_COLORS.lights);
    expect(lights).toHaveLength(5);
    const beam = gantry.find((f) => (f.properties as ExtrusionProps).base > 0)!;
    expect((beam.properties as ExtrusionProps).base).toBeGreaterThan(4);
  });
});

describe("buildTrackside (Monaco)", () => {
  const side = buildTrackside(monaco, mcGeo, getPitLane(22));

  it("lines a street circuit with walls, not tyre barriers", () => {
    for (const c of MAP3D_TRACKSIDE_COLORS.tyres) expect(ofColor(side.solid.features, c)).toHaveLength(0);
    const walls = ofColor(side.solid.features, MAP3D_TRACKSIDE_COLORS.wall);
    expect(walls.length).toBeGreaterThan(50);
    for (const f of walls) expect(f.properties.height).toBe(MAP3D_WALL_HEIGHT_M);
  });

  it("keeps the walls off the track", () => {
    expect(
      minClearance(ofColor(side.solid.features, MAP3D_TRACKSIDE_COLORS.wall), monaco, mcGeo),
    ).toBeGreaterThan(MAP3D_TRACK_HALF_WIDTH_M + MAP3D_VERGE_M - 1);
  });
});
