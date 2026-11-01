import { describe, expect, it } from "vitest";
import baked from "./circuit-georef.json";
import { getCircuitLocation } from "./circuitLocations";
import { WORLD_LAND_PATH } from "./worldLand";

describe("getCircuitLocation", () => {
  it("places every georeferenced circuit", () => {
    const keys = new Set(Object.keys(baked.circuits).map((k) => Number(k.split("-")[0])));
    for (const key of keys) {
      const location = getCircuitLocation(key);
      expect(location, `circuit ${key}`).not.toBeNull();
      expect(Math.abs(location!.lng)).toBeLessThanOrEqual(180);
      expect(Math.abs(location!.lat)).toBeLessThanOrEqual(90);
    }
  });

  it("puts Monaco on the Riviera", () => {
    const monaco = getCircuitLocation(22);
    expect(monaco?.lat).toBeCloseTo(43.73, 1);
    expect(monaco?.lng).toBeCloseTo(7.42, 1);
  });

  it("returns null for unknown or missing circuits", () => {
    expect(getCircuitLocation(999_999)).toBeNull();
    expect(getCircuitLocation(null)).toBeNull();
  });
});

describe("WORLD_LAND_PATH", () => {
  it("is a closed SVG path in the 0–360° frame", () => {
    expect(WORLD_LAND_PATH.startsWith("M")).toBe(true);
    expect(WORLD_LAND_PATH.endsWith("z")).toBe(true);
  });
});
