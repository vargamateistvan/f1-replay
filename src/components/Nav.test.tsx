import { beforeEach, describe, expect, it, vi } from "vitest";
import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import type { ReactNode } from "react";
import { Nav } from "@/components/Nav";

const state = vi.hoisted(() => ({
  searchParams: new URLSearchParams("year=2025&meeting=22&session=202&view=tracker"),
  setSearchParams: vi.fn(),
  navigate: vi.fn(),
  pathname: "/",
  year: 2025,
  meetingKey: 22,
  sessionKey: 202,
  view: "tracker",
  setSessionKey: vi.fn(),
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
  openModal: vi.fn(),
  openHelp: vi.fn(),
  setSetting: vi.fn(),
  showNextRaceWeekendBanner: false,
}));

vi.mock("react-router-dom", () => ({
  NavLink: ({ children }: { children: ReactNode }) => <a>{children}</a>,
  useSearchParams: () => [state.searchParams, state.setSearchParams],
  useLocation: () => ({ pathname: state.pathname }),
  useNavigate: () => state.navigate,
}));

vi.mock("@/hooks/useSession", () => ({
  useMeetings: () => state.meetings,
  useSessions: () => state.sessions,
}));

vi.mock("@/api/client", () => ({
  isAuthError: (error: { status?: number } | null) =>
    Boolean(error && (error.status === 401 || error.status === 403)),
}));

vi.mock("@/utils/live", () => ({
  isSessionLive: () => state.live,
}));

vi.mock("@/hooks/useSearchParamState", () => ({
  useNumberParam: (name: string) => {
    if (name === "year") return [state.year, vi.fn()];
    if (name === "meeting") return [state.meetingKey, vi.fn()];
    return [state.sessionKey, state.setSessionKey];
  },
  useStringParam: () => [state.view, vi.fn()],
}));

vi.mock("@/stores/settings", () => ({
  useSettings: (selector: ((s: Record<string, unknown>) => unknown) | undefined) => {
    const store = {
      openModal: state.openModal,
      openHelp: state.openHelp,
      setSetting: state.setSetting,
      showNextRaceWeekendBanner: state.showNextRaceWeekendBanner,
    };
    return selector ? selector(store) : store;
  },
}));

vi.mock("@/api/circuitFactsLookup", () => ({
  fetchCircuitFactsFromApi: vi.fn(),
}));

describe("Nav", () => {
  beforeEach(() => {
    state.searchParams = new URLSearchParams("year=2025&meeting=22&session=202&view=tracker");
    state.setSearchParams.mockReset();
    state.navigate.mockReset();
    state.setSessionKey.mockReset();
    state.openModal.mockReset();
    state.openHelp.mockReset();
    state.setSetting.mockReset();
    state.pathname = "/";
    state.year = 2025;
    state.meetingKey = 22;
    state.sessionKey = 202;
    state.view = "tracker";
    state.live = true;
    state.showNextRaceWeekendBanner = false;
    state.meetings = {
      data: [
        {
          year: 2025,
          meeting_key: 22,
          meeting_name: "Australian Grand Prix",
          meeting_official_name: "FORMULA 1 AUSTRALIAN GRAND PRIX 2025",
          location: "Melbourne",
          date_start: "2025-03-15T00:00:00.000Z",
          date_end: "2025-03-17T00:00:00.000Z",
          circuit_type: "Temporary - Street",
          circuit_short_name: "Albert Park",
          country_name: "Australia",
          country_flag: "https://example.com/aus.png",
          circuit_image: "https://example.com/albert.png",
          is_cancelled: false,
          gmt_offset: "+10:00",
        },
      ],
      isPending: false,
      isError: false,
      error: { status: 401 },
    } as typeof state.meetings;
    state.sessions = {
      data: [
        {
          session_key: 101,
          session_name: "Practice 1",
          date_start: "2025-03-14T01:00:00.000Z",
          date_end: "2025-03-14T02:00:00.000Z",
          gmt_offset: "+10:00",
        },
        {
          session_key: 202,
          session_name: "Race",
          date_start: "2025-03-16T04:00:00.000Z",
          date_end: "2025-03-16T06:00:00.000Z",
          gmt_offset: "+10:00",
        },
      ],
      isPending: false,
      isError: false,
      error: null,
    } as typeof state.sessions;
  });

  it("renders auth/live banner and handles latest/settings/help actions", async () => {
    render(<Nav />);

    expect(screen.getByText(/OpenF1 returned/)).toBeInTheDocument();
    expect(screen.getAllByText("Live").length).toBeGreaterThan(0);

    fireEvent.click(screen.getByRole("button", { name: "Latest" }));
    expect(state.setSearchParams).toHaveBeenCalled();

    await waitFor(() => {
      expect(state.setSearchParams.mock.calls.length).toBeGreaterThan(1);
    });

    fireEvent.click(screen.getByRole("button", { name: "Settings" }));
    expect(state.openModal).toHaveBeenCalled();

    fireEvent.click(screen.getByRole("button", { name: "How it works" }));
    expect(state.openHelp).toHaveBeenCalled();
  });
});
