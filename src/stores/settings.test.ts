import { describe, expect, it } from "vitest";
import { migrateSettings, SETTINGS_DEFAULTS, useSettings } from "./settings";

describe("ring settings", () => {
  it("keeps pit window outcomes hidden by default", () => {
    expect(SETTINGS_DEFAULTS.mapRingShowPitWindowOutcomes).toBe(false);
  });
});

describe("reset", () => {
  it("restores defaults but keeps onboarding as seen", () => {
    useSettings.setState({
      lightMode: true, tourSeenVersion: 3, replayWelcomeSeen: true,
    });
    useSettings.getState().reset();
    expect(useSettings.getState().lightMode).toBe(false);
    expect(useSettings.getState().tourSeenVersion).toBe(3);
    expect(useSettings.getState().replayWelcomeSeen).toBe(true);
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
