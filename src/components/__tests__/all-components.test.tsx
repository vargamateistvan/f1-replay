import { describe, it, expect, vi } from "vitest";
import { render } from "@testing-library/react";
import { MemoryRouter } from "react-router-dom";
import type { ReactElement, ReactNode } from "react";
import type { Driver, TeamRadio } from "@/api/types";
import type { CatchupSummary as CatchupSummaryData } from "@/hooks/useCatchupSummary";
import { AppLogo } from "@/components/AppLogo";
import { CatchupSummary } from "@/components/CatchupSummary/CatchupSummary";
import { DriverHeadshot } from "@/components/DriverHeadshot";
import { ErrorBoundary } from "@/components/ErrorBoundary";
import { ErrorMessage } from "@/components/ErrorMessage";
import { EventToastStack } from "@/components/EventToast/EventToastStack";
import { FinalClassification } from "@/components/FinalClassification";
import { FlagBanner } from "@/components/FlagBanner";
import { FocusedTelemetry } from "@/components/FocusedTelemetry/FocusedTelemetry";
import { GapChart } from "@/components/GapChart/GapChart";
import { HowItWorksModal } from "@/components/HowItWorksModal/HowItWorksModal";
import { KeyMoments } from "@/components/KeyMoments/KeyMoments";
import { LapChart } from "@/components/LapChart/LapChart";
import { LiveTiming } from "@/components/LiveTiming/LiveTiming";
import { SectorBar } from "@/components/LiveTiming/SectorBar";
import { TyreBadge } from "@/components/LiveTiming/TyreBadge";
import { MobileNav } from "@/components/MobileNav";
import { Nav } from "@/components/Nav";
import { OvertakeFeed } from "@/components/Overtakes/OvertakeFeed";
import { PlaybackBar } from "@/components/PlaybackBar";
import { QualifyingBanner } from "@/components/QualifyingBanner";
import { RaceChapters } from "@/components/RaceChapters/RaceChapters";
import { RaceControlFeed } from "@/components/RaceControl/RaceControl";
import { ResizeHandle } from "@/components/ResizeHandle";
import { SessionInfoBar } from "@/components/SessionInfoBar";
import { SessionPicker } from "@/components/SessionPicker";
import {
  SettingRow,
  SettingsBody,
  Toggle,
} from "@/components/SettingsModal/SettingsControls";
import { SettingsModal } from "@/components/SettingsModal/SettingsModal";
import { StartingLights } from "@/components/StartingLights";
import { StrategyBar } from "@/components/Strategy/StrategyBar";
import { TeamRadioFeed } from "@/components/TeamRadio/TeamRadio";
import { TelemetryChart } from "@/components/TelemetryChart/TelemetryChart";
import { TrackMap } from "@/components/TrackMap/TrackMap";
import { WeatherPanel } from "@/components/Weather/WeatherPanel";

vi.mock("@/hooks/useSession", () => ({
  useMeetings: vi.fn(() => ({
    data: [],
    isPending: false,
    isError: false,
    error: null,
  })),
  useSessions: vi.fn(() => ({
    data: [],
    isPending: false,
    isError: false,
    error: null,
  })),
}));

vi.mock("@/api/client", () => ({
  isAuthError: vi.fn(() => false),
}));

vi.mock("@/timeline/clock", () => ({
  useTimeline: vi.fn(() => ({
    t: 0,
    playing: false,
    speed: 1,
    toggle: vi.fn(),
    setT: vi.fn(),
    setSpeed: vi.fn(),
    setPlaying: vi.fn(),
  })),
}));

vi.mock("@/hooks/useCarDataWindow", () => ({
  useCarDataWindow: vi.fn(() => ({ data: [] })),
}));

vi.mock("@/hooks/useCarDataForLap", () => ({
  useCarDataForLap: vi.fn(() => ({ data: [] })),
}));

vi.mock("@/hooks/useLocationChunks", () => ({
  chunkIndexFor: vi.fn(() => 0),
}));

vi.mock("@/hooks/useTrackMap", () => ({
  useTrackOutline: vi.fn(() => ({ data: null, isPending: false })),
  locationToSvg: vi.fn((v: number) => v),
  computeTrackAutoRotationDeg: vi.fn(() => 0),
}));

vi.mock("@/data/circuits", () => ({
  getCircuitLayout: vi.fn(() => null),
}));

vi.mock("@/data/circuitGeometry", () => ({
  getCircuitGeometry: vi.fn(() => null),
}));

vi.mock("recharts", () => {
  const Box = ({ children }: { children?: ReactNode }) => <div>{children}</div>;
  return {
    ResponsiveContainer: Box,
    LineChart: Box,
    Line: Box,
    XAxis: Box,
    YAxis: Box,
    CartesianGrid: Box,
    Tooltip: Box,
    ReferenceLine: Box,
    BarChart: Box,
    Bar: Box,
    Legend: Box,
  };
});

