import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { fireEvent, render, screen, within } from "@testing-library/react";
import { MemoryRouter, Route, Routes, useLocation } from "react-router-dom";
import Home from "./Home";
import { useSettings } from "@/stores/settings";
import type { Meeting } from "@/api/types";
import type { CircuitGeometry } from "@/data/circuitGeometryTypes";
import { DEFAULT_YEAR, SESSION_SIMULATION_CARS } from "@/constants";

const preview = vi.hoisted(() => ({
  meetings: [] as Meeting[],
  latest: undefined as Meeting | undefined,
  geometry: null as CircuitGeometry | null,
  pending: false,
  geometryPending: false,
  error: false,
  refetch: vi.fn(),
  useMeetings: vi.fn(),
  useLatestMeeting: vi.fn(),
  useCircuitGeometry: vi.fn(),
}));

vi.mock("@/hooks/useSession", () => ({
  useMeetings: (year: number, options: { enabled: boolean }) => {
    preview.useMeetings(year, options);
    return {
      data: preview.meetings,
      isPending: preview.pending,
      isError: preview.error,
      refetch: preview.refetch,
    };
  },
  useLatestMeeting: (options: { enabled: boolean }) => {
    preview.useLatestMeeting(options);
    return {
      data: preview.latest,
      isPending: preview.pending,
      isError: preview.error,
      refetch: preview.refetch,
    };
  },
  useCachedSimulationDrivers: () => undefined,
}));
vi.mock("@/hooks/useCircuitGeometry", () => ({
  useCircuitGeometry: (key: number | undefined, year: number | undefined) => {
    preview.useCircuitGeometry(key, year);
    return { data: preview.geometry, isPending: preview.geometryPending };
  },
}));

const meeting: Meeting = {
  meeting_key: 22,
  meeting_name: "British Grand Prix",
  meeting_official_name: "British Grand Prix",
  date_start: "2025-07-04T10:00:00Z",
  date_end: "2025-07-06T16:00:00Z",
  year: 2025,
  circuit_key: 2,
  circuit_short_name: "Silverstone",
  circuit_type: "Permanent",
  circuit_image: "",
  circuit_info_url: "",
  country_key: 1,
  country_code: "GBR",
  country_name: "Great Britain",
  country_flag: "",
  location: "Silverstone",
  gmt_offset: "+01:00",
  is_cancelled: false,
};

const mockTrackEvent = vi.fn();
vi.mock("@/lib/analytics", () => ({
  trackEvent: (...args: unknown[]) => mockTrackEvent(...args),
}));
vi.mock("@/hooks/useReleaseDate", () => ({
  useReleaseDate: () => "2026-09-20T10:00:00Z",
}));

function LocationProbe() {
  const location = useLocation();
  return <div data-testid="location">{`${location.pathname}${location.search}`}</div>;
}

function setup(search = "") {
  return render(
    <MemoryRouter initialEntries={[`/home${search}`]}>
      <Routes>
        <Route path="/home" element={<Home />} />
        <Route path="*" element={<LocationProbe />} />
      </Routes>
    </MemoryRouter>,
  );
}

