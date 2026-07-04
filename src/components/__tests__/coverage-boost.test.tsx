import { beforeEach, describe, expect, it, vi } from "vitest";
import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import { MemoryRouter } from "react-router-dom";
import type { ReactNode } from "react";
import { DriverHeadshot } from "@/components/DriverHeadshot";
import { ErrorBoundary } from "@/components/ErrorBoundary";
import { ErrorDisplay } from "@/components/ErrorDisplay";
import { ErrorMessage } from "@/components/ErrorMessage";
import {
  FinalClassification,
  FinalClassificationDialog,
} from "@/components/FinalClassification";
import { FlagBanner } from "@/components/FlagBanner";
import { GapChart } from "@/components/GapChart/GapChart";
import { KeyMoments } from "@/components/KeyMoments/KeyMoments";
import { LapChart } from "@/components/LapChart/LapChart";
import { LiveTiming } from "@/components/LiveTiming/LiveTiming";
import { RaceControlFeed } from "@/components/RaceControl/RaceControl";
import { SectorBar } from "@/components/LiveTiming/SectorBar";
import { TyreBadge } from "@/components/LiveTiming/TyreBadge";
import { OvertakeFeed } from "@/components/Overtakes/OvertakeFeed";
import { QualifyingBanner } from "@/components/QualifyingBanner";
import { RouteSeo } from "@/components/Seo/RouteSeo";
import { SessionInfoBar } from "@/components/SessionInfoBar";
import { SessionPicker } from "@/components/SessionPicker";
import { TelemetryChart } from "@/components/TelemetryChart/TelemetryChart";
import type {
  CarData,
  Driver,
  Interval,
  Lap,
  Overtake,
  Pit,
  Position,
  RaceControl,
  SessionResult,
  Stint,
} from "@/api/types";

const uPlotState = vi.hoisted(() => ({
  instances: [] as Array<{
    scales: { x: { min: number; max: number } };
    setScaleCalls: Array<{ min: number; max: number }>;
  }>,
}));

const mockState = vi.hoisted(() => ({
  meetings: {
    data: [],
    isPending: false,
    isError: false,
    error: null,
  },
  sessions: {
    data: [],
    isPending: false,
    isError: false,
    error: null,
  },
  live: false,
  lightMode: false,
  showCsvExportButtons: false,
  downloadCsv: vi.fn(),
}));

vi.mock("@/hooks/useSession", () => ({
  useMeetings: () => mockState.meetings,
  useSessions: () => mockState.sessions,
}));

vi.mock("@/api/client", () => ({
  isAuthError: (error: { status?: number; __auth?: boolean } | null) =>
    Boolean(
      error &&
      (error.__auth === true || error.status === 401 || error.status === 403),
    ),
  downloadEndpointCsv: (...args: unknown[]) => mockState.downloadCsv(...args),
}));

vi.mock("@/utils/live", () => ({
  isSessionLive: () => mockState.live,
}));

vi.mock("@/stores/settings", () => ({
  useSettings: (
    selector:
      | ((state: {
          lightMode: boolean;
          showCsvExportButtons: boolean;
        }) => unknown)
      | undefined,
  ) => {
    const store = {
      lightMode: mockState.lightMode,
      showCsvExportButtons: mockState.showCsvExportButtons,
    };
    return selector ? selector(store) : store;
  },
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
  };
});

vi.mock("uplot", () => {
  class UPlotMock {
    bbox = { left: 0, width: 200 };
    scales = { x: { min: 0, max: 100 } };
    hooks: { setScale?: Array<() => void> } = {};
    setScaleCalls: Array<{ min: number; max: number }> = [];

    constructor(_opts: unknown, data: unknown[]) {
      const x = (data[0] as Float64Array | number[]) ?? [];
      const min = Number((x as ArrayLike<number>)[0] ?? 0);
      const max = Number((x as ArrayLike<number>)[x.length - 1] ?? 100);
      this.scales.x = { min, max };
      uPlotState.instances.push(this);
    }

    setScale(_key: string, value: { min: number; max: number }) {
      this.scales.x = { min: value.min, max: value.max };
      this.setScaleCalls.push(value);
      for (const hook of this.hooks.setScale ?? []) hook();
    }

    setSize() {}

    destroy() {}
  }

  return {
    default: UPlotMock,
  };
});

const drivers: Driver[] = [
  {
    driver_number: 1,
    name_acronym: "VER",
    full_name: "Max Verstappen",
    team_colour: "3671C6",
    headshot_url: "https://example.com/ver.png",
  },
  {
    driver_number: 16,
    name_acronym: "LEC",
    full_name: "Charles Leclerc",
    team_colour: "E8002D",
  },
  {
    driver_number: 63,
    name_acronym: "RUS",
    full_name: "George Russell",
    team_colour: "00D2BE",
  },
] as unknown as Driver[];

function renderWithRouter(pathname: string) {
  return render(
    <MemoryRouter initialEntries={[pathname]}>
      <RouteSeo />
    </MemoryRouter>,
  );
}

