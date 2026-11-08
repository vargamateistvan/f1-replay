import { beforeEach, describe, expect, it, vi } from "vitest";
import { fireEvent, render, screen, within } from "@testing-library/react";
import { SettingsBody } from "@/components/SettingsModal/SettingsControls";

const state = vi.hoisted(() => ({
  setSetting: vi.fn(),
  reset: vi.fn(),
  mapViewMode: "2d" as "2d" | "3d" | "ring",
  available3d: true,
  showPitRejoin: true,
  showPitLaneStatus: false,
  showRingPitOutcomes: true,
  previewRequests: vi.fn(),
}));

vi.mock("@/stores/settings", () => ({
  useSettings: () => ({
    setSetting: state.setSetting,
    reset: state.reset,
    lightMode: false,
    amplitudeSessionReplayEnabled: true,
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
    mapShowPitRejoin: state.showPitRejoin,
    mapShowPitLaneStatus: state.showPitLaneStatus,
    mapShowSectorFlags: true,
    mapShowSectorBox: true,
    mapShowTrackControls: true,
    mapShowCompass: true,
    mapShowWeather: true,
    mapWeatherEffectsEnabled: false,
    mapShowClock: true,
    mapShowDriverAcronym: true,
    mapShowDriverNumberInside: false,
    mapShowRaceLeader: true,
    mapShowEnhancedVisuals: true,
    mapShowDriverHeatmap: true,
    mapRingShowPitWindowOutcomes: state.showRingPitOutcomes,
    mapView3dBattleGaps: true,
    trackScreenshotPngEnabled: true,
    mapViewMode: state.mapViewMode,
    mapView3dTerrain: false,
    mapView3dSessionLighting: true,
    showCsvExportButtons: false,
    showNextRaceWeekendBanner: true,
    showCoffeeWidget: true,
  }),
}));

vi.mock("@/hooks/useMediaQuery", () => ({
  useMediaQuery: () => true,
}));

vi.mock("@/hooks/useSession", () => ({
  useLatestMeeting: () => {
    state.previewRequests();
    return {
      data: {
        circuit_key: 1,
        meeting_name: "Italian Grand Prix",
        year: 2026,
      },
      isError: false,
      isPending: false,
    };
  },
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
  useDrivers: () => ({
    data: [
      { driver_number: 55, name_acronym: "SAI", team_colour: "E8002D" },
      { driver_number: 16, name_acronym: "LEC", team_colour: "E8002D" },
      { driver_number: 4, name_acronym: "NOR", team_colour: "FF8000" },
    ],
  }),
  useLaps: () => ({
    data: [{ date_start: "2026-09-01T12:20:00Z", lap_duration: 90, lap_number: 12 }],
  }),
}));

vi.mock("@/hooks/useLocationChunks", () => ({
  useLocationChunks: () => ({
    data: [
      { date: "2026-09-01T12:00:30Z", driver_number: 55, x: 100, y: 120 },
      { date: "2026-09-01T12:00:30Z", driver_number: 16, x: 200, y: 220 },
      { date: "2026-09-01T12:00:30Z", driver_number: 4, x: 300, y: 320 },
    ],
  }),
}));

vi.mock("@/components/TrackMap3D/availability", () => ({
  isMap3dAvailable: () => state.available3d,
}));

vi.mock("@/data/circuitGeometry", () => ({
  hasCircuitGeometry: () => true,
}));

vi.mock("@/components/TrackMap3D/TrackMap3D", () => ({
  TrackMap3D: ({
    circuitKey,
    previewTimeMs,
    focusDriver,
    focusDriverLap,
    pitRejoinGaps,
    battleGaps,
    pitLaneStatus,
  }: {
    circuitKey: number;
    previewTimeMs?: number;
    focusDriver: number | null;
    focusDriverLap: number | null;
    pitRejoinGaps?: Map<number, number>;
    battleGaps: { chaser: number; ahead: number; gap: number }[];
    pitLaneStatus?: { exit: string } | null;
  }) => (
    <div
      role="img"
      aria-label={`circuit ${circuitKey} 3D track map`}
      data-preview-time={previewTimeMs ?? "timeline"}
      data-focus={focusDriver ?? "none"}
      data-lap={focusDriverLap ?? "none"}
      data-pit-gaps={pitRejoinGaps?.size ?? 0}
      data-battle-gaps={battleGaps.length}
      data-pit-status={pitLaneStatus?.exit ?? "none"}
    />
  ),
}));

