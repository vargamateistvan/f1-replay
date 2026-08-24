import { describe, expect, it } from "vitest";
import {
  computeTrackAutoRotationDeg,
  computeTrackBounds,
  locationToSvg,
} from "./useTrackMap";

describe("useTrackMap utilities", () => {
  it("computes track bounds from points", () => {
    const bounds = computeTrackBounds([
      { x: -2, y: 5 },
      { x: 10, y: -3 },
      { x: 4, y: 8 },
    ]);

    expect(bounds).toEqual({
      minX: -2,
      maxX: 10,
      minY: -3,
      maxY: 8,
      width: 12,
      height: 11,
    });
  });

  it("maps world coordinates into svg space preserving aspect ratio", () => {
    const bounds = {
      minX: 0,
      maxX: 100,
      minY: 0,
      maxY: 50,
      width: 100,
      height: 50,
    };
    const { sx, sy } = locationToSvg(50, 25, bounds, 600, 400);

    expect(sx).toBeCloseTo(300);
    expect(sy).toBeCloseTo(200);
  });

  it("prefers the start-finish region straight for default heading", () => {
    const deg = computeTrackAutoRotationDeg([
      { x: 0, y: 0 },
      { x: 10, y: 0 },
      { x: 20, y: 0 },
      { x: 20, y: 20 },
      { x: 20, y: 40 },
      { x: 10, y: 40 },
      { x: 0, y: 20 },
    ]);

    expect(deg).toBeCloseTo(0);
  });

  it("falls back to the longest straight when start region is weak", () => {
    const deg = computeTrackAutoRotationDeg([
      { x: 0, y: 0 },
      { x: 0.02, y: 0.02 },
      { x: 0.04, y: 0.03 },
      { x: 0.05, y: 0.05 },
      { x: 0.05, y: 40 },
      { x: 0.04, y: 80 },
      { x: 0, y: 80.1 },
    ]);

    expect(Math.abs(deg)).toBeCloseTo(90, 1);
  });

  it("normalizes opposite-direction straight to horizontal level", () => {
    const deg = computeTrackAutoRotationDeg([
      { x: 20, y: 0 },
      { x: 10, y: 0 },
      { x: 0, y: 0 },
      { x: -10, y: 0 },
    ]);

    expect(deg).toBeCloseTo(0);
  });

  it("supports Y-flipped coordinates used by SVG map transforms", () => {
    const deg = computeTrackAutoRotationDeg(
      [
        { x: 0, y: 0 },
        { x: 0, y: 10 },
      ],
      true,
    );

    expect(deg).toBeCloseTo(90);
  });

  it("keeps rotated outlines inside the SVG viewport", () => {
    const points = [
      { x: 0, y: 0 },
      { x: 100, y: 0 },
      { x: 100, y: 40 },
      { x: 0, y: 40 },
    ];
    const rotationDeg = 45;
    const rotationRad = (rotationDeg * Math.PI) / 180;
    const centerX = 50;
    const centerY = 20;
    const rotated = points.map((point) => {
      const dx = point.x - centerX;
      const dy = point.y - centerY;
      return {
        x: centerX + dx * Math.cos(rotationRad) - dy * Math.sin(rotationRad),
        y: centerY + dx * Math.sin(rotationRad) + dy * Math.cos(rotationRad),
      };
    });
    const bounds = computeTrackBounds(rotated);
    const mapped = rotated.map((p) => locationToSvg(p.x, p.y, bounds, 360, 180));
    const minX = Math.min(...mapped.map((p) => p.sx));
    const maxX = Math.max(...mapped.map((p) => p.sx));
    const minY = Math.min(...mapped.map((p) => p.sy));
    const maxY = Math.max(...mapped.map((p) => p.sy));

    expect(minX).toBeGreaterThanOrEqual(12);
    expect(maxX).toBeLessThanOrEqual(348);
    expect(minY).toBeGreaterThanOrEqual(12);
    expect(maxY).toBeLessThanOrEqual(168);
  });
});
