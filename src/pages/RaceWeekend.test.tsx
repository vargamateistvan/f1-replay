import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { act, fireEvent, render, screen, waitFor } from "@testing-library/react";
import { MemoryRouter } from "react-router-dom";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { api } from "@/api/endpoints";
import type { Driver, Session } from "@/api/types";
import { TOUR_VERSION } from "@/constants";
import * as motion from "@/lib/motion";
import { useSettings } from "@/stores/settings";
import { useTimeline } from "@/timeline/clock";
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

  function renderReplay() {
    return render(
      <QueryClientProvider client={client}>
        <MemoryRouter
          initialEntries={["/?year=2024&meeting=456&session=123"]}
          future={{ v7_startTransition: true, v7_relativeSplatPath: true }}
        >
          <RaceWeekend />
        </MemoryRouter>
      </QueryClientProvider>,
    );
  }

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
});
