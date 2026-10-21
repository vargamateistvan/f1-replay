import { describe, expect, it } from "vitest";
import { migrateSettings, useSettings } from "./settings";

describe("reset", () => {
  it("restores defaults but keeps the tour as seen", () => {
    useSettings.setState({ lightMode: true, tourSeenVersion: 3 });
    useSettings.getState().reset();
    expect(useSettings.getState().lightMode).toBe(false);
    expect(useSettings.getState().tourSeenVersion).toBe(3);
  });
});

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
