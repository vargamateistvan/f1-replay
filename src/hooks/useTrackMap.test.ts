import { describe, expect, it } from "vitest";
import { computeTrackBounds, locationToSvg } from "./useTrackMap";

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
});
