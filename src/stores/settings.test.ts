import { describe, expect, it } from "vitest";
import { migrateSettings, SETTINGS_DEFAULTS, useSettings } from "./settings";

describe("ring settings", () => {
  it("keeps pit window outcomes hidden by default", () => {
    expect(SETTINGS_DEFAULTS.mapRingShowPitWindowOutcomes).toBe(false);
  });
});

describe("shared 2D and ring weather effects", () => {
  it("defaults older settings to off", async () => {
    expect(SETTINGS_DEFAULTS.mapWeatherEffectsEnabled).toBe(false);
    useSettings.getState().reset();
    localStorage.setItem("f1-replay-settings", JSON.stringify({ state: { mapViewMode: "ring" }, version: 1 }));
    await useSettings.persist.rehydrate();
    expect(useSettings.getState().mapWeatherEffectsEnabled).toBe(false);
    useSettings.getState().reset();
  });

  it("persists across view changes and resets without altering the 3D default", async () => {
    useSettings.getState().setSetting("mapWeatherEffectsEnabled", true);
    useSettings.getState().setSetting("mapViewMode", "ring");
    await useSettings.persist.rehydrate();
    expect(useSettings.getState().mapWeatherEffectsEnabled).toBe(true);
    useSettings.getState().setSetting("mapViewMode", "2d");
    expect(useSettings.getState().mapWeatherEffectsEnabled).toBe(true);
    useSettings.getState().reset();
    expect(useSettings.getState().mapWeatherEffectsEnabled).toBe(false);
    expect(useSettings.getState().mapView3dWeatherEffects).toBe(true);
  });
});

describe("pit lane status setting", () => {
  it("defaults to off and stays off when older settings are restored", async () => {
    expect(SETTINGS_DEFAULTS.mapShowPitLaneStatus).toBe(false);
    useSettings.setState({ mapShowPitLaneStatus: false });
    localStorage.setItem("f1-replay-settings", JSON.stringify({ state: { lightMode: true }, version: 1 }));
    await useSettings.persist.rehydrate();
    expect(useSettings.getState().mapShowPitLaneStatus).toBe(false);
    expect(useSettings.getState().lightMode).toBe(true);
    useSettings.getState().reset();
  });

  it("persists an explicit opt-in and resets it to off", async () => {
    useSettings.getState().setSetting("mapShowPitLaneStatus", true);
    expect(JSON.parse(localStorage.getItem("f1-replay-settings")!).state.mapShowPitLaneStatus).toBe(true);
    await useSettings.persist.rehydrate();
    expect(useSettings.getState().mapShowPitLaneStatus).toBe(true);
    useSettings.getState().reset();
    expect(useSettings.getState().mapShowPitLaneStatus).toBe(false);
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