vi.mock("@/components/TrackRing/TrackRing", () => ({
  TrackRing: ({
    circuitKey,
    previewTimeMs,
    focusDriver,
    pitRejoinGaps,
    pitLaneStatus,
  }: {
    circuitKey: number;
    previewTimeMs?: number;
    focusDriver: number | null;
    pitRejoinGaps?: Map<number, number>;
    pitLaneStatus?: { exit: string } | null;
  }) => (
    <div
      role="img"
      aria-label={`circuit ${circuitKey} ring view`}
      data-preview-time={previewTimeMs ?? "timeline"}
      data-focus={focusDriver ?? "none"}
      data-pit-gaps={pitRejoinGaps?.size ?? 0}
      data-pit-status={pitLaneStatus?.exit ?? "none"}
    />
  ),
}));

vi.mock("@/components/TrackMap/TrackMap", () => ({
  TrackMap: ({
    circuitShortName,
    trackFlagState,
    weatherOverlay,
    showSectorBox,
    showTrackScreenshot,
    focusDriver,
    focusDriverLap,
    pitRejoinGaps,
    battleGaps,
    showStartReplayHint,
    previewTimeMs,
    pitLaneStatus,
  }: {
    circuitShortName: string;
    trackFlagState: { marshalFlags: Record<number, string> } | null;
    weatherOverlay: unknown;
    showSectorBox?: boolean;
    showTrackScreenshot?: boolean;
    focusDriver: number | null;
    focusDriverLap: number | null;
    pitRejoinGaps?: Map<number, number>;
    battleGaps: { chaser: number; ahead: number; gap: number }[];
    showStartReplayHint?: boolean;
    previewTimeMs?: number;
    pitLaneStatus?: { exit: string } | null;
  }) => (
    <div
      role="img"
      aria-label={`${circuitShortName} production track map`}
      data-flag={trackFlagState?.marshalFlags[1] ?? "none"}
      data-weather={weatherOverlay ? "visible" : "hidden"}
      data-sector-box={showSectorBox ? "visible" : "hidden"}
      data-png={showTrackScreenshot ? "visible" : "hidden"}
      data-focus={focusDriver ?? "none"}
      data-lap={focusDriverLap ?? "none"}
      data-preview-time={previewTimeMs ?? "timeline"}
      data-pit-gaps={pitRejoinGaps?.size ?? 0}
      data-battle-gaps={battleGaps.length}
      data-start-replay-hint={showStartReplayHint === false ? "hidden" : "visible"}
      data-pit-status={pitLaneStatus?.exit ?? "none"}
    />
  ),
}));

