import { describe, expect, it } from "vitest";
import { MAP3D_CAR_SYNC_TIMEOUT_MS } from "@/constants";
import {
  cameraTime,
  canSendCars,
  createCarSync,
  markCarsSent,
  markCarsShown,
} from "./carSync";

describe("carSync", () => {
  it("aims the camera at the playhead until the first update lands", () => {
    const sync = createCarSync();
    expect(cameraTime(sync, 1_000)).toBe(1_000);
    markCarsSent(sync, 1_000, 0);
    expect(cameraTime(sync, 1_050)).toBe(1_050);
    expect(markCarsShown(sync, 20)).toBe(20);
    expect(cameraTime(sync, 1_100)).toBe(1_000);
  });

  it("holds new updates while one is in flight", () => {
    const sync = createCarSync();
    expect(canSendCars(sync, 0)).toBe(true);
    markCarsSent(sync, 500, 0);
    expect(canSendCars(sync, 10)).toBe(false);
    markCarsShown(sync, 18);
    expect(canSendCars(sync, 18)).toBe(true);
  });

  it("gives up on a stuck update after the timeout and counts it as shown", () => {
    const sync = createCarSync();
    markCarsSent(sync, 700, 0);
    expect(canSendCars(sync, MAP3D_CAR_SYNC_TIMEOUT_MS - 1)).toBe(false);
    expect(canSendCars(sync, MAP3D_CAR_SYNC_TIMEOUT_MS)).toBe(true);
    expect(cameraTime(sync, 2_000)).toBe(700);
  });

  it("ignores tile events with nothing in flight", () => {
    const sync = createCarSync();
    expect(markCarsShown(sync, 5)).toBeNull();
    expect(cameraTime(sync, 42)).toBe(42);
  });
});
