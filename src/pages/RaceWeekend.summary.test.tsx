import { describe, expect, it, beforeEach, vi } from "vitest";
import { fireEvent, render, screen } from "@testing-library/react";
import { MemoryRouter } from "react-router-dom";
import RaceWeekend from "@/pages/RaceWeekend";

const testState = vi.hoisted(() => ({
  isLive: false,
  trackEvent: vi.fn(),
}));

vi.mock("@/utils/live", () => ({
  isSessionLive: () => testState.isLive,
}));

vi.mock("@/utils/analytics", () => ({
  trackAnalyticsEvent: (...args: unknown[]) => testState.trackEvent(...args),
}));

vi.mock("@/hooks/useMediaQuery", () => ({ useMediaQuery: () => false }));
vi.mock("@/hooks/useCoarseTime", () => ({ useCoarseTime: () => 0 }));
vi.mock("@/hooks/useOpenF1LiveMqtt", () => ({ useOpenF1LiveMqtt: vi.fn() }));
vi.mock("@/hooks/useTimelineUrlSync", () => ({ useTimelineUrlSync: vi.fn() }));
vi.mock("@/hooks/useKeyboardShortcuts", () => ({
  useKeyboardShortcuts: vi.fn(),
}));

vi.mock("@/hooks/useLocationChunks", () => ({
  chunkIndexFor: () => 0,
  locationChunkIndexFor: () => 0,
  useLocationChunks: () => ({ data: [] }),
}));

vi.mock("@/hooks/useAllCarDataWindow", () => ({
  useAllCarDataWindow: () => ({ data: [] }),
}));

vi.mock("@/hooks/useEventToasts", () => ({
  useEventToasts: () => ({ toasts: [], dismiss: vi.fn() }),
}));

vi.mock("@/hooks/useCatchupSummary", () => ({
  useCatchupSummary: () => ({ summary: null, dismiss: vi.fn() }),
}));

const mockSetView = vi.fn();
const mockSetTrackerTab = vi.fn();
const mockSetCommentaryTab = vi.fn();
const mockSetCommentaryMode = vi.fn();

vi.mock("@/hooks/useSearchParamState", () => ({
  useNumberParam: (key: string) => {
    if (key === "meeting") return [1];
    if (key === "session") return [101];
    if (key === "focus") return [null];
    if (key === "compare") return [null];
    return [null];
  },
  useStringParam: (key: string, defaultValue: string) => {
    if (key === "view") return ["tracker", mockSetView];
    if (key === "ttab") return ["timing", mockSetTrackerTab];
    if (key === "ctab") return ["rc", mockSetCommentaryTab];
    if (key === "cmode") return ["elapsed", mockSetCommentaryMode];
    return [defaultValue, vi.fn()];
  },
}));

const timeline = vi.hoisted(() => {
  const timelineState = {
    t: 0,
    playing: false,
    speed: 1,
    setSessionStart: vi.fn(),
    setT: vi.fn(),
    setPlaying: vi.fn(),
    setSpeed: vi.fn(),
    toggle: vi.fn(),
  };
  const useTimelineMock = ((selector?: (s: typeof timelineState) => unknown) =>
    selector ? selector(timelineState) : timelineState) as {
    (selector?: (s: typeof timelineState) => unknown): unknown;
    getState: () => typeof timelineState;
  };
  useTimelineMock.getState = () => timelineState;
  return { timelineState, useTimelineMock };
});

vi.mock("@/timeline/clock", () => ({
  useTimeline: timeline.useTimelineMock,
}));

vi.mock("@/stores/settings", () => ({
  useSettings: () => ({
    toastsEnabled: true,
    toastRadio: true,
    toastRadioAutoplay: false,
    toastSoundsEnabled: false,
    toastFlag: true,
    toastOvertake: true,
    toastPit: true,
    toastFastestLap: true,
    notificationMaxVisible: 3,
    mapShowCompoundBadges: true,
    mapShowBattleRings: true,
    mapShowDriverHud: true,
    mapShowSectorFlags: true,
    mapShowSectorBox: true,
    mapShowTrackControls: true,
    mapShowCompass: true,
    mapShowWeather: true,
    mapShowEnhancedVisuals: true,
    leaderboardTelemetry: false,
    timingShowMinisectors: false,
    trackerTimingTelemetry: false,
    trackerTimingMobileCarData: false,
    timingMobileShowAlerts: false,
    timingMobileShowBestLap: false,
    timingMobileShowGap: false,
    timingMobileShowPosDelta: false,
    timingMobileShowTyre: false,
    timingMobileShowPitCount: false,
    timingMobileShowInterval: false,
    timingMobileShowSectors: false,
    trackScreenshotPngEnabled: true,
    defaultSpeed: 1,
    showPlaybackSpeedControls: true,
    showPlaybackEventChips: true,
    catchupSummaryEnabled: true,
    isHelpOpen: false,
    isOpen: false,
    openHelp: vi.fn(),
  }),
}));

