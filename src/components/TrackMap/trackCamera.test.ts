import { describe, expect, it } from "vitest";
import {
  clampFollowView,
  fitRotatedTrack,
  lerpCameraView,
  visibleViewSize,
} from "./trackCamera";

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

  it("reports the SVG area visible in a letterboxed container", () => {
    expect(visibleViewSize(600, 400, 1.5)).toEqual({ w: 600, h: 400 });
    expect(visibleViewSize(600, 400, 2)).toEqual({ w: 800, h: 400 });
    expect(visibleViewSize(600, 400, 1)).toEqual({ w: 600, h: 600 });
    expect(visibleViewSize(600, 400, Number.NaN)).toEqual({ w: 600, h: 400 });
  });

  it("keeps the maximum scale when the rotated outline already fits", () => {
    const pts = [
      { sx: 200, sy: 150 },
      { sx: 400, sy: 250 },
    ];
    expect(fitRotatedTrack(pts, 0, 300, 200, 552, 352, 1.15)).toEqual({
      scale: 1.15,
      dx: -0,
      dy: -0,
    });
  });

  it("shrinks a rotated outline to the available area", () => {
    // A 500-wide horizontal line turned 90° becomes 500 tall.
    const pts = [
      { sx: 50, sy: 200 },
      { sx: 550, sy: 200 },
    ];
    const fit = fitRotatedTrack(pts, 90, 300, 200, 552, 352, 1.15);
    expect(fit.scale).toBeCloseTo(352 / 500);
    expect(fit.dx).toBeCloseTo(0);
    expect(fit.dy).toBeCloseTo(0);
  });

  it("centres an off-centre outline on the pivot", () => {
    const pts = [
      { sx: 300, sy: 0 },
      { sx: 400, sy: 100 },
    ];
    const fit = fitRotatedTrack(pts, 0, 300, 200, 552, 352, 1);
    expect(fit).toEqual({ scale: 1, dx: -50, dy: 150 });
  });
});
