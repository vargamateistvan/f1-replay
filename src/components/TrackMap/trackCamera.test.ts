import { describe, expect, it } from "vitest";
import { clampFollowView, lerpCameraView } from "./trackCamera";

describe("trackCamera", () => {
  it("clamps follow view to SVG bounds", () => {
    expect(clampFollowView(10, 10, 600, 400, 200, 134)).toEqual({
      x: 0,
      y: 0,
      w: 200,
      h: 134,
    });

    expect(clampFollowView(590, 390, 600, 400, 200, 134)).toEqual({
      x: 400,
      y: 266,
      w: 200,
      h: 134,
    });
  });

  it("linearly interpolates between camera views", () => {
    const from = { x: 0, y: 0, w: 600, h: 400 };
    const to = { x: 200, y: 100, w: 200, h: 134 };

    expect(lerpCameraView(from, to, 0)).toEqual(from);
    expect(lerpCameraView(from, to, 1)).toEqual(to);
    expect(lerpCameraView(from, to, 0.5)).toEqual({
      x: 100,
      y: 50,
      w: 400,
      h: 267,
    });
  });

  it("clamps interpolation alpha to [0, 1]", () => {
    const from = { x: 0, y: 0, w: 600, h: 400 };
    const to = { x: 200, y: 100, w: 200, h: 134 };

    expect(lerpCameraView(from, to, -5)).toEqual(from);
    expect(lerpCameraView(from, to, 5)).toEqual(to);
  });
});
