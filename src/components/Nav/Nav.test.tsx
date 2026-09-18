import { beforeEach, describe, expect, it, vi } from "vitest";
import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import type { ReactNode } from "react";
import { Nav } from "@/components/Nav";

const resetTimeline = vi.hoisted(() => vi.fn());

const state = vi.hoisted(() => ({
  searchParams: new URLSearchParams(
    "year=2025&meeting=22&session=202&view=tracker",
  ),
  setSearchParams: vi.fn(),
  navigate: vi.fn(),
  pathname: "/",
  year: 2025,
  meetingKey: 22 as number | null,
  sessionKey: 202 as number | null,
  view: "tracker",
  setSessionKey: vi.fn(),
  meetings: {
    data: [] as Record<string, unknown>[],
    isPending: false,
    isError: false,
    error: null as { status?: number } | null,
  },
  sessions: {
    data: [] as Record<string, unknown>[],
    isPending: false,
    isError: false,
    error: null as { status?: number } | null,
  },
  latestMeeting: null as Record<string, unknown> | null,
  latestSession: null as Record<string, unknown> | null,
  // Sessions returned by the query client per meeting key; falls back to
  // `sessions.data` when a meeting has no entry.
  sessionsByMeeting: {} as Record<number, unknown[]>,
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

vi.mock("@/timeline/clock", () => ({
  useTimeline: {
    getState: () => ({ reset: resetTimeline }),
  },
}));

vi.mock("@tanstack/react-query", () => ({
  useQueryClient: () => ({
    fetchQuery: async ({ queryKey }: { queryKey: readonly unknown[] }) => {
      const [root, arg] = queryKey;
      if (root === "latestMeeting")
        return state.latestMeeting ? [state.latestMeeting] : [];
      if (root === "latestSession")
        return state.latestSession ? [state.latestSession] : [];
      if (root === "meetings") return state.meetings.data;
      if (root === "sessions")
        return state.sessionsByMeeting[arg as number] ?? state.sessions.data;
      throw new Error(`unexpected query ${String(root)}`);
    },
  }),
}));

vi.mock("@/hooks/useSession", () => ({
  useMeetings: () => state.meetings,
  useSessions: () => ({
    ...state.sessions,
    refetch: async () => ({ data: state.sessions.data }),
  }),
  useLatestMeeting: () => ({
    data: state.latestMeeting,
    isPending: false,
    isError: false,
    error: null,
    refetch: async () => ({ data: state.latestMeeting }),
  }),
  useLatestSession: () => ({
    data: state.latestSession,
    isPending: false,
    isError: false,
    error: null,
    refetch: async () => ({ data: state.latestSession }),
  }),
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
  useSettings: (
    selector: ((s: Record<string, unknown>) => unknown) | undefined,
  ) => {
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
    state.searchParams = new URLSearchParams(
      "year=2025&meeting=22&session=202&view=tracker&t=123",
    );
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
    resetTimeline.mockReset();
    state.live = true;
    state.sessionsByMeeting = {};
    state.showNextRaceWeekendBanner = false;
    state.latestMeeting = {
      year: 2025,
      meeting_key: 22,
      meeting_name: "Australian Grand Prix",
      meeting_official_name: "FORMULA 1 AUSTRALIAN GRAND PRIX 2025",
      date_start: "2025-03-15T00:00:00.000Z",
      date_end: "2025-03-17T00:00:00.000Z",
      is_cancelled: false,
    };
    state.latestSession = {
      year: 2025,
      meeting_key: 22,
      session_key: 202,
      date_start: "2025-03-16T04:00:00.000Z",
    };
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
      error: null,
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
    state.meetings.isError = true;
    state.meetings.error = { status: 401 };
    render(<Nav />);

    expect(screen.getByText(/OpenF1 returned/)).toBeInTheDocument();
    expect(screen.getAllByText("Live").length).toBeGreaterThan(0);

    fireEvent.click(screen.getByRole("button", { name: "Latest" }));
    await waitFor(() => expect(state.setSearchParams).toHaveBeenCalled());
    const [updater] = state.setSearchParams.mock.calls[0] as [
      (params: URLSearchParams) => URLSearchParams,
    ];
    await waitFor(() => {
      const next = updater(state.searchParams);
      expect(next.get("year")).toBe("2025");
      expect(next.get("meeting")).toBe("22");
      expect(next.get("session")).toBe("202");
      expect(next.has("t")).toBe(false);
    });

    fireEvent.click(screen.getByRole("button", { name: "Settings" }));
    expect(state.openModal).toHaveBeenCalled();

    fireEvent.click(screen.getByRole("button", { name: "How it works" }));
    expect(state.openHelp).toHaveBeenCalled();
  });

  it("auto-selects the latest event and session on a cold load with no URL selection", async () => {
    state.searchParams = new URLSearchParams("");
    state.meetingKey = null;
    state.sessionKey = null;
    // Nothing resolved yet in the hooks — the bootstrap must not depend on them.
    state.meetings = { ...state.meetings, isPending: true };
    state.sessions = { ...state.sessions, isPending: true };

    render(<Nav />);

    await waitFor(() => expect(state.setSearchParams).toHaveBeenCalled());
    const [updater] = state.setSearchParams.mock.calls[0] as [
      (params: URLSearchParams) => URLSearchParams,
    ];
    const next = updater(state.searchParams);
    expect(next.get("year")).toBe("2025");
    expect(next.get("meeting")).toBe("22");
    expect(next.get("session")).toBe("202");
  });

  it("does not auto-select when the URL already names a meeting or session", async () => {
    render(<Nav />);
    await new Promise((r) => setTimeout(r, 0));
    expect(state.setSearchParams).not.toHaveBeenCalled();
  });

  it("Latest ignores stale aliases and picks the most recently started meeting from the calendar", async () => {
    state.live = false;
    // Aliases still point at round 1 …
    state.latestMeeting = { ...state.latestMeeting, meeting_key: 22 };
    state.latestSession = { ...state.latestSession, meeting_key: 22 };
    // … but the calendar shows a later round has already happened.
    state.meetings.data = [
      ...state.meetings.data,
      {
        ...state.meetings.data[0],
        meeting_key: 30,
        meeting_name: "Miami Grand Prix",
        meeting_official_name: "FORMULA 1 MIAMI GRAND PRIX 2025",
        location: "Miami Gardens",
        date_start: "2025-05-02T00:00:00.000Z",
        date_end: "2025-05-04T23:00:00.000Z",
      },
      {
        ...state.meetings.data[0],
        meeting_key: 40,
        meeting_name: "Future Grand Prix",
        meeting_official_name: "FORMULA 1 FUTURE GRAND PRIX 2999",
        date_start: "2999-01-01T00:00:00.000Z",
        date_end: "2999-01-03T00:00:00.000Z",
      },
    ];
    state.sessionsByMeeting[30] = [
      {
        session_key: 301,
        session_name: "Practice 1",
        date_start: "2025-05-02T16:30:00.000Z",
        date_end: "2025-05-02T17:30:00.000Z",
      },
      {
        session_key: 305,
        session_name: "Race",
        date_start: "2025-05-04T20:00:00.000Z",
        date_end: "2025-05-04T22:00:00.000Z",
      },
      {
        session_key: 309,
        session_name: "Not yet",
        date_start: "2999-05-04T20:00:00.000Z",
        date_end: "2999-05-04T22:00:00.000Z",
      },
    ];

    render(<Nav />);
    fireEvent.click(screen.getByRole("button", { name: "Latest" }));

    await waitFor(() => expect(state.setSearchParams).toHaveBeenCalled());
    const [updater] = state.setSearchParams.mock.calls[0] as [
      (params: URLSearchParams) => URLSearchParams,
    ];
    const next = updater(state.searchParams);
    expect(next.get("meeting")).toBe("30");
    expect(next.get("session")).toBe("305");
    expect(next.has("t")).toBe(false);
    expect(resetTimeline).toHaveBeenCalled();
  });

  it("Latest uses the session alias when it is newer than the meeting alias", async () => {
    state.live = false;
    // Meeting alias lags one round behind; the session alias is current and
    // its meeting is not in the (stale) calendar list.
    state.latestSession = {
      year: 2025,
      meeting_key: 31,
      session_key: 315,
      date_start: "2025-05-18T13:00:00.000Z",
      date_end: "2025-05-18T15:00:00.000Z",
    };
    state.sessionsByMeeting[31] = [
      {
        session_key: 311,
        session_name: "Practice 1",
        date_start: "2025-05-16T11:30:00.000Z",
        date_end: "2025-05-16T12:30:00.000Z",
      },
      {
        session_key: 315,
        session_name: "Race",
        date_start: "2025-05-18T13:00:00.000Z",
        date_end: "2025-05-18T15:00:00.000Z",
      },
    ];

    render(<Nav />);
    fireEvent.click(screen.getByRole("button", { name: "Latest" }));

    await waitFor(() => expect(state.setSearchParams).toHaveBeenCalled());
    const [updater] = state.setSearchParams.mock.calls[0] as [
      (params: URLSearchParams) => URLSearchParams,
    ];
    const next = updater(state.searchParams);
    expect(next.get("meeting")).toBe("31");
    expect(next.get("session")).toBe("315");
  });

  it("clears the replay time when selecting a different session", () => {
    render(<Nav />);

    fireEvent.change(screen.getByLabelText("Session"), {
      target: { value: "101" },
    });

    expect(resetTimeline).toHaveBeenCalledTimes(1);
    expect(state.setSearchParams).toHaveBeenCalledTimes(1);
    const [updater] = state.setSearchParams.mock.calls[0] as [
      (prev: URLSearchParams) => URLSearchParams,
      { replace: boolean },
    ];
    const next = updater(state.searchParams);

    expect(next.get("session")).toBe("101");
    expect(next.has("t")).toBe(false);
  });
});
