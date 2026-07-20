import { beforeEach, describe, expect, it, vi } from "vitest";
import { fireEvent, render, screen } from "@testing-library/react";
import { SettingsBody } from "@/components/SettingsModal/SettingsControls";

const state = vi.hoisted(() => ({
  setSetting: vi.fn(),
  reset: vi.fn(),
}));

vi.mock("@/stores/settings", () => ({
  useSettings: () => ({
    setSetting: state.setSetting,
    reset: state.reset,
    lightMode: false,
    defaultSpeed: 1,
    showPlaybackSpeedControls: true,
    showPlaybackEventChips: true,
    catchupSummaryEnabled: true,
    catchupSummaryDefaultFilters: [
      "pit",
      "flag",
      "penalty",
      "overtake",
      "fastest_lap",
      "investigation",
      "radio",
    ],
    toastsEnabled: true,
    notificationMaxVisible: 4,
    toastRadio: true,
    toastRadioAutoplay: false,
    toastSoundsEnabled: false,
    toastFlag: true,
    toastOvertake: true,
    toastPit: true,
    toastFastestLap: true,
    leaderboardTelemetry: true,
    timingShowMinisectors: true,
    trackerTimingTelemetry: true,
    mapShowLeaderboard: true,
    mapShowCompoundBadges: true,
    mapShowBattleRings: true,
    mapShowDriverHud: true,
    mapShowSectorFlags: true,
    mapShowSectorBox: true,
    mapShowTrackControls: true,
    mapShowCompass: true,
    mapShowWeather: true,
    mapShowDriverAcronym: true,
    mapShowDriverNumberInside: false,
    mapShowEnhancedVisuals: true,
    trackScreenshotPngEnabled: true,
    showCsvExportButtons: false,
    showNextRaceWeekendBanner: true,
    showCoffeeWidget: true,
  }),
}));

describe("SettingsControls", () => {
  beforeEach(() => {
    state.setSetting.mockReset();
    state.reset.mockReset();
  });

  it("updates key settings and supports reset", () => {
    render(<SettingsBody />);

    fireEvent.click(screen.getAllByRole("switch")[0]!);
    expect(state.setSetting).toHaveBeenCalledWith("lightMode", true);

    fireEvent.click(screen.getByRole("button", { name: "2×" }));
    expect(state.setSetting).toHaveBeenCalledWith("defaultSpeed", 2);

    fireEvent.click(screen.getByText("Reset to defaults"));
    expect(state.reset).toHaveBeenCalled();
  });
});
