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
    toastInvestigation: true,
    toastPenalty: true,
    toastOvertake: true,
    toastPit: true,
    toastFastestLap: true,
    leaderboardTelemetry: true,
    timingShowMinisectors: true,
    trackerTimingTelemetry: true,
    trackerTimingCompactColumn: false,
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
    mapShowLeaderboard: true,
    mapShowCompoundBadges: true,
    mapShowBattleRings: true,
    mapShowDriverHud: true,
    mapShowSectorFlags: true,
    mapShowSectorBox: true,
    mapShowTrackControls: true,
    mapShowCompass: true,
    mapShowWeather: true,
    mapShowClock: true,
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

vi.mock("@/hooks/useSession", () => ({
  useLatestMeeting: () => ({
    data: {
      circuit_key: 1,
      meeting_name: "Italian Grand Prix",
      year: 2026,
    },
    isError: false,
    isPending: false,
  }),
  useSessions: () => ({
    data: [
      {
        session_key: 1,
        session_type: "Race",
        date_start: "2026-09-01T12:00:00Z",
        gmt_offset: "+00:00",
        circuit_short_name: "Monza",
        circuit_key: 1,
        year: 2026,
      },
    ],
    isError: false,
  }),
  useDrivers: () => ({ data: [] }),
}));

vi.mock("@/hooks/useLocationChunks", () => ({
  useLocationChunks: () => ({ data: [] }),
}));

vi.mock("@/components/TrackMap/TrackMap", () => ({
  TrackMap: ({
    circuitShortName,
    activeTrackFlagState,
    weatherOverlay,
    showSectorBox,
    showTrackScreenshot,
  }: {
    circuitShortName: string;
    activeTrackFlagState: { sectorFlags: { 1: string | null } } | null;
    weatherOverlay: unknown;
    showSectorBox?: boolean;
    showTrackScreenshot?: boolean;
  }) => (
    <div
      role="img"
      aria-label={`${circuitShortName} production track map`}
      data-flag={activeTrackFlagState?.sectorFlags[1] ?? "none"}
      data-weather={weatherOverlay ? "visible" : "hidden"}
      data-sector-box={showSectorBox ? "visible" : "hidden"}
      data-png={showTrackScreenshot ? "visible" : "hidden"}
    />
  ),
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

    fireEvent.click(screen.getByRole("tab", { name: "Playback" }));
    fireEvent.click(screen.getByRole("button", { name: "2×" }));
    expect(state.setSetting).toHaveBeenCalledWith("defaultSpeed", 2);

    fireEvent.click(screen.getByRole("button", { name: "16×" }));
    expect(state.setSetting).toHaveBeenCalledWith("defaultSpeed", 16);

    fireEvent.click(screen.getByText("Reset to defaults"));
    expect(state.reset).toHaveBeenCalled();
  });

  it("updates mobile timing column visibility settings", () => {
    render(<SettingsBody />);
    fireEvent.click(screen.getByRole("tab", { name: "Timing" }));

    expect(
      screen.queryByText("Driver tracker columns"),
    ).not.toBeInTheDocument();
    expect(
      screen.queryByText("Timing box live telemetry"),
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

  it("shows one labelled settings category at a time", () => {
    render(<SettingsBody />);

    expect(screen.getByRole("tabpanel")).toHaveAttribute(
      "aria-labelledby",
      "general-settings-tab",
    );
    expect(screen.getByText("Light mode")).toBeInTheDocument();
    expect(screen.queryByText("Enable notifications")).not.toBeInTheDocument();

    fireEvent.click(screen.getByRole("tab", { name: "Alerts" }));

    expect(screen.getByRole("tabpanel")).toHaveAttribute(
      "aria-labelledby",
      "notifications-settings-tab",
    );
    expect(screen.getByText("Enable notifications")).toBeInTheDocument();
    expect(screen.queryByText("Light mode")).not.toBeInTheDocument();
  });

  it("shows the latest race weekend track in the track map preview", () => {
    render(<SettingsBody />);
    fireEvent.click(screen.getByRole("tab", { name: "Track map" }));

    expect(screen.getByText("Italian Grand Prix track map")).toBeInTheDocument();
    expect(
      screen.getByRole("img", { name: "Monza production track map" }),
    ).toHaveAttribute("data-flag", "YELLOW");
    expect(
      screen.getByRole("img", { name: "Monza production track map" }),
    ).toHaveAttribute("data-weather", "visible");
  });

  it("mirrors the sector status box and PNG snapshot settings in the preview", () => {
    render(<SettingsBody />);
    fireEvent.click(screen.getByRole("tab", { name: "Track map" }));

    const map = screen.getByRole("img", { name: "Monza production track map" });
    expect(map).toHaveAttribute("data-sector-box", "visible");
    expect(map).toHaveAttribute("data-png", "visible");
  });

  it("groups the track map settings into subgroups", () => {
    render(<SettingsBody />);
    fireEvent.click(screen.getByRole("tab", { name: "Track map" }));

    for (const group of [
      "Drivers",
      "Flags & Sectors",
      "Circuit Detail",
      "Overlays & Controls",
    ]) {
      expect(screen.getByText(group)).toBeInTheDocument();
    }
  });
});
