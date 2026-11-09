import { describe, expect, it } from "vitest";
import { exportSettings, parseSettingsImport, migrateSettings, SETTINGS_DEFAULTS, useSettings } from "./settings";

describe("settings transfer", () => {
  const file = (settings: Record<string, unknown>) => JSON.stringify({ format: "f1-replay-settings", version: 1, settings });

  it("round-trips all preferences but excludes onboarding, UI state and actions", () => {
    const text = exportSettings(useSettings.getState());
    const restored = parseSettingsImport(text);
    expect(restored.mapViewMode).toBe(useSettings.getState().mapViewMode);
    expect(restored.defaultSpeed).toBe(useSettings.getState().defaultSpeed);
    expect(restored.catchupSummaryDefaultFilters).toEqual(useSettings.getState().catchupSummaryDefaultFilters);
    expect(restored).not.toHaveProperty("tourSeenVersion");
    expect(restored).not.toHaveProperty("replayWelcomeSeen");
    expect(restored).not.toHaveProperty("mapShowEnhancedVisuals");
    expect(restored).not.toHaveProperty("isOpen");
    expect(restored).not.toHaveProperty("setSetting");
    expect(Object.keys(restored)).toHaveLength(Object.keys(SETTINGS_DEFAULTS).length - 2);
  });

  it("accepts partial exports without resetting absent preferences", () => {
    const patch = parseSettingsImport(file({ lightMode: true }));
    expect(patch).toEqual({ lightMode: true });
  });

  it.each([
    { mapShowWeather: "true" },
    { defaultSpeed: 3 },
    { notificationMaxVisible: 99 },
    { metricSystem: "other" },
    { mapViewMode: "4d" },
    { mapRingGapMode: "other" },
    { catchupSummaryDefaultFilters: [] },
    { catchupSummaryDefaultFilters: ["unknown"] },
    { catchupSummaryDefaultFilters: [2] },
    { isOpen: true },
    { tourSeenVersion: 3 },
    { replayWelcomeSeen: true },
    { unknown: false },
  ])("rejects invalid preferences %j", (settings) => {
    expect(() => parseSettingsImport(file(settings))).toThrow();
  });

  it.each(["invalid", "null", "[]", "{}", '{"format":"f1-replay-settings","version":2,"settings":{"lightMode":true}}'])(
    "rejects malformed or unsupported exports %s",
    (text) => expect(() => parseSettingsImport(text)).toThrow(),
  );
});

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

  it("removes the retired enhanced-track setting from saved preferences", () => {
    const out = migrateSettings(
      { mapViewMode: "2d", mapShowEnhancedVisuals: false },
      1,
    ) as unknown as Record<string, unknown>;
    expect(out).not.toHaveProperty("mapShowEnhancedVisuals");
  });
});