vi.mock("uplot", () => {
  class UPlotMock {
    destroy() {}
    setSize() {}
  }
  return {
    default: UPlotMock,
  };
});

vi.mock("@/stores/settings", () => {
  const defaults = {
    toastsEnabled: true,
    toastRadio: true,
    toastRadioAutoplay: false,
    toastFlag: true,
    toastOvertake: true,
    toastPit: true,
    toastFastestLap: true,
    mapShowLeaderboard: true,
    mapShowCompoundBadges: true,
    mapShowBattleRings: true,
    mapShowDriverHud: true,
    mapShowSectorFlags: true,
    mapShowWeather: true,
    leaderboardTelemetry: true,
    trackerTimingTelemetry: false,
    trackScreenshotPngEnabled: true,
    showCoffeeWidget: true,
    defaultSpeed: 1,
    showPlaybackSpeedControls: true,
    showPlaybackEventChips: true,
    catchupSummaryEnabled: true,
    showNextRaceWeekendBanner: true,
    isHelpOpen: true,
    lightMode: false,
  };
  const store = {
    ...defaults,
    isOpen: true,
    openModal: () => undefined,
    closeModal: () => undefined,
    openHelp: () => undefined,
    closeHelp: () => undefined,
    setSetting: () => undefined,
    reset: () => undefined,
  };
  return {
    SETTINGS_DEFAULTS: defaults,
    useSettings: (selector: ((s: typeof store) => unknown) | undefined) =>
      selector ? selector(store) : store,
  };
});

function wrap(ui: ReactElement) {
  return render(<MemoryRouter>{ui}</MemoryRouter>);
}

const drivers: Driver[] = [
  {
    driver_number: 1,
    name_acronym: "VER",
    team_colour: "3671C6",
    full_name: "Max Verstappen",
  },
  {
    driver_number: 16,
    name_acronym: "LEC",
    team_colour: "E8002D",
    full_name: "Charles Leclerc",
  },
] as unknown as Driver[];

const baseDate = "2024-01-01T00:00:10.000Z";