describe("Home page", () => {
  beforeEach(() => {
    preview.meetings = [meeting];
    preview.latest = { ...meeting, meeting_key: 23, year: 2026 };
    preview.geometry = {
      circuitKey: 2, circuitName: "Silverstone", year: 2025, rotation: 0,
      x: [0, 100, 100, 0], y: [0, 0, 100, 100],
      corners: [], marshalSectors: [], marshalLights: [],
    };
    preview.pending = false;
    preview.geometryPending = false;
    preview.error = false;
    preview.refetch.mockClear();
    preview.useMeetings.mockClear();
    preview.useLatestMeeting.mockClear();
    preview.useCircuitGeometry.mockClear();
  });

  afterEach(() => {
    mockTrackEvent.mockClear();
    useSettings.setState({ isTourOpen: false, isHelpOpen: false, isOpen: false });
  });

  it("introduces the app with a link straight into the driver tracker", () => {
    setup();
    expect(screen.getByRole("heading", { level: 1 })).toHaveTextContent("The race,replayed.");
    expect(screen.getByRole("link", { name: "Open Driver Tracker" })).toHaveAttribute(
      "href",
      "/?view=tracker",
    );
  });

  it("shows simulated cars on the selected weekend's real track", () => {
    const { container } = setup("?year=2025&meeting=22&session=202");
    expect(preview.useMeetings).toHaveBeenCalledWith(2025, { enabled: true });
    expect(preview.useLatestMeeting).toHaveBeenCalledWith({ enabled: false });
    expect(preview.useCircuitGeometry).toHaveBeenCalledWith(2, 2025);
    expect(screen.getByText("Silverstone · Simulation · Not live data")).toBeInTheDocument();
    expect(container.querySelectorAll("animateMotion")).toHaveLength(SESSION_SIMULATION_CARS);
  });

  it("uses the latest weekend when no meeting is selected, regardless of the season param", () => {
    setup("?year=2024");
    expect(preview.useMeetings).toHaveBeenCalledWith(2024, { enabled: false });
    expect(preview.useLatestMeeting).toHaveBeenCalledWith({ enabled: true });
    expect(preview.useCircuitGeometry).toHaveBeenCalledWith(2, 2026);
  });

  it("uses the default year without rewriting the URL", () => {
    setup();
    expect(preview.useMeetings).toHaveBeenCalledWith(DEFAULT_YEAR, { enabled: false });
    expect(screen.getByRole("link", { name: "Open Driver Tracker" }))
      .toHaveAttribute("href", "/?view=tracker");
  });

  it("does not substitute the latest track for an unknown selected meeting", () => {
    preview.geometry = null;
    setup("?year=2025&meeting=999");
    expect(preview.useLatestMeeting).toHaveBeenCalledWith({ enabled: false });
    expect(screen.getByText("Track outline unavailable for this weekend.")).toBeInTheDocument();
  });

  it("shows a loading status until meeting metadata is available", () => {
    preview.latest = undefined;
    preview.geometry = null;
    preview.pending = true;
    setup();
    expect(screen.getByRole("status")).toHaveTextContent("Loading track outline");
  });

  it("shows a loading status while the baked track loads", () => {
    preview.geometry = null;
    preview.geometryPending = true;
    setup();
    expect(screen.getByRole("status")).toHaveTextContent("Loading track outline");
  });

  it("offers a retry when weekend metadata fails", () => {
    preview.latest = undefined;
    preview.geometry = null;
    preview.error = true;
    setup();
    expect(screen.getByText("Could not load the race weekend.")).toBeInTheDocument();
    fireEvent.click(screen.getByRole("button", { name: "Retry" }));
    expect(preview.refetch).toHaveBeenCalledOnce();
  });

  it("reports unavailable geometry instead of showing an unrelated circuit", () => {
    preview.geometry = null;
    const { container } = setup();
    expect(screen.getByText("Track outline unavailable for this weekend.")).toBeInTheDocument();
    expect(container.querySelector("animateMotion")).not.toBeInTheDocument();
  });

  it("links every feature page, keeping the selected session", () => {
    setup("?year=2025&meeting=22&session=202&view=leaderboard");
    const features = screen.getByRole("region", { name: "Features" });
    const hrefs = within(features)
      .getAllByRole("link")
      .map((a) => a.getAttribute("href"));
    expect(hrefs).toEqual([
      "/?year=2025&meeting=22&session=202&view=tracker",
      "/?year=2025&meeting=22&session=202&view=leaderboard",
      "/?year=2025&meeting=22&session=202&view=commentary",
      "/telemetry?year=2025&meeting=22&session=202",
      "/schedule?year=2025&meeting=22&session=202",
      "/standings?year=2025&meeting=22&session=202",
    ]);
  });

  it("explains how to add F1 Replay to an iPhone or iPad Home Screen", () => {
    setup();
    const install = screen.getByRole("region", { name: "Add to Home Screen" });
    expect(within(install).getByText("Open F1 Replay in Safari")).toBeInTheDocument();
    expect(within(install).getByText("Tap the Share button")).toBeInTheDocument();
    expect(within(install).getByText("Choose “Add to Home Screen”")).toBeInTheDocument();
    expect(within(install).getByText(/open it in Safari first/)).toBeInTheDocument();
  });

  it("tracks feature clicks", () => {
    setup();
    fireEvent.click(screen.getByRole("link", { name: /Telemetry/ }));
    expect(mockTrackEvent).toHaveBeenCalledWith("home_link_clicked", {
      destination: "telemetry",
    });
    expect(screen.getByTestId("location")).toHaveTextContent("/telemetry");
  });

  it("asks for support with external links that open in a new tab", () => {
    setup();
    const support = screen.getByRole("region", { name: "Keep F1 Replay on track" });
    const coffee = within(support).getByRole("link", { name: "Buy me a coffee" });
    expect(coffee).toHaveAttribute("href", "https://buymeacoffee.com/matt_varga");
    expect(coffee).toHaveAttribute("target", "_blank");
    expect(coffee.getAttribute("rel")).toContain("noopener");
    expect(within(support).getByRole("link", { name: "Star on GitHub" })).toHaveAttribute(
      "href",
      "https://github.com/vargamateistvan/f1-replay",
    );
    fireEvent.click(coffee);
    expect(mockTrackEvent).toHaveBeenCalledWith("home_support_clicked", { target: "coffee" });
  });

  it("includes the About information on the Home page", () => {
    setup();

    expect(
      screen.getByRole("heading", { name: "About F1 Replay" }),
    ).toBeInTheDocument();
    expect(screen.getByText("dev")).toBeInTheDocument();
    expect(screen.getByText(/2026/)).toBeInTheDocument();
    expect(screen.getByRole("link", { name: "OpenF1 API" })).toHaveAttribute(
      "href",
      "https://openf1.org/",
    );
    expect(screen.getByRole("link", { name: "Release notes" })).toHaveAttribute(
      "href",
      "https://github.com/vargamateistvan/f1-replay/releases",
    );
    expect(screen.getByRole("link", { name: "Security" })).toHaveAttribute(
      "href",
      "/.well-known/security.txt",
    );
  });

  it("starts the tour on the replay page", () => {
    setup("?year=2025");
    fireEvent.click(screen.getByRole("button", { name: "Take the tour" }));
    expect(useSettings.getState().isTourOpen).toBe(true);
    expect(screen.getByTestId("location")).toHaveTextContent("/?year=2025&view=tracker");
    expect(mockTrackEvent).toHaveBeenCalledWith("tour_started", { source: "home" });
  });

  it("opens help and settings", () => {
    setup();
    fireEvent.click(screen.getByRole("button", { name: "How it works" }));
    expect(useSettings.getState().isHelpOpen).toBe(true);
    fireEvent.click(screen.getByRole("button", { name: "Settings" }));
    expect(useSettings.getState().isOpen).toBe(true);
  });
});
