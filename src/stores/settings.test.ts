import { describe, expect, it } from "vitest";
import { migrateSettings } from "./settings";

describe("migrateSettings", () => {
  it("turns the old 3D flag into the 3D view mode", () => {
    const out = migrateSettings({ mapView3d: true, lightMode: true }, 0) as unknown as Record<string, unknown>;
    expect(out.mapViewMode).toBe("3d");
    expect(out.mapView3d).toBeUndefined();
    expect(out.lightMode).toBe(true);
  });

  it("maps the 2D map (or no flag) to the 2D view mode", () => {
    expect(migrateSettings({ mapView3d: false }, 0).mapViewMode).toBe("2d");
    expect(migrateSettings({}, 0).mapViewMode).toBe("2d");
  });

  it("leaves current settings alone", () => {
    expect(migrateSettings({ mapViewMode: "ring" }, 1).mapViewMode).toBe("ring");
  });
});
