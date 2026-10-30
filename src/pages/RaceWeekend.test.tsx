import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { act, fireEvent, render, screen, waitFor } from "@testing-library/react";
import { MemoryRouter } from "react-router-dom";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { api } from "@/api/endpoints";
import { OpenF1Error } from "@/api/client";
import type { Driver, Lap, Location, Session } from "@/api/types";
import { TOUR_VERSION } from "@/constants";
import * as motion from "@/lib/motion";
import { useSettings } from "@/stores/settings";
import { useTimeline } from "@/timeline/clock";
import { startLightsWindow } from "@/timeline/startLights";
import { locationChunkIndexFor } from "@/hooks/useLocationChunks";
import { lapsQueryKey } from "@/hooks/queryKeys";
import * as media from "@/hooks/useMediaQuery";
import RaceWeekend from "./RaceWeekend";

vi.mock("@/components/TrackMap/TrackMap", () => ({
  TrackMap: () => <div>Track preview</div>,
}));
vi.mock("@/components/LiveTiming/LiveTiming", () => ({
  default: () => <div>Timing panel</div>,
}));
vi.mock("@/components/TrackMap3D/availability", () => ({
  isMap3dAvailable: () => false,
}));
vi.mock("@/components/AppTour/AppTour", () => ({
  AppTour: () => <div>Optional guided tour</div>,
}));

const session: Session = {
  session_key: 123, meeting_key: 456, session_name: "Race", session_type: "Race",
  date_start: "2024-01-01T12:00:00Z", date_end: "2024-01-01T14:00:00Z",
  circuit_key: 63, circuit_short_name: "Sakhir", country_key: 1,
  country_code: "BRN", country_name: "Bahrain", location: "Sakhir",
  gmt_offset: "+03:00", year: 2024, is_cancelled: false,
};

