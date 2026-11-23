import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { fireEvent, render, screen, within } from "@testing-library/react";
import { MemoryRouter, useLocation } from "react-router-dom";
import Schedule from "./Schedule";
import type { Meeting, Session } from "@/api/types";
import { useSettings } from "@/stores/settings";

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

const mockTrackEvent = vi.fn();
vi.mock("@/lib/analytics", () => ({
  trackEvent: (...args: unknown[]) => mockTrackEvent(...args),
}));

const RACE_HIGHLIGHT = {
  videoId: "abc123",
  title: "Race Highlights | 2026 Bahrain Grand Prix",
  publishedAt: "2026-04-05T20:00:00Z",
};
vi.mock("@/data/sessionHighlights", async (importOriginal) => ({
  ...(await importOriginal<typeof import("@/data/sessionHighlights")>()),
  getSessionHighlight: (key: number | null | undefined) =>
    key === 10 ? RACE_HIGHLIGHT : null,
}));
vi.mock("@/lib/youtubePlayer", () => ({
  loadYouTubeApi: () => new Promise(() => {}),
}));

const HOUR = 3_600_000;
const DAY = 24 * HOUR;
const NOW = Date.UTC(2026, 3, 10, 12);
const iso = (ms: number) => new Date(ms).toISOString();

