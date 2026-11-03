import { describe, expect, it } from "vitest";
import { MAP3D_RUNOFF_PALETTE } from "@/constants";
import georef from "./circuit-georef.json";
import { getRunoffStyle, isStreetCircuit, RUNOFF_ENTRIES } from "./circuitRunoff";

const GEOREFERENCED = [
  ...new Set(Object.keys((georef as { circuits: Record<string, unknown> }).circuits).map((k) => k.split("-")[0]!)),
];

describe("circuit run-off data", () => {
  // scripts/fetch-runoff.mjs (update-circuits workflow) classifies any new
  // venue; a missing entry means that step didn't run or failed.
  it.each(GEOREFERENCED)("has a run-off entry for 3D circuit %s", (key) => {
    expect(RUNOFF_ENTRIES[key]).toBeDefined();
  });

  it.each(Object.entries(RUNOFF_ENTRIES))("entry %s is well formed", (_key, entry) => {
    expect(entry.name).toBeTruthy();
    expect(["curated", "osm", "default"]).toContain(entry.source);
    expect([...Object.keys(MAP3D_RUNOFF_PALETTE), "street"]).toContain(entry.surface);
    if (entry.bands) {
      expect(entry.surface).toBe("tarmac");
      for (const band of entry.bands) {
        expect(band.color).toMatch(/^#[0-9a-f]{6}$/i);
        expect(band.widthM).toBeGreaterThan(0);
      }
    }
    if (entry.source === "osm") {
      expect(entry.streetShare).toBeGreaterThanOrEqual(0);
      expect(entry.gravelShare).toBeGreaterThanOrEqual(0);
    }
  });

  it("looks a circuit up by key, with gravel for unknown circuits", () => {
    expect(getRunoffStyle(55).surface).toBe("sand");
    expect(getRunoffStyle(99999)).toEqual({ surface: "gravel" });
    expect(getRunoffStyle(null)).toEqual({ surface: "gravel" });
    expect(isStreetCircuit(22)).toBe(true);
    expect(isStreetCircuit(2)).toBe(false);
  });
});