vi.mock("@/components/PlaybackBar", () => ({
  PlaybackBar: () => <div data-testid="playback-bar" />,
}));
vi.mock("@/components/LiveTiming/LiveTiming", () => ({
  default: () => <div data-testid="live-timing" />,
}));
vi.mock("@/components/Weather/WeatherPanel", () => ({
  WeatherPanel: () => <div />,
}));
vi.mock("@/components/QualifyingBanner", () => ({
  QualifyingBanner: () => null,
}));
vi.mock("@/components/StartingLights", () => ({ StartingLights: () => null }));
vi.mock("@/components/SessionInfoBar", () => ({
  SessionInfoBar: () => <div data-testid="session-info" />,
}));
vi.mock("@/components/ErrorMessage", () => ({
  ErrorMessage: () => <div data-testid="error-message" />,
}));
vi.mock("@/components/FinalClassification", () => ({
  FinalClassificationDialog: () => <div data-testid="results-dialog" />,
}));
vi.mock("@/components/EventToast/EventToastStack", () => ({
  EventToastStack: () => null,
}));
vi.mock("@/components/CatchupSummary/CatchupSummary", () => ({
  CatchupSummary: () => null,
}));

const baseSession = {
  session_key: 101,
  session_name: "Grand Prix",
  session_type: "Race",
  date_start: "2025-03-16T14:00:00Z",
  date_end: "2025-03-16T16:00:00Z",
  meeting_key: 1,
  circuit_key: 11,
  circuit_short_name: "Albert Park",
  country_key: 1,
  country_code: "AU",
  country_name: "Australia",
  location: "Melbourne",
  gmt_offset: "+10:00",
  year: 2025,
  is_cancelled: false,
} as const;

vi.mock("@/hooks/useSession", () => ({
  useSessions: () => ({ data: [baseSession], isPending: false }),
  useDrivers: () => ({
    data: [
      {
        driver_number: 1,
        full_name: "Max Verstappen",
        name_acronym: "VER",
      },
    ],
    isPending: false,
    isError: false,
  }),
  useSessionResult: () => ({
    data: [
      {
        position: 1,
        driver_number: 1,
        number_of_laps: 58,
        points: 25,
        dnf: false,
        dns: false,
        dsq: false,
        duration: null,
        gap_to_leader: null,
        meeting_key: 1,
        session_key: 101,
      },
    ],
    isError: false,
  }),
  usePositions: () => ({ data: [], isPending: false, isError: false }),
  useIntervals: () => ({ data: [], isPending: false, isError: false }),
  useStints: () => ({ data: [], isPending: false, isError: false }),
  useLaps: () => ({ data: [], isPending: false, isError: false }),
  useRaceControl: () => ({ data: [], isPending: false, isError: false }),
  useWeather: () => ({ data: [], isPending: false, isError: false }),
  usePits: () => ({ data: [], isPending: false, isError: false }),
  useTeamRadio: () => ({ data: [], isPending: false, isError: false }),
  useStartingGrid: () => ({ data: [], isPending: false, isError: false }),
  useOvertakes: () => ({ data: [], isPending: false, isError: false }),
}));

describe("RaceWeekend historical summary", () => {
  beforeEach(() => {
    testState.trackEvent.mockClear();
    testState.isLive = false;
  });

  it("shows historical summary and tracks CTA clicks", () => {
    render(
      <MemoryRouter>
        <RaceWeekend />
      </MemoryRouter>,
    );

    expect(screen.getByText("Historical Session Summary")).toBeInTheDocument();

    const cta = screen.getByRole("button", {
      name: "View Final Classification",
    });
    fireEvent.click(cta);

    expect(testState.trackEvent).toHaveBeenCalledWith(
      "historical_summary_cta_clicked",
      expect.objectContaining({
        cta_target: "final_classification",
        session_key: 101,
      }),
    );

    expect(
      testState.trackEvent.mock.calls.some(
        ([eventName]) => eventName === "historical_summary_viewed",
      ),
    ).toBe(true);
  });

  it("hides summary for live sessions", () => {
    testState.isLive = true;

    render(
      <MemoryRouter>
        <RaceWeekend />
      </MemoryRouter>,
    );

    expect(
      screen.queryByText("Historical Session Summary"),
    ).not.toBeInTheDocument();
  });
});
