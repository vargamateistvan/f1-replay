import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { fireEvent, render, screen } from "@testing-library/react";
import { MemoryRouter } from "react-router-dom";
import Schedule from "./Schedule";
import type { Meeting, Session } from "@/api/types";

const mockUseMeetings = vi.fn();
const mockUseSeasonSessions = vi.fn();
const mockUseSessionResult = vi.fn();
const mockUseDrivers = vi.fn();
vi.mock("@/hooks/useSession", () => ({
  useMeetings: (...args: unknown[]) => mockUseMeetings(...args),
  useSeasonSessions: (...args: unknown[]) => mockUseSeasonSessions(...args),
  useSessionResult: (...args: unknown[]) => mockUseSessionResult(...args),
  useDrivers: (...args: unknown[]) => mockUseDrivers(...args),
}));

const HOUR = 3_600_000;
const DAY = 24 * HOUR;
const NOW = Date.UTC(2026, 3, 10, 12);
const iso = (ms: number) => new Date(ms).toISOString();

const meeting = (key: number, name: string, startMs: number): Meeting =>
  ({
    meeting_key: key,
    meeting_name: name,
    meeting_official_name: name,
    circuit_short_name: name.split(" ")[0],
    location: "Somewhere",
    country_flag: "",
    date_start: iso(startMs),
    date_end: iso(startMs + 2 * DAY),
    gmt_offset: "03:00:00",
    is_cancelled: false,
    year: 2026,
  }) as Meeting;

const session = (key: number, meetingKey: number, name: string, startMs: number): Session =>
  ({
    session_key: key,
    meeting_key: meetingKey,
    session_name: name,
    session_type: name === "Race" ? "Race" : "Practice",
    date_start: iso(startMs),
    date_end: iso(startMs + HOUR),
    gmt_offset: "03:00:00",
    is_cancelled: false,
    year: 2026,
  }) as Session;

function setup() {
  mockUseMeetings.mockReturnValue({
    data: [
      meeting(2, "Japanese Grand Prix", NOW + 5 * DAY),
      meeting(1, "Bahrain Grand Prix", NOW - 7 * DAY),
    ],
    isPending: false,
    isError: false,
  });
  mockUseSeasonSessions.mockReturnValue({
    data: [
      session(10, 1, "Race", NOW - 5 * DAY),
      session(20, 2, "Practice 1", NOW + 5 * DAY),
    ],
    isPending: false,
  });
  return render(
    <MemoryRouter initialEntries={["/schedule?year=2026"]}>
      <Schedule />
    </MemoryRouter>,
  );
}

describe("Schedule page", () => {
  beforeEach(() => {
    vi.useFakeTimers({ toFake: ["Date"] });
    vi.setSystemTime(NOW);
  });
  afterEach(() => vi.useRealTimers());

  it("lists rounds in order with progress and the next round highlighted", () => {
    const { container } = setup();
    expect(screen.getByText("1/2 rounds completed")).toBeTruthy();
    const titles = screen.getAllByRole("heading", { level: 2 }).map((h) => h.textContent);
    expect(titles).toEqual(["Bahrain Grand Prix", "Japanese Grand Prix"]);
    const next = container.querySelector("[data-next-round]");
    expect(next?.textContent).toContain("Japanese Grand Prix");
    expect(next?.textContent).toContain("Practice 1 in 5d 0h");
  });

  it("links completed sessions to the replay and leaves upcoming ones plain", () => {
    setup();
    const link = screen.getByRole("link", { name: "Replay Race" });
    expect(link.getAttribute("href")).toBe(
      "/?year=2026&meeting=1&session=10&view=tracker",
    );
    expect(screen.queryByRole("link", { name: "Replay Practice 1" })).toBeNull();
  });

  it("shows a completed session's result in a dialog", () => {
    mockUseSessionResult.mockReturnValue({
      data: [
        {
          position: 1,
          driver_number: 1,
          number_of_laps: 57,
          points: 25,
          dnf: false,
          dns: false,
          dsq: false,
          duration: 5400.5,
          gap_to_leader: 0,
          meeting_key: 1,
          session_key: 10,
        },
      ],
      isPending: false,
      isError: false,
    });
    mockUseDrivers.mockReturnValue({
      data: [{ driver_number: 1, name_acronym: "VER", full_name: "Max Verstappen" }],
      isPending: false,
    });
    setup();
    // Upcoming sessions have no result yet.
    expect(screen.queryByRole("button", { name: "Practice 1 result" })).toBeNull();

    fireEvent.click(screen.getByRole("button", { name: "Race result" }));
    expect(mockUseSessionResult).toHaveBeenCalledWith(10);
    const dialog = screen.getByRole("dialog", { name: "Race" });
    expect(dialog.textContent).toContain("Bahrain Grand Prix");
    expect(dialog.textContent).toContain("VER");
    for (const link of screen.getAllByRole("link", {
      name: "Max Verstappen driver profile",
    })) {
      expect(link).toHaveAttribute(
        "href", "/standings/driver/1?year=2026&session=10",
      );
    }
    expect(
      screen.getByRole("link", { name: "Replay session" }).getAttribute("href"),
    ).toBe("/?year=2026&meeting=1&session=10&view=tracker");

    fireEvent.click(screen.getByRole("button", { name: "Close results dialog" }));
    expect(screen.queryByRole("dialog")).toBeNull();
  });

  it("opens on the latest finished weekend rather than the next one", () => {
    const scrollIntoView = vi.fn();
    Element.prototype.scrollIntoView = scrollIntoView;
    try {
      setup();
      expect(scrollIntoView).toHaveBeenCalledTimes(1);
      const card = scrollIntoView.mock.contexts[0] as HTMLElement;
      expect(card.getAttribute("data-meeting-key")).toBe("1");
      expect(scrollIntoView).toHaveBeenCalledWith({ block: "start" });
    } finally {
      delete (Element.prototype as Partial<Element>).scrollIntoView;
    }
  });

  it("switches between your time and track time", () => {
    setup();
    const local = screen.getByRole("radio", { name: "Your time" });
    expect(local.getAttribute("aria-checked")).toBe("true");
    fireEvent.click(screen.getByRole("radio", { name: "Track time" }));
    expect(
      screen.getByRole("radio", { name: "Track time" }).getAttribute("aria-checked"),
    ).toBe("true");
  });
});