describe("component coverage boost", () => {
  beforeEach(() => {
    mockState.meetings = {
      data: [],
      isPending: false,
      isError: false,
      error: null,
    };
    mockState.sessions = {
      data: [],
      isPending: false,
      isError: false,
      error: null,
    };
    mockState.live = false;
    mockState.lightMode = false;
    mockState.showCsvExportButtons = false;
    mockState.downloadCsv.mockReset();
    uPlotState.instances.length = 0;
    sessionStorage.clear();
    document.head.innerHTML = "";
    document.title = "";
    vi.restoreAllMocks();
  });

  it("covers ErrorDisplay stored errors, runtime listeners, and clearing", async () => {
    sessionStorage.setItem(
      "__app_errors",
      JSON.stringify([{ msg: "Stored boom" }, "Stored fallback"]),
    );

    render(<ErrorDisplay />);

    expect(screen.getByText("Debug: 2 Error(s)")).toBeInTheDocument();
    expect(screen.getByText(/Stored boom/)).toBeInTheDocument();
    expect(screen.getByText(/Stored fallback/)).toBeInTheDocument();

    const runtimeError = new Event("error") as ErrorEvent;
    Object.defineProperty(runtimeError, "message", {
      value: "Window exploded",
    });
    Object.defineProperty(runtimeError, "error", {
      value: new Error("Window exploded"),
    });
    window.dispatchEvent(runtimeError);

    const rejectionEvent = new Event(
      "unhandledrejection",
    ) as PromiseRejectionEvent;
    Object.defineProperty(rejectionEvent, "reason", {
      value: new Error("Async exploded"),
    });
    window.dispatchEvent(rejectionEvent);

    await waitFor(() => {
      expect(screen.getByText("Debug: 4 Error(s)")).toBeInTheDocument();
    });
    expect(screen.getByText(/Window exploded/)).toBeInTheDocument();
    expect(screen.getByText(/Promise: Async exploded/)).toBeInTheDocument();

    fireEvent.click(screen.getByRole("button", { name: "✕" }));
    await waitFor(() => {
      expect(screen.queryByText(/Debug:/)).not.toBeInTheDocument();
    });
    expect(sessionStorage.getItem("__app_errors")).toBeNull();
  });

  it("covers ErrorDisplay invalid stored JSON handling", () => {
    const errorSpy = vi
      .spyOn(console, "error")
      .mockImplementation(() => undefined);
    sessionStorage.setItem("__app_errors", "{invalid");

    render(<ErrorDisplay />);

    expect(screen.queryByText(/Debug:/)).not.toBeInTheDocument();
    expect(errorSpy).toHaveBeenCalledWith(
      "Failed to load stored errors:",
      expect.any(Error),
    );
  });

  it("covers RouteSeo for known and fallback routes", () => {
    const { unmount } = renderWithRouter("/telemetry/");

    expect(document.title).toBe(
      "F1 Telemetry Comparison | Lap-by-Lap Driver Analysis",
    );
    expect(
      document.head
        .querySelector('link[rel="canonical"]')
        ?.getAttribute("href"),
    ).toBe("https://f1replay.app/telemetry");
    expect(
      document.head
        .querySelector('meta[name="keywords"]')
        ?.getAttribute("content"),
    ).toContain("telemetry comparison");
    expect(
      document.head
        .querySelector('meta[property="og:title"]')
        ?.getAttribute("content"),
    ).toBe("F1 Telemetry Comparison | Lap-by-Lap Driver Analysis");
    expect(document.getElementById("route-seo-jsonld")?.textContent).toContain(
      "https://schema.org",
    );

    unmount();
    renderWithRouter("/missing");

    expect(document.title).toBe("F1 Replay | Formula 1 Data Replay Platform");
    expect(
      document.head
        .querySelector('meta[name="robots"]')
        ?.getAttribute("content"),
    ).toBe("noindex, follow");
    expect(document.head.querySelector('meta[name="keywords"]')).toBeNull();
  });

  it("covers SessionPicker latest event flow, live status, and auth banner", async () => {
    mockState.meetings = {
      data: [
        {
          year: 2024,
          meeting_key: 11,
          meeting_name: "Bahrain Grand Prix",
          location: "Sakhir",
          date_start: "2024-03-01T00:00:00.000Z",
          circuit_type: "Permanent",
          circuit_short_name: "Bahrain",
          country_name: "Bahrain",
          country_flag: "https://example.com/flag.png",
          circuit_image: "https://example.com/track.png",
          is_cancelled: true,
        },
        {
          year: 2025,
          meeting_key: 22,
          meeting_name: "Australian Grand Prix",
          location: "Melbourne",
          date_start: "2025-03-15T00:00:00.000Z",
          circuit_type: "Temporary - Street",
          circuit_short_name: "Albert Park",
          country_name: "Australia",
          country_flag: "https://example.com/aus.png",
          circuit_image: "https://example.com/albert-park.png",
          is_cancelled: false,
        },
      ],
      isPending: false,
      isError: true,
      error: { status: 401 },
    } as unknown as typeof mockState.meetings;
    mockState.sessions = {
      data: [
        {
          session_key: 101,
          session_name: "Practice 1",
          date_start: "2025-03-14T01:00:00.000Z",
        },
        {
          session_key: 202,
          session_name: "Race",
          date_start: "2025-03-16T04:00:00.000Z",
        },
      ],
      isPending: false,
      isError: false,
      error: null,
    } as unknown as typeof mockState.sessions;
    mockState.live = true;

    const onYear = vi.fn();
    const onMeeting = vi.fn();
    const onSession = vi.fn();

    render(
      <SessionPicker
        year={2024}
        meetingKey={22}
        sessionKey={202}
        onYear={onYear}
        onMeeting={onMeeting}
        onSession={onSession}
      />,
    );

    expect(screen.getByText(/OpenF1 returned/)).toBeInTheDocument();
    expect(screen.getByText("Street Circuit")).toBeInTheDocument();
    expect(screen.getByText("Live")).toBeInTheDocument();

    fireEvent.click(screen.getByRole("button", { name: "Latest Event" }));

    expect(onYear).toHaveBeenCalledWith(2025);
    expect(onMeeting).toHaveBeenCalledWith(22);
    await waitFor(() => {
      expect(onSession).toHaveBeenCalledWith(202);
    });
  });

  it("covers SessionPicker loading and error states", () => {
    mockState.meetings = {
      data: [],
      isPending: false,
      isError: true,
      error: null,
    };
    mockState.sessions = {
      data: [],
      isPending: true,
      isError: false,
      error: null,
    };

    render(
      <SessionPicker
        year={2024}
        meetingKey={null}
        sessionKey={null}
        onYear={vi.fn()}
        onMeeting={vi.fn()}
        onSession={vi.fn()}
      />,
    );

    expect(screen.getByText("Failed to load events")).toBeInTheDocument();
    expect(screen.getByText("Loading…")).toBeInTheDocument();
    expect(screen.getByLabelText("Session")).toBeDisabled();
  });

  it("covers SessionInfoBar formation lap, jump dialog, and actions", async () => {
    const onShowResults = vi.fn();
    const onJumpToSessionTime = vi.fn();
    const sessionStartMs = Date.parse("2024-01-01T00:00:00.000Z");

    render(
      <SessionInfoBar
        laps={
          [
            {
              lap_number: 1,
              date_start: "2024-01-01T00:01:00.000Z",
            },
            {
              lap_number: 2,
              date_start: "2024-01-01T00:02:00.000Z",
            },
          ] as Lap[]
        }
        raceControl={
          [
            {
              date: "2024-01-01T00:00:10.000Z",
              flag: "YELLOW",
              lap_number: 1,
              message: "Yellow in sector 2",
            },
          ] as RaceControl[]
        }
        sessionTimeMs={30_000}
        sessionStartMs={sessionStartMs}
        airTemp={23.4}
        trackTemp={35.1}
        lightsOutMs={60_000}
        isRaceSession
        totalLapCount={58}
        onShowResults={onShowResults}
        onJumpToSessionTime={onJumpToSessionTime}
      />,
    );

    expect(screen.getByRole("button", { name: "F" })).toBeInTheDocument();
    expect(screen.queryByText("YELLOW FLAG")).not.toBeInTheDocument();
    expect(screen.getByText("Yellow in sector 2")).toBeInTheDocument();
    expect(screen.getByText("23°C")).toBeInTheDocument();
    expect(screen.getByText("35°C")).toBeInTheDocument();

    fireEvent.click(screen.getByText("Show Results"));
    expect(onShowResults).toHaveBeenCalled();

    fireEvent.click(screen.getByRole("button", { name: "F" }));
    expect(screen.getByText("Jump To Lap")).toBeInTheDocument();

    const input = screen.getByRole("spinbutton");
    fireEvent.change(input, { target: { value: "99" } });
    fireEvent.click(screen.getByRole("button", { name: "Jump" }));
    expect(
      screen.getByText("Enter a lap between 1 and 58."),
    ).toBeInTheDocument();

    fireEvent.change(input, { target: { value: "2" } });
    fireEvent.click(screen.getByRole("button", { name: "Jump" }));
    await waitFor(() => {
      expect(onJumpToSessionTime).toHaveBeenCalledWith(120_000);
    });

    fireEvent.click(screen.getByRole("button", { name: "F" }));
    fireEvent.keyDown(window, { key: "Escape" });
    await waitFor(() => {
      expect(screen.queryByText("Jump To Lap")).not.toBeInTheDocument();
    });
  });

  it("covers DriverHeadshot fallback and image failure handling", () => {
    const { rerender } = render(
      <DriverHeadshot driver={drivers[1]} accent="#fff" size="sm" />,
    );

    expect(screen.getByText("LEC")).toBeInTheDocument();

    rerender(<DriverHeadshot driver={drivers[0]} accent="#fff" size="sm" />);
    expect(screen.getByAltText("Max Verstappen")).toBeInTheDocument();

    fireEvent.error(screen.getByAltText("Max Verstappen"));
    expect(screen.getAllByText("VER").length).toBeGreaterThan(0);
  });

  it("covers ErrorBoundary fallback and retry", () => {
    const errorSpy = vi
      .spyOn(console, "error")
      .mockImplementation(() => undefined);
    function FlakyChild({ shouldCrash }: { shouldCrash: boolean }) {
      if (shouldCrash) {
        throw new Error("Telemetry failed");
      }
      return <div>Recovered child</div>;
    }

    const { rerender } = render(
      <ErrorBoundary>
        <FlakyChild shouldCrash />
      </ErrorBoundary>,
    );

    expect(screen.getByText("Safety Car Deployed")).toBeInTheDocument();
    expect(screen.getByText("Telemetry failed")).toBeInTheDocument();

    rerender(
      <ErrorBoundary>
        <FlakyChild shouldCrash={false} />
      </ErrorBoundary>,
    );

    fireEvent.click(screen.getByRole("button", { name: "Try Again" }));
    expect(screen.getByText("Recovered child")).toBeInTheDocument();
    expect(errorSpy).toHaveBeenCalled();
  });

  it("covers QualifyingBanner phase ranges, countdown, and driver chips", () => {
    const positions = [
      {
        driver_number: 1,
        position: 11,
        date: "2024-01-01T00:00:10.000Z",
      },
      {
        driver_number: 16,
        position: 15,
        date: "2024-01-01T00:00:10.000Z",
      },
      {
        driver_number: 63,
        position: 16,
        date: "2024-01-01T00:00:10.000Z",
      },
      {
        driver_number: 1,
        position: 1,
        date: "2024-01-01T00:02:00.000Z",
      },
    ] as Position[];

    const { rerender } = render(
      <QualifyingBanner
        phase="Q3"
        drivers={drivers}
        positions={positions}
        sessionTimeMs={20_000}
        sessionStartMs={Date.parse("2024-01-01T00:00:00.000Z")}
        countdownMs={91_000}
      />,
    );

    expect(screen.getByText("Q2 Eliminated")).toBeInTheDocument();
    expect(screen.getByText("01:31")).toBeInTheDocument();
    expect(screen.getByText("P11")).toBeInTheDocument();
    expect(screen.getByText("P15")).toBeInTheDocument();

    rerender(
      <QualifyingBanner
        phase="Q1"
        drivers={drivers}
        positions={positions}
        sessionTimeMs={20_000}
        sessionStartMs={Date.parse("2024-01-01T00:00:00.000Z")}
      />,
    );

    expect(screen.getByText("Q1 Knockout Zone")).toBeInTheDocument();
    expect(screen.getByText("P16")).toBeInTheDocument();
  });

  it("covers FinalClassification status/detail branches and sorting", () => {
    const results = [
      {
        position: 2,
        driver_number: 16,
        number_of_laps: 58,
        points: 18,
        dnf: false,
        dns: false,
        dsq: false,
        duration: 5050.123,
        gap_to_leader: "+8.765",
        meeting_key: 1,
        session_key: 1,
      },
      {
        position: 1,
        driver_number: 1,
        number_of_laps: 58,
        points: 25,
        dnf: false,
        dns: false,
        dsq: false,
        duration: [5041.25],
        gap_to_leader: null,
        meeting_key: 1,
        session_key: 1,
      },
      {
        position: null,
        driver_number: 63,
        number_of_laps: null,
        points: null,
        dnf: false,
        dns: true,
        dsq: false,
        duration: null,
        gap_to_leader: ["DNS noted"],
        meeting_key: 1,
        session_key: 1,
      },
    ] as SessionResult[];

    render(
      <FinalClassification
        results={results}
        drivers={drivers}
        sessionName="Race"
      />,
    );

    expect(screen.getByText("Final Classification")).toBeInTheDocument();
    expect(screen.getAllByText("P1").length).toBeGreaterThan(0);
    expect(screen.getAllByText("CLASSIFIED").length).toBeGreaterThan(0);
    expect(screen.queryByText("DNS")).not.toBeInTheDocument();
    expect(screen.getByText("DNS noted")).toBeInTheDocument();
    expect(screen.getAllByText("+8.765").length).toBeGreaterThan(0);
    expect(screen.getAllByText("01:24:01.250").length).toBeGreaterThan(0);
  });

  it("covers FinalClassificationDialog close actions", async () => {
    const onClose = vi.fn();
    const results = [
      {
        position: 1,
        driver_number: 1,
        number_of_laps: 58,
        points: 25,
        dnf: false,
        dns: false,
        dsq: false,
        duration: 5000,
        gap_to_leader: null,
        meeting_key: 1,
        session_key: 1,
      },
    ] as SessionResult[];

    const { rerender } = render(
      <FinalClassificationDialog
        results={results}
        drivers={drivers}
        sessionName="Grand Prix"
        onClose={onClose}
      />,
    );

    fireEvent.keyDown(window, { key: "Escape" });
    expect(onClose).toHaveBeenCalledTimes(1);

    fireEvent.click(
      screen.getByRole("button", { name: "Close results dialog" }),
    );
    expect(onClose).toHaveBeenCalledTimes(2);

    rerender(
      <FinalClassificationDialog
        results={results}
        drivers={drivers}
        sessionName="Grand Prix"
        onClose={onClose}
      />,
    );

    fireEvent.click(screen.getByText("Grand Prix"));
    expect(onClose).toHaveBeenCalledTimes(2);
  });

  it("covers FlagBanner race-phase and flag-state branches", () => {
    const entries = [
      {
        date: "2024-01-01T00:01:00.000Z",
        flag: "YELLOW",
        lap_number: 2,
        message: "Yellow",
      },
      {
        date: "2024-01-01T00:02:00.000Z",
        flag: "GREEN",
        lap_number: 3,
        message: "Track clear",
      },
      {
        date: "2024-01-01T00:03:00.000Z",
        flag: "VIRTUAL_SC",
        lap_number: 4,
        message: "VSC",
      },
    ] as RaceControl[];
    const sessionStartMs = Date.parse("2024-01-01T00:00:00.000Z");

    const { rerender } = render(
      <FlagBanner
        entries={entries}
        sessionTimeMs={10_000}
        sessionStartMs={sessionStartMs}
        lightsOutMs={60_000}
        isRaceSession
      />,
    );
    expect(screen.getByText("FORMATION LAP")).toBeInTheDocument();

    rerender(
      <FlagBanner
        entries={entries}
        sessionTimeMs={57_000}
        sessionStartMs={sessionStartMs}
        lightsOutMs={60_000}
        isRaceSession
      />,
    );
    expect(screen.queryByText("FORMATION LAP")).not.toBeInTheDocument();

    rerender(
      <FlagBanner
        entries={entries}
        sessionTimeMs={60_100}
        sessionStartMs={sessionStartMs}
        lightsOutMs={60_000}
        isRaceSession
      />,
    );
    expect(screen.getByText(/LIGHTS OUT/)).toBeInTheDocument();

    rerender(
      <FlagBanner
        entries={entries}
        sessionTimeMs={180_000}
        sessionStartMs={sessionStartMs}
      />,
    );
    expect(screen.getByText("VSC DEPLOYED")).toBeInTheDocument();

    rerender(
      <FlagBanner
        entries={entries}
        sessionTimeMs={130_000}
        sessionStartMs={sessionStartMs}
      />,
    );
    expect(screen.queryByText("⚑ YELLOW FLAG")).not.toBeInTheDocument();
  });

  it("covers ErrorMessage compact and full variants", () => {
    const { rerender } = render(<ErrorMessage message="Load failed" compact />);
    expect(screen.getByText("⚠ Load failed")).toBeInTheDocument();

    rerender(<ErrorMessage message="Crash" />);
    expect(screen.getByText("⚠")).toBeInTheDocument();
    expect(screen.getByText("Crash")).toBeInTheDocument();
  });

  it("covers OvertakeFeed empty, list, and CSV export branches", () => {
    const { rerender } = render(
      <OvertakeFeed
        entries={[]}
        sessionKey={null}
        drivers={drivers}
        sessionTimeMs={0}
        sessionStartMs={0}
      />,
    );
    expect(screen.getByText("Select a session")).toBeInTheDocument();

    rerender(
      <OvertakeFeed
        entries={[]}
        sessionKey={10}
        drivers={drivers}
        sessionTimeMs={0}
        sessionStartMs={1}
      />,
    );
    expect(
      screen.getByText("No overtakes yet — scrub forward"),
    ).toBeInTheDocument();

    mockState.showCsvExportButtons = true;
    const overtakeEntries = [
      {
        date: "2024-01-01T00:00:10.000Z",
        overtaking_driver_number: 1,
        overtaken_driver_number: 16,
        position: 2,
        meeting_key: 1,
        session_key: 10,
      },
      {
        date: "2024-01-01T00:00:12.000Z",
        overtaking_driver_number: 63,
        overtaken_driver_number: 1,
        position: null,
        meeting_key: 1,
        session_key: 10,
      },
    ] as Overtake[];

    rerender(
      <OvertakeFeed
        entries={overtakeEntries}
        sessionKey={10}
        drivers={drivers}
        sessionTimeMs={20_000}
        sessionStartMs={Date.parse("2024-01-01T00:00:00.000Z")}
      />,
    );

    expect(screen.getAllByText("VER").length).toBeGreaterThan(0);
    expect(screen.getByText("LEC")).toBeInTheDocument();
    expect(screen.getByText("for P2")).toBeInTheDocument();
    expect(screen.queryByText("for Pnull")).not.toBeInTheDocument();

    fireEvent.click(
      screen.getByRole("button", { name: "Export overtakes CSV" }),
    );
    expect(mockState.downloadCsv).toHaveBeenCalledWith(
      "overtakes",
      { session_key: 10 },
      "overtakes_10.csv",
    );
  });

  it("covers SectorBar minisector and fallback rendering", () => {
    const { container, rerender } = render(
      <SectorBar
        tier="fastest"
        segments={[2064, 2051, 2049, 1, 0]}
        title="S1"
      />,
    );

    expect(container.querySelectorAll("span").length).toBeGreaterThan(3);

    rerender(
      <SectorBar
        tier="none"
        segments={[]}
        showMinisectors={false}
        widthClass="w-10"
        title="S2"
      />,
    );

    expect(container.querySelector("div.w-10")).toBeInTheDocument();
  });

  it("covers TyreBadge no-active and changed-compound branches", () => {
    const stints = [
      {
        compound: "SOFT",
        driver_number: 1,
        lap_end: 10,
        lap_start: 1,
        meeting_key: 1,
        session_key: 1,
        stint_number: 1,
        tyre_age_at_start: 0,
      },
    ] as Stint[];

    const { rerender } = render(
      <TyreBadge stints={stints} driverNumber={16} currentLap={5} />,
    );
    expect(screen.getByText("—")).toBeInTheDocument();

    rerender(
      <TyreBadge
        stints={stints}
        driverNumber={1}
        currentLap={5}
        startCompound="MEDIUM"
      />,
    );

    expect(screen.getByText("4")).toBeInTheDocument();
    expect(
      screen.getByText("Starting compound was MEDIUM"),
    ).toBeInTheDocument();
    expect(screen.getByTitle("SOFT · 4 laps old")).toBeInTheDocument();
  });

  it("covers GapChart empty, lap-axis, and toggle branches", () => {
    const sessionStartMs = Date.parse("2024-01-01T00:00:00.000Z");
    const { rerender } = render(
      <GapChart
        drivers={drivers}
        intervals={[]}
        sessionTimeMs={0}
        sessionStartMs={sessionStartMs}
      />,
    );
    expect(screen.getByText("No gap data available yet")).toBeInTheDocument();

    rerender(
      <GapChart
        drivers={drivers}
        intervals={
          [
            {
              driver_number: 1,
              date: "2024-01-01T00:00:10.000Z",
              gap_to_leader: 0,
            },
            {
              driver_number: 16,
              date: "2024-01-01T00:00:10.000Z",
              gap_to_leader: 1.234,
            },
            {
              driver_number: 63,
              date: "2024-01-01T00:00:15.000Z",
              gap_to_leader: "1 LAP",
            },
          ] as unknown as Interval[]
        }
        sessionTimeMs={25_000}
        sessionStartMs={sessionStartMs}
        lapStarts={[10_000, 20_000, 30_000]}
        currentLap={2}
      />,
    );

    expect(screen.getByRole("button", { name: "Elapsed" })).toBeInTheDocument();
    fireEvent.click(screen.getByRole("button", { name: "Elapsed" }));
    expect(screen.getByRole("button", { name: "All" })).toBeInTheDocument();
  });

  it("covers GapChart time-axis fallback when no lap starts", () => {
    const sessionStartMs = Date.parse("2024-01-01T00:00:00.000Z");
    render(
      <GapChart
        drivers={drivers}
        intervals={
          [
            {
              driver_number: 1,
              date: "2024-01-01T00:00:10.000Z",
              gap_to_leader: 0,
            },
            {
              driver_number: 16,
              date: "2024-01-01T00:00:15.000Z",
              gap_to_leader: 2.5,
            },
          ] as unknown as Interval[]
        }
        sessionTimeMs={30_000}
        sessionStartMs={sessionStartMs}
        lapStarts={[]}
      />,
    );

    expect(
      screen.queryByText("No gap data available yet"),
    ).not.toBeInTheDocument();
    expect(
      screen.queryByRole("button", { name: "Elapsed" }),
    ).not.toBeInTheDocument();
  });

  it("covers KeyMoments empty, past/future styling, and jump action", () => {
    const onJump = vi.fn();
    const { rerender } = render(
      <KeyMoments moments={[]} sessionTimeMs={0} onJump={onJump} />,
    );
    expect(
      screen.getByText(
        "No key moments yet — scrub forward or select a session",
      ),
    ).toBeInTheDocument();

    rerender(
      <KeyMoments
        moments={[
          {
            ms: 10_000,
            kind: "lead_change",
            label: "VER takes the lead",
            sublabel: "+0.220",
            color: "#e8002d",
          },
          {
            ms: 30_000,
            kind: "vsc",
            label: "VSC deployed",
            color: "#f5a623",
          },
        ]}
        sessionTimeMs={20_000}
        onJump={onJump}
      />,
    );

    fireEvent.click(screen.getByText("VER takes the lead"));
    expect(onJump).toHaveBeenCalledWith(10_000);
    expect(screen.getByText("+0.220")).toBeInTheDocument();
    expect(screen.getByText("VSC")).toBeInTheDocument();
    expect(screen.getByText("VSC deployed").closest("button")).toHaveClass(
      "opacity-40",
    );
  });

  it("covers LapChart empty, elapsed/all toggle, and derived current lap", () => {
    const sessionStartMs = Date.parse("2024-01-01T00:00:00.000Z");
    const { rerender } = render(
      <LapChart
        drivers={drivers}
        positions={[]}
        lapStarts={[]}
        sessionStartMs={sessionStartMs}
        sessionTimeMs={0}
      />,
    );
    expect(
      screen.getByText("No position data for a lap chart yet"),
    ).toBeInTheDocument();

    rerender(
      <LapChart
        drivers={drivers}
        positions={
          [
            {
              driver_number: 1,
              position: 1,
              date: "2024-01-01T00:00:10.000Z",
            },
            {
              driver_number: 16,
              position: 2,
              date: "2024-01-01T00:00:10.000Z",
            },
            {
              driver_number: 1,
              position: 2,
              date: "2024-01-01T00:00:30.000Z",
            },
          ] as unknown as Position[]
        }
        lapStarts={[10_000, 20_000, 30_000]}
        sessionStartMs={sessionStartMs}
        sessionTimeMs={25_000}
      />,
    );

    expect(screen.getByRole("button", { name: "Elapsed" })).toBeInTheDocument();
    fireEvent.click(screen.getByRole("button", { name: "Elapsed" }));
    expect(screen.getByRole("button", { name: "All" })).toBeInTheDocument();
  });

  it("covers LiveTiming loading and empty states", () => {
    const baseProps = {
      drivers,
      positions: [] as Position[],
      intervals: [] as Interval[],
      pits: [] as Pit[],
      laps: [] as Lap[],
      sessionTimeMs: 0,
      sessionStartMs: 0,
    };

    const { rerender } = render(<LiveTiming {...baseProps} isLoading />);
    expect(screen.getByText("Loading timing data")).toBeInTheDocument();

    rerender(<LiveTiming {...baseProps} isLoading={false} />);
    expect(screen.getByText("No session selected")).toBeInTheDocument();

    rerender(<LiveTiming {...baseProps} sessionStartMs={1} />);
    expect(screen.getByText("Waiting for timing")).toBeInTheDocument();
  });

  it("covers LiveTiming no-sector-reference and dense hint paths", () => {
    const sessionStartMs = Date.parse("2024-01-01T00:00:00.000Z");
    const positions = [
      {
        driver_number: 1,
        position: 1,
        date: "2024-01-01T00:00:10.000Z",
      },
    ] as Position[];

    const { rerender } = render(
      <LiveTiming
        drivers={drivers}
        positions={positions}
        intervals={[]}
        pits={[]}
        laps={[]}
        sessionTimeMs={20_000}
        sessionStartMs={sessionStartMs}
        dense={false}
      />,
    );

    expect(screen.getByText("First timed lap pending")).toBeInTheDocument();

    rerender(
      <LiveTiming
        drivers={drivers}
        positions={positions}
        intervals={[]}
        pits={[]}
        laps={[]}
        sessionTimeMs={20_000}
        sessionStartMs={sessionStartMs}
        dense
        onSelectDriver={vi.fn()}
      />,
    );

    expect(screen.getByText("VER")).toBeInTheDocument();
  });

  it("covers LiveTiming populated race rows with select/pit/outlap/telemetry", () => {
    const onSelectDriver = vi.fn();
    const sessionStartMs = Date.parse("2024-01-01T00:00:00.000Z");
    const carData = new Map<number, CarData>([
      [
        1,
        {
          brake: 5,
          date: "2024-01-01T00:00:12.000Z",
          driver_number: 1,
          drs: 12,
          meeting_key: 1,
          n_gear: 7,
          rpm: 12001,
          session_key: 1,
          speed: 301,
          throttle: 95,
        },
      ],
      [
        16,
        {
          brake: 75,
          date: "2024-01-01T00:00:12.000Z",
          driver_number: 16,
          drs: 8,
          meeting_key: 1,
          n_gear: 3,
          rpm: 9033,
          session_key: 1,
          speed: 123,
          throttle: 44,
        },
      ],
    ]);

    render(
      <LiveTiming
        drivers={drivers}
        positions={
          [
            {
              driver_number: 1,
              position: 1,
              date: "2024-01-01T00:00:10.000Z",
            },
            {
              driver_number: 16,
              position: 2,
              date: "2024-01-01T00:00:10.000Z",
            },
          ] as Position[]
        }
        intervals={
          [
            {
              driver_number: 1,
              date: "2024-01-01T00:00:10.000Z",
              gap_to_leader: 0,
              interval: null,
            },
            {
              driver_number: 16,
              date: "2024-01-01T00:00:10.000Z",
              gap_to_leader: 5.234,
              interval: 5.234,
            },
          ] as unknown as Interval[]
        }
        pits={
          [
            {
              date: "2024-01-01T00:01:45.000Z",
              driver_number: 16,
              lap_number: 1,
              meeting_key: 1,
              stop_duration: 2.4,
              lane_duration: 30,
              pit_duration: null,
              session_key: 1,
            },
          ] as Pit[]
        }
        laps={
          [
            {
              date_start: "2024-01-01T00:00:09.000Z",
              driver_number: 1,
              duration_sector_1: 29.5,
              duration_sector_2: 31.0,
              duration_sector_3: 30.1,
              i1_speed: null,
              i2_speed: null,
              is_pit_out_lap: false,
              lap_duration: 90.6,
              lap_number: 1,
              meeting_key: 1,
              segments_sector_1: [2064, 2051],
              segments_sector_2: [2049],
              segments_sector_3: [1],
              session_key: 1,
              st_speed: null,
            },
            {
              date_start: "2024-01-01T00:00:09.000Z",
              driver_number: 16,
              duration_sector_1: 30.5,
              duration_sector_2: 31.8,
              duration_sector_3: 31.2,
              i1_speed: null,
              i2_speed: null,
              is_pit_out_lap: false,
              lap_duration: 93.5,
              lap_number: 1,
              meeting_key: 1,
              segments_sector_1: [2051],
              segments_sector_2: [2049],
              segments_sector_3: [0],
              session_key: 1,
              st_speed: null,
            },
          ] as Lap[]
        }
        raceControl={
          [
            {
              category: "Incident",
              date: "2024-01-01T00:00:11.000Z",
              driver_number: 16,
              flag: null,
              lap_number: 1,
              meeting_key: 1,
              message: "Car 16 retired",
              qualifying_phase: null,
              scope: null,
              sector: null,
              session_key: 1,
            },
          ] as RaceControl[]
        }
        stints={
          [
            {
              compound: "MEDIUM",
              driver_number: 1,
              lap_end: 15,
              lap_start: 1,
              meeting_key: 1,
              session_key: 1,
              stint_number: 1,
              tyre_age_at_start: 0,
            },
            {
              compound: "SOFT",
              driver_number: 1,
              lap_end: 30,
              lap_start: 16,
              meeting_key: 1,
              session_key: 1,
              stint_number: 2,
              tyre_age_at_start: 0,
            },
          ] as Stint[]
        }
        grid={[
          {
            position: 2,
            driver_number: 1,
            lap_duration: 90.0,
            meeting_key: 1,
            session_key: 1,
          },
          {
            position: 1,
            driver_number: 16,
            lap_duration: 89.5,
            meeting_key: 1,
            session_key: 1,
          },
        ]}
        sessionTimeMs={120_000}
        sessionStartMs={sessionStartMs}
        sessionName="Race"
        totalLapCount={58}
        carData={carData}
        selectedDriver={1}
        compareDriver={16}
        onSelectDriver={onSelectDriver}
        chequeredMs={5_000}
      />,
    );

    expect(screen.getByText("LEAD")).toBeInTheDocument();
    expect(screen.getByText("OUTLAP")).toBeInTheDocument();
    expect(screen.getByText("RET")).toBeInTheDocument();
    expect(screen.getByText("Speed")).toBeInTheDocument();
    expect(screen.getByTitle(/lap.*old/)).toBeInTheDocument();
    expect(screen.getAllByText("VER").length).toBeGreaterThan(0);
    expect(screen.getAllByText("LEC").length).toBeGreaterThan(0);

    fireEvent.click(screen.getAllByText("LEC")[0]!);
    expect(onSelectDriver).toHaveBeenCalledWith(16);
  });

  it("covers RaceControlFeed empty states and filter actions", () => {
    const onClearFocus = vi.fn();

    const { rerender } = render(
      <RaceControlFeed
        entries={[]}
        sessionTimeMs={0}
        sessionStartMs={0}
        drivers={drivers}
      />,
    );
    expect(screen.getByText("Select a session")).toBeInTheDocument();

    rerender(
      <RaceControlFeed
        entries={[]}
        sessionTimeMs={0}
        sessionStartMs={1}
        drivers={drivers}
      />,
    );
    expect(screen.getByText("No events match filters")).toBeInTheDocument();

    mockState.showCsvExportButtons = true;
    rerender(
      <RaceControlFeed
        entries={
          [
            {
              category: "Flag",
              date: "2024-01-01T00:00:10.000Z",
              driver_number: null,
              flag: "YELLOW",
              lap_number: 1,
              meeting_key: 1,
              message: "Yellow flag sector 2",
              qualifying_phase: null,
              scope: "sector",
              sector: 2,
              session_key: 99,
            },
            {
              category: "Incident",
              date: "2024-01-01T00:00:20.000Z",
              driver_number: 16,
              flag: null,
              lap_number: 2,
              meeting_key: 1,
              message: "Car 16 under investigation",
              qualifying_phase: null,
              scope: null,
              sector: null,
              session_key: 99,
            },
            {
              category: "Incident",
              date: "2024-01-01T00:00:30.000Z",
              driver_number: 16,
              flag: null,
              lap_number: 3,
              meeting_key: 1,
              message: "Car 16 receives 5 second time penalty",
              qualifying_phase: null,
              scope: null,
              sector: null,
              session_key: 99,
            },
          ] as RaceControl[]
        }
        sessionKey={99}
        sessionTimeMs={60_000}
        sessionStartMs={Date.parse("2024-01-01T00:00:00.000Z")}
        drivers={drivers}
        focusDriver={16}
        onClearFocus={onClearFocus}
      />,
    );

    expect(screen.getAllByText("YELLOW").length).toBeGreaterThan(0);
    expect(screen.getByText("driver filter active")).toBeInTheDocument();
    expect(screen.getByText("Lap 3")).toBeInTheDocument();

    fireEvent.click(screen.getByRole("button", { name: "Tracker" }));
    expect(screen.getByText("Penalty Tracker")).toBeInTheDocument();
    expect(screen.getByText("Penalty")).toBeInTheDocument();

    fireEvent.change(screen.getByPlaceholderText("Search…"), {
      target: { value: "nothing-here" },
    });
    expect(screen.getByText("No events match filters")).toBeInTheDocument();

    fireEvent.click(
      screen.getByRole("button", { name: "Clear driver filter" }),
    );
    expect(onClearFocus).toHaveBeenCalled();

    fireEvent.click(
      screen.getByRole("button", { name: "Export race control CSV" }),
    );
    expect(mockState.downloadCsv).toHaveBeenCalledWith(
      "race_control",
      { session_key: 99 },
      "race_control_99.csv",
    );
  });

  it("covers TelemetryChart no-data and interactive controls", () => {
    const onHoverX = vi.fn();
    const { container, rerender } = render(
      <TelemetryChart title="Speed" xData={[]} series={[]} height={160} />,
    );

    expect(screen.getByText("No data found")).toBeInTheDocument();

    rerender(
      <TelemetryChart
        title="Speed"
        xData={[0, 50, 100, 150]}
        series={[
          { label: "VER", color: "#e8002d", data: [100, 150, 140, 130] },
        ]}
        interactiveControls
        onHoverX={onHoverX}
      />,
    );

    fireEvent.click(screen.getByRole("button", { name: "Pan left" }));
    fireEvent.click(screen.getByRole("button", { name: "Zoom in" }));
    fireEvent.click(screen.getByRole("button", { name: "Zoom out" }));
    fireEvent.click(screen.getByRole("button", { name: "Pan right" }));
    fireEvent.click(screen.getByRole("button", { name: "Reset zoom" }));

    const controls = screen.getByText("Zoom").closest("div");
    const chartArea = controls?.nextElementSibling as HTMLElement;
    fireEvent.mouseMove(chartArea, { clientX: 50, clientY: 10 });
    fireEvent.mouseLeave(chartArea);

    expect(onHoverX).toHaveBeenCalled();
    expect(onHoverX).toHaveBeenLastCalledWith(null);
    expect(uPlotState.instances.length).toBeGreaterThan(0);
    expect(uPlotState.instances[0]!.setScaleCalls.length).toBeGreaterThan(0);

    fireEvent.doubleClick(chartArea);
    expect(container).toBeTruthy();
  });
});
