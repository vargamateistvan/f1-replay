import { describe, expect, it } from "vitest";
import { parseIntervalSeconds } from "./intervals";

describe("parseIntervalSeconds", () => {
  it("returns finite numeric values unchanged", () => {
    expect(parseIntervalSeconds(0.8)).toBe(0.8);
    expect(parseIntervalSeconds(1)).toBe(1);
  });

  it("parses numeric strings with optional plus prefix", () => {
    expect(parseIntervalSeconds("+0.842")).toBe(0.842);
    expect(parseIntervalSeconds("0.950")).toBe(0.95);
    expect(parseIntervalSeconds("  +1.200 ")).toBe(1.2);
  });

  it("returns null for non-numeric tokens", () => {
    expect(parseIntervalSeconds(null)).toBeNull();
    expect(parseIntervalSeconds("LAP")).toBeNull();
    expect(parseIntervalSeconds("PIT")).toBeNull();
    expect(parseIntervalSeconds(Number.NaN)).toBeNull();
    expect(parseIntervalSeconds(Number.POSITIVE_INFINITY)).toBeNull();
  });
});
