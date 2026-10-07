import { describe, expect, it } from "vitest";
import { startLightsState } from "./startLights";

const LIGHTS_OUT = 60_000;

describe("startLightsState", () => {
  it("is hidden without a lights-out time", () => {
    expect(startLightsState(LIGHTS_OUT, null)).toBeNull();
  });

  it("is hidden before the get-ready lead-in", () => {
    expect(startLightsState(LIGHTS_OUT - 5_701, LIGHTS_OUT)).toBeNull();
  });

  it("shows get ready, then lights one per second", () => {
    expect(startLightsState(LIGHTS_OUT - 5_500, LIGHTS_OUT)).toEqual({
      phase: "sequence",
      lit: 0,
    });
    expect(startLightsState(LIGHTS_OUT - 5_000, LIGHTS_OUT)).toEqual({
      phase: "sequence",
      lit: 1,
    });
    expect(startLightsState(LIGHTS_OUT - 2_500, LIGHTS_OUT)).toEqual({
      phase: "sequence",
      lit: 3,
    });
    expect(startLightsState(LIGHTS_OUT - 1, LIGHTS_OUT)).toEqual({
      phase: "sequence",
      lit: 5,
    });
  });

  it("shows lights out briefly after the start", () => {
    expect(startLightsState(LIGHTS_OUT, LIGHTS_OUT)).toEqual({ phase: "out" });
    expect(startLightsState(LIGHTS_OUT + 3_499, LIGHTS_OUT)).toEqual({
      phase: "out",
    });
    expect(startLightsState(LIGHTS_OUT + 3_500, LIGHTS_OUT)).toBeNull();
  });
});
