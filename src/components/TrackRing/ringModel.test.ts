import { describe, expect, it } from "vitest";
import type { CircuitGeometry } from "@/data/circuitGeometryTypes";
import { buildTrackGeometry, projectToSvg } from "../TrackMap/trackGeometry";
import {
  buildRingModel,
  displayArc,
  formatLapTime,
  formatRingGap,
  placeCar,
  toDisplay,
  type RingModel,
  type RingScale,
} from "./ringModel";
import { buildLapTimeProfile } from "./lapTimeProfile";

// 1 km square in the F1 frame (decimetres), sampled every 50 m, starting at
// the origin and heading up the x = 0 side first.
function squareOutline() {
  const pts: { x: number; y: number }[] = [];
  for (let i = 0; i < 20; i++) pts.push({ x: 0, y: i * 500 });
  for (let i = 0; i < 20; i++) pts.push({ x: i * 500, y: 10000 });
  for (let i = 0; i < 20; i++) pts.push({ x: 10000, y: 10000 - i * 500 });
  for (let i = 0; i < 20; i++) pts.push({ x: 10000 - i * 500, y: 0 });
  return {
    points: pts,
    bounds: { minX: 0, maxX: 10000, minY: 0, maxY: 10000, width: 10000, height: 10000 },
  };
}

const geom = buildTrackGeometry(squareOutline());

// Pit lane 30 m beside the first straight, leaving it at 100 m and rejoining at 400 m.
const pitLane = {
  x: [-50, -300, -300, -300, -50],
  y: [1000, 1500, 2500, 3500, 4000],
};

const circuitGeom = {
  corners: [{ number: 3, letter: "", angle: 0, length: 0, trackPosition: { x: 10000, y: 10000 } }],
  marshalSectors: [
    { number: 1, trackPosition: { x: 0, y: 2000 } },
    { number: 2, trackPosition: { x: 0, y: 8000 } },
    { number: 3, trackPosition: { x: 5000, y: 10000 } },
    { number: 4, trackPosition: { x: 10000, y: 8000 } },
    { number: 5, trackPosition: { x: 10000, y: 5000 } },
    { number: 6, trackPosition: { x: 5000, y: 0 } },
  ],
} as unknown as CircuitGeometry;

function place(model: RingModel, x: number, y: number) {
  const { sx, sy } = projectToSvg(geom, x, y);
  return placeCar(model, sx, sy, -1);
}

describe("buildRingModel", () => {
  const model = buildRingModel({ geom, circuitGeom, pitLane, totalMarshalPosts: 6, toScale: true });

  it("finds the pit entry and exit on the lap", () => {
    expect(model.pit!.entry).toBeCloseTo(0.025, 2);
    expect(model.pit!.exit).toBeCloseTo(0.1, 2);
  });

  it("starts sectors 2 and 3 at their first marshal post", () => {
    expect(model.sectorBoundaries[0]).toBeCloseTo(0.375, 2);
    expect(model.sectorBoundaries[1]).toBeCloseTo(0.625, 2);
  });

  it("falls back to thirds without marshal posts", () => {
    const bare = buildRingModel({ geom, circuitGeom: null, pitLane: null, totalMarshalPosts: 0, toScale: true });
    expect(bare.sectorBoundaries).toEqual([1 / 3, 2 / 3]);
    expect(bare.corners).toEqual([]);
  });

  it("places corners on the lap", () => {
    expect(model.corners).toHaveLength(1);
    expect(model.corners[0]!.label).toBe("3");
    expect(model.corners[0]!.fraction).toBeCloseTo(0.5, 2);
  });
});

describe("placeCar", () => {
  const withPit = buildRingModel({ geom, circuitGeom, pitLane, totalMarshalPosts: 6, toScale: true });
  const noPit = buildRingModel({ geom, circuitGeom, pitLane: null, totalMarshalPosts: 6, toScale: true });
  const layout = buildRingModel({ geom, circuitGeom, pitLane, totalMarshalPosts: 6, toScale: false });

  it("keeps a car just off the line on the ring", () => {
    const p = place(withPit, -20, 2500)!;
    expect(p.inPit).toBe(false);
    expect(p.fraction).toBeCloseTo(0.0625, 3);
  });

  it("moves a car in the pit lane onto the pit arc, along the lane", () => {
    const p = place(withPit, -300, 2500)!;
    expect(p.inPit).toBe(true);
    expect(p.fraction).toBeGreaterThan(withPit.pit!.entry);
    expect(p.fraction).toBeLessThan(withPit.pit!.exit);
  });

  it("without a baked pit lane, only cars far off the line count as in the pits", () => {
    expect(place(noPit, -200, 2500)!.inPit).toBe(false);
    const garage = place(noPit, -400, 2500)!;
    expect(garage.inPit).toBe(true);
    expect(garage.fraction).toBeCloseTo(0.0625, 3);
  });

  it("never puts cars in the pits on a layout outline that isn't to scale", () => {
    expect(place(layout, -300, 2500)!.inPit).toBe(false);
  });
});

describe("ring scale", () => {
  // First half of the distance takes 70 % of the lap.
  const profile = buildLapTimeProfile([
    { durationMs: 100_000, points: [[0, 0], [0.5, 70_000], [1, 100_000]] },
  ])!;
  const time: RingScale = { profile, reverse: false };
  const distance: RingScale = { profile: null, reverse: false };

  it("draws by distance without a profile and by time with one", () => {
    expect(toDisplay(distance, 0.25)).toBe(0.25);
    expect(toDisplay(time, 0.25)).toBeCloseTo(0.35);
  });

  it("flips anticlockwise", () => {
    expect(toDisplay({ profile: null, reverse: true }, 0.25)).toBe(0.75);
    expect(toDisplay({ profile, reverse: true }, 0.25)).toBeCloseTo(0.65);
  });

  it("keeps arcs running the short way along the travel direction", () => {
    // Sector 1 (0 → 0.25) reversed covers the dial from 0.75 to the top.
    expect(displayArc({ profile: null, reverse: true }, 0, 0, 10, 0, 0.25)).toContain(" 0 0 1 ");
    expect(displayArc({ profile: null, reverse: false }, 0, 0, 10, 0.75, 1)).toContain(" 0 0 1 ");
  });
});

describe("formatRingGap", () => {
  it("labels the leader, gaps and lapped cars", () => {
    expect(formatRingGap({ interval: null, gap_to_leader: null }, "interval")).toBe("LEAD");
    expect(formatRingGap({ interval: 0.84, gap_to_leader: 12.31 }, "interval")).toBe("+0.8");
    expect(formatRingGap({ interval: 0.84, gap_to_leader: 12.31 }, "leader")).toBe("+12.3");
    expect(formatRingGap({ interval: "+1 LAP", gap_to_leader: "+2 LAPS" }, "leader")).toBe("+2L");
    expect(formatRingGap({ interval: "+1 LAP", gap_to_leader: "+1 LAP" }, "interval")).toBe("+1L");
    expect(formatRingGap(undefined, "interval")).toBeNull();
  });

  it("trusts the known leader over cars reading 0 s", () => {
    const stale = { interval: 4.2, gap_to_leader: 0 };
    expect(formatRingGap(stale, "interval", false)).toBe("+4.2");
    expect(formatRingGap(stale, "leader", false)).toBeNull();
    expect(formatRingGap({ interval: null, gap_to_leader: null }, "interval", true)).toBe("LEAD");
  });
});

describe("formatLapTime", () => {
  it("formats m:ss.sss", () => {
    expect(formatLapTime(94_412)).toBe("1:34.412");
    expect(formatLapTime(65_005)).toBe("1:05.005");
  });
});
