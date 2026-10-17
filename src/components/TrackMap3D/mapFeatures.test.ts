import { describe, expect, it } from "vitest";
import monacoJson from "@/data/circuit-geometry/22-2025.json";
import type { CircuitGeometry } from "@/data/circuitGeometryTypes";
import { getCircuitGeoref } from "@/data/circuitGeoref";
import type { TrackFlagState } from "@/timeline/raceControl";
import type { CircuitGeoref } from "@/utils/georef";
import {
  broadcastBearing,
  buildCornerPoints,
  buildMarshalSectorLines,
  buildTrackLine,
  groundWidthExpression,
  headingDeg,
  lerpAngleDeg,
  marshalSegmentColor,
  trackBounds,
} from "./mapFeatures";

const monaco = monacoJson as CircuitGeometry;
const monacoGeo = getCircuitGeoref(22, 2025)!;

// Metre-scale frame anchored at 0,0 so headings are easy to reason about.
const unitGeo: CircuitGeoref = {
  originLng: 0,
  originLat: 0,
  scale: 1,
  rotation: 0,
  flipY: false,
  tx: 0,
  ty: 0,
  rmsM: 0,
  maxM: 0,
};

function flags(partial: Partial<TrackFlagState>): TrackFlagState {
  return {
    globalFlag: null,
    marshalFlags: {},
    maxMarshalSector: 0,
    updatedAtMs: 0,
    ...partial,
  };
}

describe("buildTrackLine / trackBounds", () => {
  it("closes the loop and lands in Monaco", () => {
    const line = buildTrackLine(monaco, monacoGeo);
    const coords = line.geometry.coordinates;
    expect(coords).toHaveLength(monaco.x.length + 1);
    expect(coords[0]).toEqual(coords[coords.length - 1]);

    const [[w, s], [e, n]] = trackBounds(line);
    expect(w).toBeGreaterThan(7.40);
    expect(e).toBeLessThan(7.44);
    expect(s).toBeGreaterThan(43.72);
    expect(n).toBeLessThan(43.75);
  });
});

describe("buildMarshalSectorLines", () => {
  it("emits one feature per marshal post, keyed by post number, covering the lap once", () => {
    const { features } = buildMarshalSectorLines(monaco, monacoGeo);
    expect(features.map((f) => f.id).sort((a, b) => a! - b!)).toEqual(
      monaco.marshalSectors.map((m) => m.number).sort((a, b) => a - b),
    );
    // Each segment shares its end vertex with the next segment's start.
    const vertices = features.reduce(
      (sum, f) => sum + f.geometry.coordinates.length - 1,
      0,
    );
    expect(vertices).toBe(monaco.x.length);
  });
});

describe("buildCornerPoints", () => {
  it("labels corners with number + letter", () => {
    const { features } = buildCornerPoints(monaco, monacoGeo);
    expect(features).toHaveLength(monaco.corners.length);
    expect(features[0]!.properties.label).toBe(
      `${monaco.corners[0]!.number}${monaco.corners[0]!.letter}`,
    );
  });
});

describe("marshalSegmentColor", () => {
  it("paints only the flagged post for a local yellow", () => {
    const state = flags({ marshalFlags: { 4: "YELLOW" } });
    expect(marshalSegmentColor(state, 4)).toBe("#f5d400");
    expect(marshalSegmentColor(state, 5)).toBeNull();
  });

  it("paints every post under a track-wide safety car", () => {
    const state = flags({ globalFlag: "SAFETY_CAR" });
    expect(marshalSegmentColor(state, 1)).toBe("#f5a623");
    expect(marshalSegmentColor(state, 17)).toBe("#f5a623");
  });

  it("paints nothing for clear or chequered", () => {
    expect(marshalSegmentColor(flags({ globalFlag: "CHEQUERED" }), 1)).toBeNull();
    expect(marshalSegmentColor(flags({ marshalFlags: { 1: "CLEAR" } }), 1)).toBeNull();
    expect(marshalSegmentColor(null, 1)).toBeNull();
  });
});

describe("groundWidthExpression", () => {
  it("clamps to the minimum when zoomed out and scales by 2× per zoom level", () => {
    const expr = groundWidthExpression(14, 0, 3);
    const stops = expr.slice(3) as number[];
    const at = (z: number) => stops[stops.indexOf(z) + 1]!;
    expect(at(8)).toBe(3);
    // 14 m at zoom 20 on the equator ≈ 14 / 0.0746 m/px.
    expect(at(20)).toBeCloseTo(187.6, 0);
    expect(at(22) / at(20)).toBeCloseTo(4, 2);
  });

  it("mirrors to a negative line-offset with sign -1", () => {
    const right = groundWidthExpression(7, 0, 1.5).slice(3) as number[];
    const left = groundWidthExpression(7, 0, 1.5, -1).slice(3) as number[];
    left.forEach((v, i) => expect(v).toBe(i % 2 === 0 ? right[i] : -right[i]!));
  });
});

describe("headingDeg / broadcastBearing / lerpAngleDeg", () => {
  it("measures compass bearings clockwise from north", () => {
    expect(headingDeg(unitGeo, { x: 0, y: 0 }, { x: 0, y: 10 })).toBeCloseTo(0);
    expect(headingDeg(unitGeo, { x: 0, y: 0 }, { x: 10, y: 0 })).toBeCloseTo(90);
    expect(headingDeg(unitGeo, { x: 0, y: 0 }, { x: -10, y: 0 })).toBeCloseTo(270);
    expect(headingDeg(unitGeo, { x: 0, y: 0 }, { x: 0.1, y: 0 })).toBeNull();
  });

  it("combines the baked broadcast rotation with the frame's own rotation", () => {
    const deg = (monacoGeo.rotation * 180) / Math.PI;
    expect(broadcastBearing(monaco, monacoGeo)).toBeCloseTo(315 + deg, 6);
    expect(broadcastBearing(null, unitGeo)).toBe(0);
  });

  it("lerps angles the short way round", () => {
    expect(lerpAngleDeg(350, 10, 0.5)).toBeCloseTo(0);
    expect(lerpAngleDeg(10, 350, 0.5)).toBeCloseTo(0);
    expect(lerpAngleDeg(90, 180, 0.5)).toBeCloseTo(135);
  });
});
