import { describe, expect, it } from "vitest";
import {
  CAMERA_MODES_WITH_TV,
  chasePose,
  frameAlpha,
  nextCameraMode,
  orbitBearing,
} from "./cameraModes";

describe("nextCameraMode", () => {
  it("cycles follow → chase → orbit → follow", () => {
    expect(nextCameraMode("follow")).toBe("chase");
    expect(nextCameraMode("chase")).toBe("orbit");
    expect(nextCameraMode("orbit")).toBe("follow");
  });

  it("adds tv after orbit when the director is available", () => {
    expect(nextCameraMode("orbit", CAMERA_MODES_WITH_TV)).toBe("tv");
    expect(nextCameraMode("tv", CAMERA_MODES_WITH_TV)).toBe("follow");
  });

  it("falls back to follow from tv when it's no longer offered", () => {
    expect(nextCameraMode("tv")).toBe("follow");
  });
});

describe("chasePose", () => {
  it("puts the eye behind the car and the target ahead of it", () => {
    const north = chasePose({ x: 100, y: 200 }, 0, { back: 40, up: 12, ahead: 30 });
    expect(north.eye.x).toBeCloseTo(100);
    expect(north.eye.y).toBeCloseTo(160);
    expect(north.target.y).toBeCloseTo(230);
    expect(north.up).toBe(12);

    const east = chasePose({ x: 0, y: 0 }, 90, { back: 40, up: 12, ahead: 30 });
    expect(east.eye.x).toBeCloseTo(-40);
    expect(east.target.x).toBeCloseTo(30);
    expect(east.eye.y).toBeCloseTo(0);
  });
});

describe("orbitBearing", () => {
  it("turns at the configured rate and wraps", () => {
    expect(orbitBearing(10, 1000, 6)).toBeCloseTo(16);
    expect(orbitBearing(358, 1000, 6)).toBeCloseTo(4);
  });
});

describe("frameAlpha", () => {
  it("matches alpha at 60 fps and compounds for slower frames", () => {
    expect(frameAlpha(0.3, 1000 / 60)).toBeCloseTo(0.3);
    // Two 60 fps frames of 0.3 each leave 0.49 of the gap.
    expect(frameAlpha(0.3, 2000 / 60)).toBeCloseTo(1 - 0.49);
    expect(frameAlpha(0.3, 0)).toBe(0);
  });
});