describe("SettingsControls", () => {
  beforeEach(() => {
    state.setSetting.mockReset();
    state.reset.mockReset();
    state.mapViewMode = "2d";
    state.available3d = true;
    state.showPitRejoin = true;
    state.showPitLaneStatus = false;
    state.showRingPitOutcomes = true;
    state.previewRequests.mockClear();
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

  it("allows users to opt out of Amplitude Session Replay", () => {
    render(<SettingsBody />);

    const replaySetting = screen.getByText("Session replay").parentElement
      ?.parentElement;
    fireEvent.click(within(replaySetting!).getByRole("switch"));

    expect(state.setSetting).toHaveBeenCalledWith(
      "amplitudeSessionReplayEnabled",
      false,
    );
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
    fireEvent.click(screen.getByRole("button", { name: "Live preview Show" }));

    expect(screen.getByText("Italian Grand Prix track map")).toBeInTheDocument();
    expect(
      screen.getByRole("img", { name: "Monza production track map" }),
    ).toHaveAttribute("data-flag", "YELLOW");
    expect(
      screen.getByRole("img", { name: "Monza production track map" }),
    ).toHaveAttribute("data-weather", "visible");
    const map = screen.getByRole("img", { name: "Monza production track map" });
    expect(map).toHaveAttribute("data-focus", "55");
    expect(map).toHaveAttribute("data-pit-gaps", "3");
    expect(map).toHaveAttribute("data-start-replay-hint", "hidden");
    expect(map).toHaveAttribute("data-preview-time", "30000");
  });

  it("starts with settings visible and loads the live preview only when expanded", () => {
    render(<SettingsBody initialTab="track" />);
    const show = screen.getByRole("button", { name: "Live preview Show" });
    expect(show).toHaveAttribute("aria-expanded", "false");
    expect(screen.getByText("Driver acronym labels")).toBeInTheDocument();
    expect(state.previewRequests).not.toHaveBeenCalled();
    expect(screen.queryByRole("img", { name: "Monza production track map" })).not.toBeInTheDocument();

    fireEvent.click(show);
    const hide = screen.getByRole("button", { name: "Live preview Hide" });
    expect(hide).toHaveAttribute("aria-expanded", "true");
    expect(state.previewRequests).toHaveBeenCalled();
    expect(screen.getByRole("img", { name: "Monza production track map" })).toBeInTheDocument();
    fireEvent.click(hide);
    expect(screen.queryByRole("img", { name: "Monza production track map" })).not.toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Live preview Show" })).toHaveAttribute("aria-expanded", "false");
  });

  it.each([
    ["2d", "Monza production track map"],
    ["3d", "circuit 1 3D track map"],
    ["ring", "circuit 1 ring view"],
  ] as const)("toggles pit status in %s and shows a labelled example in preview", async (view, label) => {
    state.mapViewMode = view;
    const { rerender } = render(<SettingsBody initialTab="track" />);
    const row = screen.getByText("Pit lane status").parentElement!.parentElement!;
    fireEvent.click(within(row).getByRole("switch"));
    expect(state.setSetting).toHaveBeenCalledWith("mapShowPitLaneStatus", true);
    fireEvent.click(screen.getByRole("button", { name: "Live preview Show" }));
    expect(await screen.findByRole("img", { name: label })).toHaveAttribute("data-pit-status", "none");
    state.showPitLaneStatus = true;
    rerender(<SettingsBody initialTab="track" />);
    expect(await screen.findByRole("img", { name: label })).toHaveAttribute("data-pit-status", "closed");
    expect(screen.getByText(/example pit exit closed/i)).toBeInTheDocument();
    fireEvent.click(within(row).getByRole("switch"));
    expect(state.setSetting).toHaveBeenCalledWith("mapShowPitLaneStatus", false);
  });

  it("mirrors the sector status box and PNG snapshot settings in the preview", () => {
    render(<SettingsBody />);
    fireEvent.click(screen.getByRole("tab", { name: "Track map" }));
    fireEvent.click(screen.getByRole("button", { name: "Live preview Show" }));

    const map = screen.getByRole("img", { name: "Monza production track map" });
    expect(map).toHaveAttribute("data-sector-box", "visible");
    expect(map).toHaveAttribute("data-png", "visible");
  });

  it("only stages pit projections when the active map view has them enabled", async () => {
    state.showPitRejoin = false;
    const mapView = render(<SettingsBody initialTab="track" />);
    fireEvent.click(screen.getByRole("button", { name: "Live preview Show" }));
    expect(screen.getByRole("img", { name: "Monza production track map" })).toHaveAttribute(
      "data-pit-gaps",
      "0",
    );

    mapView.unmount();
    state.mapViewMode = "ring";
    state.showRingPitOutcomes = false;
    render(<SettingsBody initialTab="track" />);
    fireEvent.click(screen.getByRole("button", { name: "Live preview Show" }));
    expect(await screen.findByRole("img", { name: "circuit 1 ring view" })).toHaveAttribute(
      "data-pit-gaps",
      "0",
    );
  });

  it("groups the track map settings into subgroups", () => {
    render(<SettingsBody />);
    fireEvent.click(screen.getByRole("tab", { name: "Track map" }));

    for (const group of [
      "Cars",
      "Flags & Sectors",
      "Track Detail",
      "Overlays & Controls",
      "Sound",
    ]) {
      expect(screen.getByText(group)).toBeInTheDocument();
    }
  });

  it("shows only the 2D map's settings in the 2D view", () => {
    render(<SettingsBody initialTab="track" />);
    expect(screen.getByRole("radio", { name: "2D map" })).toHaveAttribute("aria-checked", "true");
    expect(screen.getByText("Compass overlay")).toBeInTheDocument();
    expect(screen.getByText("Marshal sector heatmap")).toBeInTheDocument();
    expect(screen.queryByText("Terrain")).not.toBeInTheDocument();
    expect(screen.queryByText("Light & Weather")).not.toBeInTheDocument();
    const weatherRow = screen.getByText("Weather effects").parentElement!.parentElement!;
    fireEvent.click(within(weatherRow).getByRole("switch"));
    expect(state.setSetting).toHaveBeenCalledWith("mapWeatherEffectsEnabled", true);
  });

  it("switches the map view from the settings", () => {
    render(<SettingsBody initialTab="track" />);
    fireEvent.click(screen.getByRole("radio", { name: "3D map" }));
    expect(state.setSetting).toHaveBeenCalledWith("mapViewMode", "3d");
    fireEvent.click(screen.getByRole("radio", { name: "Ring" }));
    expect(state.setSetting).toHaveBeenCalledWith("mapViewMode", "ring");
  });

  it("previews the 3D map and lists its settings in the 3D view", async () => {
    state.mapViewMode = "3d";
    render(<SettingsBody initialTab="track" />);
    fireEvent.click(screen.getByRole("button", { name: "Live preview Show" }));
    expect(screen.getByRole("radio", { name: "3D map" })).toHaveAttribute("aria-checked", "true");
    expect(await screen.findByRole("img", { name: "circuit 1 3D track map" })).toBeInTheDocument();
    expect(screen.getByText("Live preview · 3D")).toBeInTheDocument();
    const map = screen.getByRole("img", { name: "circuit 1 3D track map" });
    expect(map).toHaveAttribute("data-focus", "55");
    expect(map).toHaveAttribute("data-lap", "12");
    expect(map).toHaveAttribute("data-pit-gaps", "3");
    expect(map).toHaveAttribute("data-battle-gaps", "1");
    expect(map).toHaveAttribute("data-preview-time", "30000");
    for (const label of [
      "3D car models",
      "Flag colours on track",
      "Sector condition ribbon",
      "3D buildings and trees",
      "Terrain",
      "Session time-of-day lighting",
      "Weather effects",
    ]) {
      expect(screen.getByText(label)).toBeInTheDocument();
    }
    // 2D-only controls are hidden.
    expect(screen.queryByText("Compass overlay")).not.toBeInTheDocument();
    expect(screen.queryByText("Sector status box")).not.toBeInTheDocument();
  });

  it("previews the ring view and hides settings it doesn't use", async () => {
    state.mapViewMode = "ring";
    render(<SettingsBody initialTab="track" />);
    fireEvent.click(screen.getByRole("button", { name: "Live preview Show" }));
    expect(screen.getByRole("radio", { name: "Ring" })).toHaveAttribute("aria-checked", "true");
    const map = await screen.findByRole("img", { name: "circuit 1 ring view" });
    expect(map).toBeInTheDocument();
    expect(map).toHaveAttribute("data-focus", "55");
    expect(map).toHaveAttribute("data-pit-gaps", "3");
    expect(map).toHaveAttribute("data-preview-time", "30000");
    expect(screen.getByText("Live preview · Ring")).toBeInTheDocument();
    expect(screen.getByText("Corner numbers")).toBeInTheDocument();
    expect(screen.getByText("Sector status box")).toBeInTheDocument();
    for (const label of ["Compass overlay", "Enhanced track visuals", "Elevation heatmap", "Track controls", "Terrain"]) {
      expect(screen.queryByText(label)).not.toBeInTheDocument();
    }
  });

  it("explains why the 3D map can't be picked without a token or WebGL2", () => {
    state.available3d = false;
    state.mapViewMode = "3d";
    render(<SettingsBody initialTab="track" />);
    expect(screen.getByRole("radio", { name: "3D map" })).toBeDisabled();
    expect(screen.getByRole("radio", { name: "2D map" })).toHaveAttribute("aria-checked", "true");
    expect(screen.getByText(/needs a Mapbox token/i)).toBeInTheDocument();
  });

  it("keeps telemetry chart settings in their own category", () => {
    render(<SettingsBody />);
    fireEvent.click(screen.getByRole("tab", { name: "Timing" }));
    expect(screen.queryByText("Telemetry Charts")).not.toBeInTheDocument();

    fireEvent.click(screen.getByRole("tab", { name: "Telemetry" }));
    expect(screen.getByRole("tabpanel")).toHaveAttribute(
      "aria-labelledby",
      "telemetry-settings-tab",
    );
    expect(screen.getByText("Low speed corner bands")).toBeInTheDocument();
  });

  it("opens on the requested category", () => {
    render(<SettingsBody initialTab="track" />);
    expect(screen.getByRole("tab", { name: "Track map" })).toHaveAttribute(
      "aria-selected",
      "true",
    );
  });
});