describe("progressive replay startup", () => {
  let client: QueryClient;

  beforeEach(() => {
    client = new QueryClient({ defaultOptions: { queries: { retry: false } } });
    client.setQueryData(["sessions", 456], [session]);
    useTimeline.getState().reset();
    useSettings.setState({
      tourSeenVersion: TOUR_VERSION, isTourOpen: false, isOpen: false,
      replayWelcomeSeen: false,
      isHelpOpen: false, mapViewMode: "2d", trackerTimingTelemetry: false,
      trackerTimingMobileCarData: false, leaderboardTelemetry: false,
    });
    vi.spyOn(motion, "motionEnabled").mockReturnValue(false);
    vi.spyOn(api, "sessions").mockResolvedValue([session]);
    vi.spyOn(api, "drivers").mockResolvedValue([]);
    vi.spyOn(api, "positions").mockResolvedValue([]);
    vi.spyOn(api, "intervals").mockResolvedValue([]);
    vi.spyOn(api, "laps").mockResolvedValue([]);
    vi.spyOn(api, "raceControl").mockResolvedValue([]);
    vi.spyOn(api, "locationWindow").mockResolvedValue([]);
    vi.spyOn(api, "stints").mockResolvedValue([]);
    vi.spyOn(api, "pits").mockResolvedValue([]);
    vi.spyOn(api, "startingGrid").mockResolvedValue([]);
    vi.spyOn(api, "sessionResult").mockResolvedValue([]);
    vi.spyOn(api, "overtakes").mockResolvedValue([]);
    vi.spyOn(api, "teamRadio").mockResolvedValue([]);
    vi.spyOn(api, "weather").mockResolvedValue([]);
  });

  afterEach(() => {
    client.clear();
    vi.restoreAllMocks();
  });

  function renderReplay(entry = "/?year=2024&meeting=456&session=123") {
    window.history.replaceState(null, "", entry);
    return render(
      <QueryClientProvider client={client}>
        <MemoryRouter
          initialEntries={[entry]}
          future={{ v7_startTransition: true, v7_relativeSplatPath: true }}
        >
          <RaceWeekend />
        </MemoryRouter>
      </QueryClientProvider>,
    );
  }

  const firstLapStartMs = 300_000;
  const gps: Location = {
    date: session.date_start, session_key: 123, meeting_key: 456,
    driver_number: 44, x: 100, y: 200, z: 0,
  };

  function readyForWelcome() {
    useSettings.setState({ tourSeenVersion: 0 });
    const driver: Driver = {
      driver_number: 44, broadcast_name: "L HAMILTON", full_name: "Lewis Hamilton",
      first_name: "Lewis", last_name: "Hamilton", name_acronym: "HAM",
      team_name: "Mercedes", team_colour: "27F4D2", headshot_url: null,
      country_code: null, session_key: 123, meeting_key: 456,
    };
    const lap: Lap = {
      date_start: new Date(Date.parse(session.date_start) + firstLapStartMs).toISOString(),
      driver_number: 44, lap_number: 1, session_key: 123, meeting_key: 456,
      lap_duration: 90, duration_sector_1: 30, duration_sector_2: 30,
      duration_sector_3: 30, is_pit_out_lap: false, i1_speed: null,
      i2_speed: null, st_speed: null, segments_sector_1: null,
      segments_sector_2: null, segments_sector_3: null,
    };
    client.setQueryData(["drivers", 123], [driver]);
    client.setQueryData(["positions", 123], [{
      date: session.date_start, driver_number: 44, position: 1,
      session_key: 123, meeting_key: 456,
    }]);
    client.setQueryData(lapsQueryKey(123), [lap]);
    client.setQueryData(["location-chunk", 123, 0], [gps]);
    vi.mocked(api.locationWindow).mockResolvedValue([gps]);
  }

  it("offers a race-start action instead of opening the tour, and waits for destination GPS", async () => {
    readyForWelcome();
    let resolveGps!: (rows: Location[]) => void;
    vi.mocked(api.locationWindow).mockImplementation(() =>
      new Promise<Location[]>((resolve) => { resolveGps = resolve; }));
    const { unmount } = renderReplay();
    const play = await screen.findByRole("button", { name: "Watch the race start" });
    expect(useSettings.getState().isTourOpen).toBe(false);
    expect(useTimeline.getState().playing).toBe(false);
    fireEvent.click(play);
    expect(screen.getByRole("button", { name: "Preparing replay..." })).toBeDisabled();
    expect(useTimeline.getState().playing).toBe(false);
    await act(async () => resolveGps([gps]));
    await waitFor(() => expect(useTimeline.getState().playing).toBe(true));
    const target = Math.max(0, startLightsWindow(firstLapStartMs).startMs);
    expect(useTimeline.getState().t).toBe(target);
    expect(useTimeline.getState().speed).toBe(1);
    expect(client.getQueryData(["location-chunk", 123, locationChunkIndexFor(target)]))
      .toEqual([gps]);
    expect(screen.queryByRole("dialog")).not.toBeInTheDocument();
    unmount();
  });

  it.each(["empty", "error"])("does not start a broken preview when GPS returns %s", async (failure) => {
    readyForWelcome();
    if (failure === "empty") vi.mocked(api.locationWindow).mockResolvedValue([]);
    else vi.mocked(api.locationWindow).mockRejectedValue(new Error("GPS unavailable"));
    const { unmount } = renderReplay();
    fireEvent.click(await screen.findByRole("button", { name: "Watch the race start" }));
    await waitFor(() => expect(screen.getByRole("dialog"))
      .toHaveTextContent(failure === "empty" ? "Track data is unavailable" : "Could not load the replay"));
    expect(useTimeline.getState().playing).toBe(false);
    expect(screen.getByRole("button", { name: "Watch the race start" })).toBeEnabled();
    vi.mocked(api.locationWindow).mockResolvedValue([gps]);
    fireEvent.click(screen.getByRole("button", { name: "Watch the race start" }));
    await waitFor(() => expect(useTimeline.getState().playing).toBe(true));
    unmount();
  });

  it("keeps dismissal persistent without starting playback or a tour", async () => {
    readyForWelcome();
    const first = renderReplay();
    fireEvent.click(await screen.findByRole("button", { name: "Dismiss replay introduction" }));
    expect(useSettings.getState().replayWelcomeSeen).toBe(true);
    expect(useSettings.getState().isTourOpen).toBe(false);
    expect(useTimeline.getState().playing).toBe(false);
    first.unmount();
    const second = renderReplay();
    await screen.findAllByText("Track preview");
    expect(screen.queryByRole("dialog")).not.toBeInTheDocument();
    second.unmount();
  });

  it("uses a labelled modal with trapped focus and Escape dismissal", async () => {
    readyForWelcome();
    const { unmount } = renderReplay();
    const dialog = await screen.findByRole("dialog", { name: "Go straight to lights out" });
    expect(dialog).toHaveAttribute("aria-modal", "true");
    expect(dialog).toHaveAccessibleDescription(
      "Follow every car on the track map. Pause, scrub or pick a driver as you watch.",
    );
    expect(dialog).toHaveFocus();
    fireEvent.keyDown(dialog, { key: "Tab" });
    expect(screen.getByRole("button", { name: "Dismiss replay introduction" })).toHaveFocus();
    fireEvent.keyDown(document.activeElement!, { key: "Tab", shiftKey: true });
    expect(screen.getByRole("button", { name: "Take a tour" })).toHaveFocus();
    fireEvent.keyDown(document.activeElement!, { key: "Escape" });
    expect(screen.queryByRole("dialog")).not.toBeInTheDocument();
    expect(document.body.style.overflow).not.toBe("hidden");
    expect(useTimeline.getState().playing).toBe(false);
    unmount();
  });

  it("dismisses the welcome dialog when its backdrop is clicked", async () => {
    readyForWelcome();
    const { unmount } = renderReplay();
    const dialog = await screen.findByRole("dialog");
    fireEvent.click(dialog.parentElement!);
    expect(screen.queryByRole("dialog")).not.toBeInTheDocument();
    expect(useSettings.getState().replayWelcomeSeen).toBe(true);
    unmount();
  });

  it("switches phones from timing to the visible track map when starting the preview", async () => {
    readyForWelcome();
    vi.spyOn(media, "useMediaQuery").mockReturnValue(true);
    const { unmount } = renderReplay();
    fireEvent.click(await screen.findByRole("button", { name: "Watch the race start" }));
    await waitFor(() => expect(useTimeline.getState().playing).toBe(true));
    expect(new URLSearchParams(window.location.search).get("ttab")).toBe("map");
    expect(new URLSearchParams(window.location.search).get("t"))
      .toBe(String(Math.round(startLightsWindow(firstLapStartMs).startMs / 1000)));
    expect(new URLSearchParams(window.location.search).has("speed")).toBe(false);
    expect(screen.getAllByText("Track preview")).not.toHaveLength(0);
    unmount();
  });

  it("can dismiss a preview while its GPS request is still pending", async () => {
    readyForWelcome();
    let resolveGps!: (rows: Location[]) => void;
    vi.mocked(api.locationWindow).mockImplementation(() =>
      new Promise<Location[]>((resolve) => { resolveGps = resolve; }));
    const { unmount } = renderReplay();
    fireEvent.click(await screen.findByRole("button", { name: "Watch the race start" }));
    fireEvent.click(screen.getByRole("button", { name: "Dismiss replay introduction" }));
    await act(async () => resolveGps([gps]));
    expect(useTimeline.getState().playing).toBe(false);
    expect(useTimeline.getState().t).toBe(0);
    expect(screen.queryByRole("dialog")).not.toBeInTheDocument();
    unmount();
  });

  it("opens the tour only from the secondary action", async () => {
    readyForWelcome();
    const { unmount } = renderReplay();
    fireEvent.click(await screen.findByRole("button", { name: "Take a tour" }));
    expect(useSettings.getState().isTourOpen).toBe(true);
    expect(await screen.findByText("Optional guided tour")).toBeInTheDocument();
    expect(useTimeline.getState().playing).toBe(false);
    unmount();
  });

  it("does not offer an introduction over a live session", async () => {
    readyForWelcome();
    client.setQueryData(["sessions", 456], [{
      ...session,
      date_start: new Date(Date.now() - 60_000).toISOString(),
      date_end: new Date(Date.now() + 60_000).toISOString(),
    }]);
    const { unmount } = renderReplay();
    await screen.findAllByText("Track preview");
    expect(screen.queryByRole("dialog")).not.toBeInTheDocument();
    expect(useSettings.getState().isTourOpen).toBe(false);
    unmount();
  });

  it("does not start a pending preview after leaving the replay page", async () => {
    readyForWelcome();
    let resolveGps!: (rows: Location[]) => void;
    vi.mocked(api.locationWindow).mockImplementation(() =>
      new Promise<Location[]>((resolve) => { resolveGps = resolve; }));
    const { unmount } = renderReplay();
    fireEvent.click(await screen.findByRole("button", { name: "Watch the race start" }));
    unmount();
    await act(async () => resolveGps([gps]));
    expect(useTimeline.getState().playing).toBe(false);
  });

  it("leaves a shared moment paused without a welcome prompt", async () => {
    readyForWelcome();
    const { unmount } = renderReplay("/?year=2024&meeting=456&session=123&t=10");
    await screen.findAllByText("Track preview");
    expect(screen.queryByRole("dialog")).not.toBeInTheDocument();
    expect(useTimeline.getState().t).toBe(10_000);
    expect(useTimeline.getState().playing).toBe(false);
    expect(useSettings.getState().isTourOpen).toBe(false);
    unmount();
  });

  it("offers ordinary playback for a non-race session", async () => {
    readyForWelcome();
    client.setQueryData(["sessions", 456], [{
      ...session, session_type: "Practice", session_name: "Practice 1",
    }]);
    const { unmount } = renderReplay();
    fireEvent.click(await screen.findByRole("button", { name: "Play replay" }));
    await waitFor(() => expect(useTimeline.getState().playing).toBe(true));
    expect(useTimeline.getState().t).toBe(0);
    unmount();
  });

  it("shows panels without an overlay and keeps playback usable while radio waits", async () => {
    let resolveDrivers!: (rows: Driver[]) => void;
    vi.mocked(api.drivers).mockImplementation(() =>
      new Promise<Driver[]>((resolve) => { resolveDrivers = resolve; }));
    vi.mocked(api.teamRadio).mockImplementation(() => new Promise(() => {}));
    const { unmount } = renderReplay();
    expect(await screen.findAllByText("Track preview")).not.toHaveLength(0);
    expect(screen.getByRole("status")).not.toHaveClass("absolute", "inset-0");
    expect(api.teamRadio).not.toHaveBeenCalled();
    await act(async () => resolveDrivers([]));
    await waitFor(() => expect(api.teamRadio).toHaveBeenCalled());
    await waitFor(() => expect(screen.queryByText("Loading replay")).not.toBeInTheDocument());
    fireEvent.click(screen.getByRole("button", { name: "Play" }));
    expect(useTimeline.getState().playing).toBe(true);
    expect(screen.getAllByText("Track preview")).not.toHaveLength(0);
    unmount();
  });

  it("releases secondary feeds after an essential failure and retries only failed requests", async () => {
    vi.mocked(api.positions).mockRejectedValueOnce(new Error("Timing unavailable"));
    const { unmount } = renderReplay();
    const retry = await screen.findByRole("button", { name: "Retry failed requests" });
    await waitFor(() => expect(api.teamRadio).toHaveBeenCalledTimes(1));
    expect(api.positions).toHaveBeenCalledTimes(1);
    fireEvent.click(retry);
    await waitFor(() => expect(api.positions).toHaveBeenCalledTimes(2));
    await waitFor(() => expect(screen.queryByRole("button", { name: "Retry failed requests" }))
      .not.toBeInTheDocument());
    expect(api.drivers).toHaveBeenCalledTimes(1);
    expect(api.teamRadio).toHaveBeenCalledTimes(1);
    unmount();
  });

  it.each([401, 403])("shows a terminal access state for %s instead of loading or broken panels", async (status) => {
    vi.mocked(api.drivers).mockRejectedValue(new OpenF1Error(status, "drivers"));
    // Other requests can still be queued when the access failure arrives.
    vi.mocked(api.positions).mockImplementation(() => new Promise(() => {}));
    useTimeline.getState().setPlaying(true);
    const { unmount } = renderReplay();
    expect(await screen.findByRole("heading", {
      name: "Session data requires OpenF1 access",
    })).toBeInTheDocument();
    expect(screen.queryByText("Loading replay")).not.toBeInTheDocument();
    expect(screen.queryByText("Timing panel")).not.toBeInTheDocument();
    expect(screen.queryByRole("button", { name: "Retry failed requests" })).not.toBeInTheDocument();
    expect(screen.queryByRole("button", { name: "Play" })).not.toBeInTheDocument();
    expect(screen.getByRole("link", { name: "Browse schedule" }))
      .toHaveAttribute("href", "/schedule?year=2024");
    expect(screen.getByText(/This session's data is currently unavailable/)).toBeInTheDocument();
    const openF1 = screen.getByRole("link", { name: "OpenF1" });
    expect(openF1).toHaveAttribute("href", "https://openf1.org/");
    expect(openF1).toHaveAttribute("target", "_blank");
    expect(openF1).toHaveAttribute("rel", "noopener noreferrer");
    expect(screen.getByText(/Enjoy F1 Replay\? Buy me a coffee/)).toBeInTheDocument();
    const supportButton = screen.getByRole("link", {
      name: "Support on Buy Me a Coffee",
    });
    expect(supportButton).toHaveAttribute("href", "https://buymeacoffee.com/matt_varga");
    expect(supportButton).toHaveAttribute("target", "_blank");
    expect(supportButton).toHaveAttribute("rel", "noopener noreferrer");
    expect(useTimeline.getState().playing).toBe(false);
    fireEvent.keyDown(window, { key: " " });
    expect(useTimeline.getState().playing).toBe(false);
    expect(api.teamRadio).not.toHaveBeenCalled();
    unmount();
  });

  it("loads a selected historical replay despite a denied calendar refresh with cached metadata", async () => {
    readyForWelcome();
    useSettings.setState({ replayWelcomeSeen: true });
    client.getQueryCache().find({ queryKey: ["sessions", 456] })!.setState({
      error: new OpenF1Error(401, "sessions"),
      status: "error",
    });
    const { unmount } = renderReplay();
    expect(await screen.findAllByText("Track preview")).not.toHaveLength(0);
    expect(screen.queryByRole("heading", {
      name: "Session data requires OpenF1 access",
    })).not.toBeInTheDocument();
    await waitFor(() => expect(api.teamRadio).toHaveBeenCalled());
    fireEvent.click(screen.getByRole("button", { name: "Play" }));
    expect(useTimeline.getState().playing).toBe(true);
    unmount();
  });
});