const meeting = (
  key: number,
  name: string,
  startMs: number,
  countryFlag = "",
): Meeting =>
  ({
    meeting_key: key,
    meeting_name: name,
    meeting_official_name: name,
    circuit_short_name: name.split(" ")[0],
    location: "Somewhere",
    country_flag: countryFlag,
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

function LocationSearch() {
  const { search } = useLocation();
  return <output aria-label="Current search">{search}</output>;
}

function setup(
  path = "/schedule?year=2026",
  extraSessions: Session[] = [],
  countryFlag = "",
) {
  mockUseMeetings.mockReturnValue({
    data: [
      meeting(2, "Japanese Grand Prix", NOW + 5 * DAY, countryFlag),
      meeting(1, "Bahrain Grand Prix", NOW - 7 * DAY),
    ],
    isPending: false,
    isError: false,
  });
  mockUseSeasonSessions.mockReturnValue({
    data: [
      session(10, 1, "Race", NOW - 5 * DAY),
      session(20, 2, "Practice 1", NOW + 5 * DAY),
      ...extraSessions,
    ],
    isPending: false,
  });
  return render(
    <MemoryRouter initialEntries={[path]}>
      <Schedule />
      <LocationSearch />
    </MemoryRouter>,
  );
}

describe("Schedule page", () => {
  beforeEach(() => {
    useSettings.getState().setSetting("scheduleViewMode", "cards");
    useSettings.getState().setSetting("scheduleTimeMode", "local");
    vi.useFakeTimers({ toFake: ["Date"] });
    vi.setSystemTime(NOW);
  });
  afterEach(() => vi.useRealTimers());

  it("lists rounds in order with progress and the next round highlighted", () => {
    const { container } = setup();
    expect(screen.getByRole("progressbar", { name: "Season progress" })).toHaveAttribute(
      "aria-valuetext",
      "1 of 2 rounds completed",
    );
    const titles = screen.getAllByRole("heading", { level: 2 }).map((h) => h.textContent);
    expect(titles).toEqual(["Bahrain Grand Prix", "Japanese Grand Prix"]);
    const next = container.querySelector("[data-next-round]");
    expect(next?.textContent).toContain("Japanese Grand Prix");
    expect(next?.textContent).toContain("Practice 1 in 5d 0h");
  });

  it("pins the next round above the cards with a countdown to its next session", () => {
    setup();
    const strip = screen.getByRole("region", { name: "Up next" });
    expect(strip).toHaveTextContent("Japanese Grand Prix");
    expect(strip).toHaveTextContent("Round 2");
    expect(within(strip).getByRole("timer")).toHaveAccessibleName("Practice 1 in 5d 0h");
    expect(within(strip).getByText("05")).toBeInTheDocument();
  });

  it("opens the next round on the map from the strip", async () => {
    setup();
    const strip = screen.getByRole("region", { name: "Up next" });
    fireEvent.click(within(strip).getByRole("button", { name: "Map" }));
    expect(screen.getByRole("radio", { name: "Map" })).toHaveAttribute("aria-checked", "true");
    expect(mockTrackEvent).toHaveBeenCalledWith("schedule_next_round_action", {
      action: "map",
    });
    const panel = await screen.findByRole("complementary", { name: "Selected round" });
    expect(
      within(panel).getByRole("heading", { level: 2, name: "Japanese Grand Prix" }),
    ).toBeInTheDocument();
  });

  it("opens the next round in the calendar from the strip", () => {
    setup();
    const strip = screen.getByRole("region", { name: "Up next" });
    fireEvent.click(within(strip).getByRole("button", { name: "Calendar" }));
    expect(screen.getByRole("radio", { name: "Calendar" })).toHaveAttribute(
      "aria-checked",
      "true",
    );
    expect(mockTrackEvent).toHaveBeenCalledWith("schedule_next_round_action", {
      action: "calendar",
    });
    expect(screen.getByLabelText("Current search")).toHaveTextContent(
      "layout=calendar&round=2",
    );
  });

  it("groups races by month and updates the selected round in the URL", () => {
    setup();
    fireEvent.click(screen.getByRole("radio", { name: "Calendar" }));
    const april = screen.getByRole("region", { name: "APRIL" });
    const bahrain = within(april).getByRole("button", {
      name: /Round 1 Bahrain Grand Prix/,
    });
    const japan = within(april).getByRole("button", {
      name: /Round 2 Japanese Grand Prix/,
    });
    expect(bahrain).toHaveAttribute("aria-pressed", "true");
    expect(japan).toHaveAttribute("aria-pressed", "false");

    fireEvent.click(japan);
    expect(japan).toHaveAttribute("aria-pressed", "true");
    expect(
      screen.getByRole("region", { name: "Selected round" }),
    ).toHaveTextContent("Round 2 Japanese Grand Prix");
    expect(screen.getByLabelText("Current search")).toHaveTextContent(
      "layout=calendar&round=2",
    );
  });

  it("shows a safe country flag on the calendar event tile", () => {
    setup(
      "/schedule?year=2026&layout=calendar",
      [],
      "https://flags.example/japan.svg",
    );
    const tile = screen.getByRole("button", {
      name: /Round 2 Japanese Grand Prix/,
    });
    expect(tile.querySelector("img")).toHaveAttribute(
      "src",
      "https://flags.example/japan.svg",
    );
    expect(tile.querySelector("img")).toHaveAttribute("alt", "");
    expect(tile.querySelector("img")).toHaveAttribute("referrerpolicy", "no-referrer");
  });

  it("adds a tooltip only when a calendar race weekend name is truncated", () => {
    const clientWidth = vi
      .spyOn(HTMLElement.prototype, "clientWidth", "get")
      .mockImplementation(function (this: HTMLElement) {
        return this.hasAttribute("data-calendar-name") &&
          this.textContent?.includes("Japanese")
          ? 40
          : 100;
      });
    const scrollWidth = vi
      .spyOn(HTMLElement.prototype, "scrollWidth", "get")
      .mockImplementation(function (this: HTMLElement) {
        return this.hasAttribute("data-calendar-name") &&
          this.textContent?.includes("Japanese")
          ? 100
          : 100;
      });
    try {
      setup("/schedule?year=2026&layout=calendar");
      const truncated = screen.getByRole("button", {
        name: /Round 2 Japanese Grand Prix/,
      });
      expect(within(truncated).getByRole("tooltip")).toHaveTextContent(
        "Japanese Grand Prix",
      );
      const fitting = screen.getByRole("button", {
        name: /Round 1 Bahrain Grand Prix/,
      });
      expect(within(fitting).queryByRole("tooltip")).toBeNull();
    } finally {
      clientWidth.mockRestore();
      scrollWidth.mockRestore();
    }
  });

  it("shows each selected round session with its own actions", () => {
    setup("/schedule?year=2026&layout=calendar", [
      session(11, 1, "Qualifying", NOW - 6 * DAY),
      session(12, 1, "Practice 2", NOW - 7 * DAY),
    ]);
    const selected = screen.getByRole("region", { name: "Selected round" });

    expect(within(selected).getByText("Race")).toBeInTheDocument();
    expect(within(selected).getByText("Qualifying")).toBeInTheDocument();
    expect(within(selected).getByText("Practice 2")).toBeInTheDocument();
    expect(within(selected).getAllByRole("link", { name: /Replay/ })).toHaveLength(3);
    expect(
      within(selected).getByRole("button", { name: "Qualifying result" }),
    ).toBeInTheDocument();
    expect(
      within(selected).getByRole("button", { name: "Practice 2 result" }),
    ).toBeInTheDocument();
  });

  it("shows each round's dates as a day range and month", () => {
    const { container } = setup();
    const card = container.querySelector('[data-meeting-key="2"]') as HTMLElement;
    const start = new Date(NOW + 5 * DAY);
    const end = new Date(NOW + 7 * DAY);
    const day = (d: Date) => new Intl.DateTimeFormat(undefined, { day: "2-digit" }).format(d);
    expect(card).toHaveTextContent(`${day(start)}–${day(end)}`);
    expect(card).toHaveTextContent(
      new Intl.DateTimeFormat(undefined, { month: "short" }).format(start).toUpperCase(),
    );
  });

  it("links completed sessions to the replay and leaves upcoming ones plain", () => {
    setup();
    const link = screen.getByRole("link", { name: "Replay Race" });
    expect(link.getAttribute("href")).toBe(
      "/?year=2026&meeting=1&session=10&view=tracker",
    );
    expect(screen.queryByRole("link", { name: "Replay Practice 1" })).toBeNull();
  });

  it("renders Replay and Result as matching, separately labelled actions", () => {
    setup();
    const replay = screen.getByRole("link", { name: "Replay Race" });
    const result = screen.getByRole("button", { name: "Race result" });
    expect(replay).toHaveTextContent("Replay");
    expect(result).toHaveTextContent("Result");
    expect(replay.className).toBe(result.className);
    expect(replay.parentElement).toBe(result.parentElement);
    expect(replay).not.toContainElement(result);
  });

  it("shows session names and actions inline with times on a second line", () => {
    setup();
    const row = screen.getByRole("link", { name: "Replay Race" }).parentElement
      ?.parentElement;

    expect(row).toHaveClass("grid-cols-[minmax(0,1fr)_auto]");
    expect(row).toHaveClass("sm:grid-cols-[minmax(0,1fr)_auto_auto]");
    expect(row?.children[0]).toHaveClass("col-start-1", "row-start-1");
    expect(row?.children[1]).toHaveClass("col-span-2");
    expect(row?.children[1]).toHaveClass("row-start-2");
    expect(row?.children[2]).toHaveClass("col-start-2", "row-start-1");
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

  it("opens a result link and removes only its result parameter on close", () => {
    mockUseSessionResult.mockReturnValue({ data: [], isPending: false, isError: false });
    mockUseDrivers.mockReturnValue({ data: [], isPending: false });
    setup("/schedule?year=2026&result=10&layout=cards");
    expect(screen.getByRole("dialog", { name: "Race" })).toBeInTheDocument();
    expect(mockUseSessionResult).toHaveBeenCalledWith(10);
    fireEvent.click(screen.getByRole("button", { name: "Close results dialog" }));
    expect(screen.queryByRole("dialog")).toBeNull();
    expect(screen.getByLabelText("Current search")).toHaveTextContent("?year=2026&layout=cards");
  });

  it("opens a completed session's YouTube highlights in a dialog", () => {
    setup();
    expect(screen.queryByRole("button", { name: "Practice 1 highlights" })).toBeNull();

    const button = screen.getByRole("button", { name: "Race highlights" });
    expect(button.parentElement).toBe(
      screen.getByRole("button", { name: "Race result" }).parentElement,
    );
    fireEvent.click(button);

    expect(mockTrackEvent).toHaveBeenCalledWith("schedule_highlights_opened", {
      session_key: 10,
      meeting_key: 1,
      year: 2026,
    });
    const dialog = screen.getByRole("dialog", { name: "Race" });
    expect(dialog.textContent).toContain("Bahrain Grand Prix");
    expect(
      within(dialog).getByRole("link", { name: "Open on YouTube" }),
    ).toHaveAttribute("href", "https://www.youtube.com/watch?v=abc123");

    fireEvent.keyDown(window, { key: "Escape" });
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

  it("switches to the world map layout on the latest finished round", async () => {
    setup();
    fireEvent.click(screen.getByRole("radio", { name: "Map" }));
    expect(screen.getByRole("radio", { name: "Map" })).toHaveAttribute("aria-checked", "true");
    expect(mockTrackEvent).toHaveBeenCalledWith("schedule_view_changed", {
      view: "map",
      year: 2026,
    });

    expect(await screen.findByRole("group", { name: "Season map" })).toBeInTheDocument();
    const panel = screen.getByRole("complementary", { name: "Selected round" });
    expect(
      within(panel).getByRole("heading", { level: 2, name: "Bahrain Grand Prix" }),
    ).toBeInTheDocument();
    fireEvent.click(within(panel).getByRole("button", { name: "Next round" }));
    expect(
      within(panel).getByRole("heading", { level: 2, name: "Japanese Grand Prix" }),
    ).toBeInTheDocument();
  });

  it("persists both layout choices across visits without a layout parameter", async () => {
    let page = setup();
    fireEvent.click(screen.getByRole("radio", { name: "Map" }));
    expect(JSON.parse(localStorage.getItem("f1-replay-settings")!).state.scheduleViewMode).toBe("map");
    page.unmount();
    await useSettings.persist.rehydrate();

    page = setup();
    expect(screen.getByRole("radio", { name: "Map" })).toHaveAttribute("aria-checked", "true");
    fireEvent.click(screen.getByRole("radio", { name: "Cards" }));
    expect(JSON.parse(localStorage.getItem("f1-replay-settings")!).state.scheduleViewMode).toBe("cards");
    page.unmount();
    await useSettings.persist.rehydrate();

    setup();
    expect(screen.getByRole("radio", { name: "Cards" })).toHaveAttribute("aria-checked", "true");
  });

  it("persists the calendar layout across visits", async () => {
    let page = setup();
    fireEvent.click(screen.getByRole("radio", { name: "Calendar" }));
    expect(JSON.parse(localStorage.getItem("f1-replay-settings")!).state.scheduleViewMode).toBe(
      "calendar",
    );
    page.unmount();
    await useSettings.persist.rehydrate();

    setup();
    expect(screen.getByRole("radio", { name: "Calendar" })).toHaveAttribute(
      "aria-checked",
      "true",
    );
  });

  it.each([
    ["cards", "map", "Cards"],
    ["map", "cards", "Map"],
    ["calendar", "map", "Calendar"],
    ["map", "calendar", "Map"],
  ] as const)("honors explicit layout=%s over the saved %s view", (layout, saved, label) => {
    useSettings.getState().setSetting("scheduleViewMode", saved);
    setup(`/schedule?year=2026&layout=${layout}`);
    expect(screen.getByRole("radio", { name: label })).toHaveAttribute("aria-checked", "true");
  });

  it("saves map view when opening a round from the upcoming strip", () => {
    setup();
    fireEvent.click(within(screen.getByRole("region", { name: "Up next" })).getByRole("button", { name: "Map" }));
    expect(JSON.parse(localStorage.getItem("f1-replay-settings")!).state.scheduleViewMode).toBe("map");
    expect(screen.getByLabelText("Current search")).toHaveTextContent("round=2");
  });

  it("persists both time choices across visits without a time parameter", async () => {
    let page = setup();
    fireEvent.click(screen.getByRole("radio", { name: "Track time" }));
    expect(JSON.parse(localStorage.getItem("f1-replay-settings")!).state.scheduleTimeMode).toBe("track");
    page.unmount();
    await useSettings.persist.rehydrate();

    page = setup();
    expect(screen.getByRole("radio", { name: "Track time" })).toHaveAttribute("aria-checked", "true");
    const row = screen.getByRole("link", { name: "Replay Race" }).parentElement!.parentElement!;
    expect(within(row).getAllByText(/^(Track time|Your time)$/).map((el) => el.textContent))
      .toEqual(["Track time", "Your time"]);
    fireEvent.click(screen.getByRole("radio", { name: "Your time" }));
    expect(JSON.parse(localStorage.getItem("f1-replay-settings")!).state.scheduleTimeMode).toBe("local");
    page.unmount();
    await useSettings.persist.rehydrate();

    setup();
    expect(screen.getByRole("radio", { name: "Your time" })).toHaveAttribute("aria-checked", "true");
  });

  it.each([
    ["local", "track", "Your time"],
    ["track", "local", "Track time"],
  ] as const)("honors explicit time=%s over the saved %s time", (time, saved, label) => {
    useSettings.getState().setSetting("scheduleTimeMode", saved);
    setup(`/schedule?year=2026&time=${time}`);
    expect(screen.getByRole("radio", { name: label })).toHaveAttribute("aria-checked", "true");
  });

  it("switches between your time and track time", () => {
    setup();
    const row = screen.getByRole("link", { name: "Replay Race" })
      .parentElement!.parentElement!;
    const sessionStart = NOW - 5 * DAY;
    const format = (ms: number, timeZone?: string) =>
      `${new Intl.DateTimeFormat(undefined, { weekday: "short", timeZone }).format(ms)} ${
        new Intl.DateTimeFormat(undefined, {
          hour: "2-digit",
          minute: "2-digit",
          timeZone,
        }).format(ms)
      }`;
    const yourTime = within(row).getByText("Your time");
    const trackTime = within(row).getByText("Track time");
    expect(yourTime.nextElementSibling).toHaveTextContent(format(sessionStart));
    expect(trackTime.nextElementSibling).toHaveTextContent(
      format(sessionStart + 3 * HOUR, "UTC"),
    );
    const local = screen.getByRole("radio", { name: "Your time" });
    expect(local.getAttribute("aria-checked")).toBe("true");
    fireEvent.click(screen.getByRole("radio", { name: "Track time" }));
    expect(
      screen.getByRole("radio", { name: "Track time" }).getAttribute("aria-checked"),
    ).toBe("true");
    expect(within(row).getByText("Your time")).toBeInTheDocument();
    expect(within(row).getByText("Track time")).toBeInTheDocument();
  });
});
