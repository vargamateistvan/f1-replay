import { beforeEach, describe, expect, it, vi } from "vitest";
import { fireEvent, render, screen, within } from "@testing-library/react";
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
    trackerTimingMobileCarData: true,
    trackerTimingShowPosition: true,
    trackerTimingShowDriver: true,
    trackerTimingShowAlerts: true,
    trackerTimingShowBestLap: true,
    trackerTimingShowLastLap: false,
    trackerTimingShowGap: true,
    trackerTimingShowInterval: false,
    trackerTimingShowS1: true,
    trackerTimingShowS2: true,
    trackerTimingShowS3: true,
    trackerTimingShowPosDelta: true,
    trackerTimingShowTyre: true,
    trackerTimingShowPit: true,
    trackerTimingShowLap: false,
    trackerTimingShowSpeed: true,
    trackerTimingShowGear: false,
    trackerTimingShowRpm: false,
    trackerTimingShowThrBrk: true,
    trackerTimingShowDrs: true,
    timingMobileShowPosition: true,
    timingMobileShowDriver: true,
    timingMobileShowAlerts: false,
    timingMobileShowBestLap: true,
    timingMobileShowLastLap: false,
    timingMobileShowGap: true,
    timingMobileShowS1: false,
    timingMobileShowS2: false,
    timingMobileShowS3: false,
    timingMobileShowPosDelta: true,
    timingMobileShowTyre: true,
    timingMobileShowPitCount: true,
    timingMobileShowInterval: false,
    timingMobileShowLap: false,
    timingMobileShowSectors: false,
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

vi.mock("@/hooks/useMediaQuery", () => ({
  useMediaQuery: () => true,
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

  it("updates mobile timing column visibility settings", () => {
    render(<SettingsBody />);

    expect(
      screen.queryByText("Driver tracker columns"),
    ).not.toBeInTheDocument();

    const mobileColumnsSection = screen.getByText(
      "Mobile timing columns",
    ).parentElement!;

    fireEvent.click(
      within(mobileColumnsSection).getByRole("button", {
        name: "Interval",
      }),
    );
    expect(state.setSetting).toHaveBeenCalledWith(
      "timingMobileShowInterval",
      true,
    );

    fireEvent.click(
      within(mobileColumnsSection).getByRole("button", { name: "Lap" }),
    );
    expect(state.setSetting).toHaveBeenCalledWith("timingMobileShowLap", true);

    fireEvent.click(
      within(mobileColumnsSection).getByRole("button", { name: "Last lap" }),
    );
    expect(state.setSetting).toHaveBeenCalledWith(
      "timingMobileShowLastLap",
      true,
    );

    expect(
      within(mobileColumnsSection).queryByRole("button", { name: "DRS" }),
    ).not.toBeInTheDocument();
    expect(
      within(mobileColumnsSection).queryByRole("button", { name: "Gear" }),
    ).not.toBeInTheDocument();

    fireEvent.click(
      within(mobileColumnsSection).getByRole("button", { name: "Alerts" }),
    );
    expect(state.setSetting).toHaveBeenCalledWith(
      "timingMobileShowAlerts",
      true,
    );

    fireEvent.click(
      within(mobileColumnsSection).getByRole("button", { name: "Best lap" }),
    );
    expect(state.setSetting).toHaveBeenCalledWith(
      "timingMobileShowBestLap",
      false,
    );
  });
});
