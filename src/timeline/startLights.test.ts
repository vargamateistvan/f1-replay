import { describe, expect, it } from "vitest";
import {
  LIGHTS_OUT_NOTICE_MS,
  START_LIGHT_COUNT,
  START_LIGHT_INTERVAL_MS,
  START_LIGHTS_LEAD_IN_MS,
  START_LIGHTS_SEQUENCE_MS,
} from "@/constants";
import { isNewStartLight, startLightsState } from "./startLights";

const LIGHTS_OUT = 60_000;
const FIRST_LIGHT = LIGHTS_OUT - START_LIGHTS_SEQUENCE_MS;
const lightOnAt = (n: number) =>
  FIRST_LIGHT + (n - 1) * START_LIGHT_INTERVAL_MS;

describe("startLightsState", () => {
  it("is hidden without a lights-out time", () => {
    expect(startLightsState(LIGHTS_OUT, null)).toBeNull();
  });

  it("is hidden before the get-ready lead-in", () => {
    expect(
      startLightsState(FIRST_LIGHT - START_LIGHTS_LEAD_IN_MS - 1, LIGHTS_OUT),
    ).toBeNull();
  });

  it("shows get ready, then lights one per interval, holding the last", () => {
    expect(startLightsState(FIRST_LIGHT - 1, LIGHTS_OUT)).toEqual({
      phase: "sequence",
      lit: 0,
    });
    for (let n = 1; n <= START_LIGHT_COUNT; n++) {
      expect(startLightsState(lightOnAt(n), LIGHTS_OUT)).toEqual({
        phase: "sequence",
        lit: n,
      });
      expect(startLightsState(lightOnAt(n) - 1, LIGHTS_OUT)).toEqual({
        phase: "sequence",
        lit: n - 1,
      });
    }
    expect(startLightsState(LIGHTS_OUT - 1, LIGHTS_OUT)).toEqual({
      phase: "sequence",
      lit: START_LIGHT_COUNT,
    });
  });

  it("shows lights out briefly after the start", () => {
    expect(startLightsState(LIGHTS_OUT, LIGHTS_OUT)).toEqual({ phase: "out" });
    expect(
      startLightsState(LIGHTS_OUT + LIGHTS_OUT_NOTICE_MS - 1, LIGHTS_OUT),
    ).toEqual({ phase: "out" });
    expect(
      startLightsState(LIGHTS_OUT + LIGHTS_OUT_NOTICE_MS, LIGHTS_OUT),
    ).toBeNull();
  });
});

describe("isNewStartLight", () => {
  const seq = (lit: number) => ({ phase: "sequence" as const, lit });
  const out = { phase: "out" as const };

  it("is true each time one more light comes on", () => {
    expect(isNewStartLight(seq(0), seq(1))).toBe(true);
    expect(isNewStartLight(seq(4), seq(5))).toBe(true);
  });

  it("is true for the first light when entering from before the sequence", () => {
    expect(isNewStartLight(null, seq(1))).toBe(true);
  });

  it("is false at lights out", () => {
    expect(isNewStartLight(seq(5), out)).toBe(false);
    expect(isNewStartLight(null, out)).toBe(false);
  });

  it("is false when seeking into, across or back through the sequence", () => {
    expect(isNewStartLight(null, seq(3))).toBe(false);
    expect(isNewStartLight(seq(1), seq(4))).toBe(false);
    expect(isNewStartLight(seq(4), seq(2))).toBe(false);
    expect(isNewStartLight(out, seq(5))).toBe(false);
    expect(isNewStartLight(seq(2), seq(2))).toBe(false);
    expect(isNewStartLight(seq(5), null)).toBe(false);
  });
});