describe("component smoke tests", () => {
  it("renders AppLogo", () => {
    wrap(<AppLogo />);
    expect(true).toBe(true);
  });

  it("renders CatchupSummary", () => {
    wrap(
      <CatchupSummary
        summary={{ fromMs: 0, toMs: 1000, events: [] } as CatchupSummaryData}
        drivers={drivers}
        onDismiss={vi.fn()}
      />,
    );
    expect(true).toBe(true);
  });

  it("renders DriverHeadshot", () => {
    wrap(<DriverHeadshot driver={drivers[0]} accent="#fff" />);
    expect(true).toBe(true);
  });

  it("renders ErrorBoundary", () => {
    wrap(
      <ErrorBoundary>
        <div>child</div>
      </ErrorBoundary>,
    );
    expect(true).toBe(true);
  });

  it("renders ErrorMessage", () => {
    wrap(<ErrorMessage message="oops" compact />);
    expect(true).toBe(true);
  });

  it("renders EventToastStack", () => {
    wrap(<EventToastStack toasts={[]} drivers={drivers} onDismiss={vi.fn()} />);
    expect(true).toBe(true);
  });

  it("renders FinalClassification", () => {
    wrap(
      <FinalClassification results={[]} drivers={drivers} sessionName="Race" />,
    );
    expect(true).toBe(true);
  });

  it("renders FlagBanner", () => {
    wrap(
      <FlagBanner
        entries={[]}
        sessionTimeMs={0}
        sessionStartMs={0}
        isRaceSession
      />,
    );
    expect(true).toBe(true);
  });

  it("renders FocusedTelemetry", () => {
    wrap(
      <FocusedTelemetry
        sessionKey={1}
        driver={drivers[0]}
        compareDriver={drivers[1]}
        sessionStartMs={0}
        onClear={vi.fn()}
        onClearCompare={vi.fn()}
      />,
    );
    expect(true).toBe(true);
  });

  it("renders GapChart", () => {
    wrap(
      <GapChart
        drivers={drivers}
        intervals={[]}
        sessionTimeMs={0}
        sessionStartMs={0}
      />,
    );
    expect(true).toBe(true);
  });

  it("renders HowItWorksModal", () => {
    wrap(<HowItWorksModal />);
    expect(true).toBe(true);
  });

  it("renders KeyMoments", () => {
    wrap(<KeyMoments moments={[]} sessionTimeMs={0} onJump={vi.fn()} />);
    expect(true).toBe(true);
  });

  it("renders LapChart", () => {
    wrap(
      <LapChart
        drivers={drivers}
        positions={[]}
        lapStarts={[]}
        sessionStartMs={0}
        sessionTimeMs={0}
      />,
    );
    expect(true).toBe(true);
  });

  it("renders LiveTiming", () => {
    wrap(
      <LiveTiming
        drivers={drivers}
        positions={[]}
        intervals={[]}
        pits={[]}
        laps={[]}
        sessionTimeMs={0}
        sessionStartMs={0}
      />,
    );
    expect(true).toBe(true);
  });

  it("renders SectorBar", () => {
    wrap(<SectorBar tier="none" title="S1" />);
    expect(true).toBe(true);
  });

  it("renders TyreBadge", () => {
    wrap(<TyreBadge stints={[]} driverNumber={1} currentLap={1} />);
    expect(true).toBe(true);
  });

  it("renders MobileNav", () => {
    wrap(<MobileNav />);
    expect(true).toBe(true);
  });

  it("renders Nav", () => {
    wrap(<Nav />);
    expect(true).toBe(true);
  });

  it("renders OvertakeFeed", () => {
    wrap(
      <OvertakeFeed
        entries={[]}
        drivers={drivers}
        sessionTimeMs={0}
        sessionStartMs={0}
      />,
    );
    expect(true).toBe(true);
  });

  it("renders PlaybackBar", () => {
    wrap(<PlaybackBar durationMs={300000} />);
    expect(true).toBe(true);
  });

  it("renders QualifyingBanner", () => {
    wrap(
      <QualifyingBanner
        phase={null}
        drivers={drivers}
        positions={[]}
        sessionTimeMs={0}
        sessionStartMs={0}
      />,
    );
    expect(true).toBe(true);
  });

  it("renders RaceChapters", () => {
    wrap(
      <RaceChapters
        chapters={[]}
        snapshots={[]}
        sessionTimeMs={0}
        onJump={vi.fn()}
        drivers={drivers}
      />,
    );
    expect(true).toBe(true);
  });

  it("renders RaceControlFeed", () => {
    wrap(
      <RaceControlFeed
        entries={[]}
        drivers={drivers}
        sessionTimeMs={0}
        sessionStartMs={0}
      />,
    );
    expect(true).toBe(true);
  });

  it("renders ResizeHandle", () => {
    wrap(<ResizeHandle onMouseDown={vi.fn()} onTouchStart={vi.fn()} />);
    expect(true).toBe(true);
  });

  it("renders SessionInfoBar", () => {
    wrap(
      <SessionInfoBar
        laps={[]}
        raceControl={[]}
        sessionTimeMs={0}
        sessionStartMs={0}
      />,
    );
    expect(true).toBe(true);
  });

  it("renders SessionPicker", () => {
    wrap(
      <SessionPicker
        year={2024}
        meetingKey={null}
        sessionKey={null}
        onYear={vi.fn()}
        onMeeting={vi.fn()}
        onSession={vi.fn()}
      />,
    );
    expect(true).toBe(true);
  });

  it("renders Toggle", () => {
    wrap(<Toggle checked onChange={vi.fn()} />);
    expect(true).toBe(true);
  });

  it("renders SettingRow", () => {
    wrap(<SettingRow label="Row" checked onChange={vi.fn()} />);
    expect(true).toBe(true);
  });

  it("renders SettingsBody", () => {
    wrap(<SettingsBody />);
    expect(true).toBe(true);
  });

  it("renders SettingsModal", () => {
    wrap(<SettingsModal />);
    expect(true).toBe(true);
  });

  it("renders StartingLights", () => {
    wrap(<StartingLights t={0} lightsOutMs={5000} />);
    expect(true).toBe(true);
  });

  it("renders StrategyBar", () => {
    wrap(
      <StrategyBar
        stints={[]}
        drivers={drivers}
        laps={[]}
        pits={[]}
        sessionTimeMs={0}
        sessionStartMs={0}
      />,
    );
    expect(true).toBe(true);
  });

  it("renders TeamRadioFeed", () => {
    wrap(
      <TeamRadioFeed
        entries={[
          {
            date: baseDate,
            driver_number: 1,
            recording_url: "https://example.com/audio.mp3",
          } as TeamRadio,
        ]}
        drivers={drivers}
        sessionTimeMs={20_000}
        sessionStartMs={0}
      />,
    );
    expect(true).toBe(true);
  });

  it("renders TelemetryChart", () => {
    wrap(
      <TelemetryChart
        title="Speed"
        xData={[0, 100, 200]}
        series={[{ label: "VER", color: "#fff", data: [120, 140, 160] }]}
      />,
    );
    expect(true).toBe(true);
  });

  it("renders TrackMap", () => {
    wrap(
      <TrackMap
        sessionKey={1}
        drivers={drivers}
        locationData={[]}
        sessionStartMs={0}
      />,
    );
    expect(true).toBe(true);
  });

  it("renders WeatherPanel", () => {
    wrap(<WeatherPanel entries={[]} sessionTimeMs={0} sessionStartMs={0} />);
    expect(true).toBe(true);
  });
});
