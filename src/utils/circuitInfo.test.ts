import { describe, expect, it } from "vitest";
import type { CircuitGeometry } from "@/data/circuitGeometryTypes";
import melbourne from "@/data/circuit-geometry/10-2025.json";
import interlagos from "@/data/circuit-geometry/14-2025.json";
import { circuitStats, circuitThumbnail } from "./circuitInfo";

// 1 km square, F1 units are decimetres. Counter-clockwise in a Y-up frame.
const SIDE = 2_500;
const square = {
  x: [0, SIDE, SIDE, 0],
  y: [0, 0, SIDE, SIDE],
  rotation: 0,
  corners: [
    { number: 1, letter: "", angle: 0, length: 0, trackPosition: { x: 0, y: 0 } },
    { number: 1, letter: "a", angle: 0, length: 0, trackPosition: { x: 0, y: 0 } },
    { number: 2, letter: "", angle: 0, length: 0, trackPosition: { x: 0, y: 0 } },
  ],
} satisfies Partial<CircuitGeometry>;

describe("circuitStats", () => {
  it("measures the closed centerline in km and counts distinct corner numbers", () => {
    const stats = circuitStats(square);
    expect(stats.lengthKm).toBeCloseTo(1, 6);
    expect(stats.turns).toBe(2);
    expect(stats.direction).toBe("anticlockwise");
  });

  it("detects clockwise layouts", () => {
    const cw = { ...square, x: [...square.x].reverse(), y: [...square.y].reverse() };
    expect(circuitStats(cw).direction).toBe("clockwise");
  });

  it("leaves turns unknown for GPS-baked circuits", () => {
    expect(circuitStats({ ...square, source: "openf1-gps" }).turns).toBeNull();
  });

  it("matches known circuits", () => {
    const mel = circuitStats(melbourne as CircuitGeometry);
    expect(mel.direction).toBe("clockwise");
    expect(mel.lengthKm).toBeGreaterThan(5.2);
    expect(mel.lengthKm).toBeLessThan(5.3);
    expect(circuitStats(interlagos as CircuitGeometry).direction).toBe("anticlockwise");
  });
});

describe("circuitThumbnail", () => {
  it("fits the outline inside the padded box", () => {
    const thumb = circuitThumbnail(square, 120, 80, 6, 0.5)!;
    const nums = thumb.path.match(/-?\d+(\.\d+)?/g)!.map(Number);
    const xs = nums.filter((_, i) => i % 2 === 0);
    const ys = nums.filter((_, i) => i % 2 === 1);
    expect(Math.min(...ys)).toBeCloseTo(6);
    expect(Math.max(...ys)).toBeCloseTo(74);
    expect(Math.min(...xs)).toBeCloseTo(26);
    expect(Math.max(...xs)).toBeCloseTo(94);
    expect(thumb.path.endsWith("Z")).toBe(true);
  });

  it("flips Y like the SVG map and starts the arrow at the first point", () => {
    const thumb = circuitThumbnail(square, 120, 80, 6, 0.5)!;
    // First F1 point (0,0) is the bottom-left once Y points down.
    expect(thumb.arrowPath.startsWith("M26.0 74.0")).toBe(true);
    expect(thumb.arrowPath.match(/L/g)).toHaveLength(2);
    // Start line is perpendicular to the first (horizontal) segment.
    expect(thumb.startLine.x1).toBeCloseTo(thumb.startLine.x2);
  });

  it("returns null for degenerate outlines", () => {
    expect(circuitThumbnail({ ...square, x: [0, 1], y: [0, 1] }, 120, 80, 6, 0.1)).toBeNull();
  });
});
