import { describe, expect, it } from "vitest";
import { buildMiniMapProjection } from "./miniMapProjection";

// A 2:1 rectangle, 2000 wide (x) and 1000 tall (y), counter-clockwise.
const rect = { x: [0, 2000, 2000, 0], y: [0, 0, 1000, 1000], rotation: 0 };

describe("buildMiniMapProjection", () => {
  it("fits the longer side into the box, keeping aspect", () => {
    const m = buildMiniMapProjection(rect, 120, 10)!;
    expect(m.width).toBeCloseTo(120);
    expect(m.height).toBeCloseTo(70);
  });

  it("flips Y like the 2D map (north at the top)", () => {
    const m = buildMiniMapProjection(rect, 120, 10)!;
    const south = m.project(0, 0);
    const north = m.project(0, 1000);
    expect(north.sy).toBeLessThan(south.sy);
    expect(m.project(2000, 0).sx).toBeGreaterThan(south.sx);
  });

  it("applies the broadcast rotation", () => {
    const m = buildMiniMapProjection({ ...rect, rotation: 90 }, 120, 10)!;
    // Rotated a quarter turn, the wide rectangle becomes tall.
    expect(m.height).toBeCloseTo(120);
    expect(m.width).toBeCloseTo(70);
  });

  it("keeps every centerline point inside the padded box", () => {
    const m = buildMiniMapProjection({ ...rect, rotation: 37 }, 100, 8)!;
    for (let i = 0; i < rect.x.length; i++) {
      const { sx, sy } = m.project(rect.x[i]!, rect.y[i]!);
      expect(sx).toBeGreaterThanOrEqual(8 - 1e-9);
      expect(sy).toBeGreaterThanOrEqual(8 - 1e-9);
      expect(sx).toBeLessThanOrEqual(m.width - 8 + 1e-9);
      expect(sy).toBeLessThanOrEqual(m.height - 8 + 1e-9);
    }
    expect(m.pathData.startsWith("M")).toBe(true);
    expect(m.pathData.endsWith("Z")).toBe(true);
  });

  it("returns null without enough points", () => {
    expect(buildMiniMapProjection({ x: [0, 1], y: [0, 1], rotation: 0 }, 100, 8)).toBeNull();
  });
});
