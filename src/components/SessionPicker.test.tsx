import { beforeEach, describe, expect, it, vi } from "vitest";
import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import { SessionPicker } from "@/components/SessionPicker";

const state = vi.hoisted(() => ({
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
}));

vi.mock("@/hooks/useSession", () => ({
  useMeetings: () => state.meetings,
  useSessions: () => state.sessions,
}));

vi.mock("@/api/client", () => ({
  isAuthError: (error: { status?: number; __auth?: boolean } | null) =>
    Boolean(
      error &&
        (error.__auth === true || error.status === 401 || error.status === 403),
    ),
}));

vi.mock("@/utils/live", () => ({
  isSessionLive: () => state.live,
}));

describe("SessionPicker", () => {
  beforeEach(() => {
    state.meetings = {
      data: [],
      isPending: false,
      isError: false,
      error: null,
    };
    state.sessions = {
      data: [],
      isPending: false,
      isError: false,
      error: null,
    };
    state.live = false;
  });

  it("covers latest-event flow, auth banner, and live badge", async () => {
    state.meetings = {
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
      isError: false,
      error: { status: 401 },
    } as typeof state.meetings;
    state.sessions = {
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
    } as typeof state.sessions;
    state.live = true;

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

  it("covers loading and error states", () => {
    state.meetings = {
      data: [],
      isPending: false,
      isError: true,
      error: null,
    } as typeof state.meetings;
    state.sessions = {
      data: [],
      isPending: true,
      isError: false,
      error: null,
    } as typeof state.sessions;

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
});
