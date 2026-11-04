import { describe, expect, it } from "vitest";
import {
  buildSpeedTrace,
  drsState,
  shiftLightTone,
  shiftLightsLit,
} from "./hudModel";
import {
  TELEMETRY_RPM_SHIFT,
  TELEMETRY_SHIFT_LIGHTS,
  TELEMETRY_SHIFT_LIGHTS_MIN_RPM,
} from "@/constants";

describe("drsState", () => {
  it("maps OpenF1 drs values", () => {
    expect(drsState(null)).toBeNull();
    expect(drsState(undefined)).toBeNull();
    expect(drsState(0)).toBe("off");
    expect(drsState(1)).toBe("off");
    expect(drsState(8)).toBe("eligible");
    expect(drsState(10)).toBe("open");
    expect(drsState(12)).toBe("open");
    expect(drsState(14)).toBe("open");
  });
});

describe("shiftLightsLit", () => {
  it("is dark below the first light", () => {
    expect(shiftLightsLit(TELEMETRY_SHIFT_LIGHTS_MIN_RPM)).toBe(0);
    expect(shiftLightsLit(4_000)).toBe(0);
  });

  it("lights progressively and fills at the shift point", () => {
    const mid = (TELEMETRY_SHIFT_LIGHTS_MIN_RPM + TELEMETRY_RPM_SHIFT) / 2;
    const lit = shiftLightsLit(mid);
    expect(lit).toBeGreaterThan(0);
    expect(lit).toBeLessThan(TELEMETRY_SHIFT_LIGHTS);
    expect(shiftLightsLit(TELEMETRY_RPM_SHIFT - 1)).toBe(
      TELEMETRY_SHIFT_LIGHTS - 1,
    );
    expect(shiftLightsLit(TELEMETRY_RPM_SHIFT)).toBe(TELEMETRY_SHIFT_LIGHTS);
    expect(shiftLightsLit(14_000)).toBe(TELEMETRY_SHIFT_LIGHTS);
  });
});

describe("shiftLightTone", () => {
  it("splits the lights into green, red and blue thirds", () => {
    const third = TELEMETRY_SHIFT_LIGHTS / 3;
    expect(shiftLightTone(0)).toBe("green");
    expect(shiftLightTone(third - 1)).toBe("green");
    expect(shiftLightTone(third)).toBe("red");
    expect(shiftLightTone(third * 2)).toBe("blue");
    expect(shiftLightTone(TELEMETRY_SHIFT_LIGHTS - 1)).toBe("blue");
  });
});

describe("buildSpeedTrace", () => {
  const samples = [
    { ms: 0, speed: 100, brake: 0 },
    { ms: 5_000, speed: 300, brake: 0 },
    { ms: 6_000, speed: 200, brake: 100 },
    { ms: 7_000, speed: 120, brake: 100 },
    { ms: 8_000, speed: 150, brake: 0 },
    { ms: 20_000, speed: 300, brake: 0 },
  ];

  it("returns null with fewer than two samples in view", () => {
    expect(buildSpeedTrace(samples, -1, 10_000, 100, 10, 300)).toBeNull();
    expect(buildSpeedTrace([], 5_000, 10_000, 100, 10, 300)).toBeNull();
  });

  it("scales the window into the box and never shows the future", () => {
    const trace = buildSpeedTrace(samples, 10_000, 10_000, 100, 30, 300)!;
    expect(trace.points.split(" ")).toEqual([
      "0.0,20.0",
      "50.0,0.0",
      "60.0,10.0",
      "70.0,18.0",
      "80.0,15.0",
    ]);
    expect(trace.x0).toBe(0);
    expect(trace.x1).toBe(80);
    expect(trace.brakeSpans).toEqual([[60, 80]]);
  });

  it("clamps the sample before the window to the left edge", () => {
    const trace = buildSpeedTrace(samples, 12_000, 10_000, 100, 30, 300)!;
    expect(trace.points.startsWith("0.0,20.0")).toBe(true);
    expect(trace.x0).toBe(0);
  });

  it("closes a brake span that is still open at the playhead", () => {
    const trace = buildSpeedTrace(samples, 7_000, 10_000, 100, 30, 300)!;
    expect(trace.brakeSpans).toEqual([[90, 100]]);
  });
});
