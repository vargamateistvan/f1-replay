import { describe, expect, it, vi } from "vitest";
import { render, screen, waitFor } from "@testing-library/react";
import type {
  Driver,
  Lap,
  Overtake,
  Pit,
  Position,
  RaceControl,
  Stint,
  TeamRadio,
} from "@/api/types";
import type { ToastEvent } from "@/timeline/events";
import { CommentaryPanels } from "./CommentaryPanels";

const raceChaptersPropsSpy = vi.fn<(props: unknown) => void>();
const weatherHistoryPropsSpy = vi.fn<(props: unknown) => void>();

vi.mock("@/components/RaceControl/RaceControl", () => ({
  RaceControlFeed: () => null,
}));

vi.mock("@/components/TeamRadio/TeamRadio", () => ({
  TeamRadioFeed: () => null,
}));

vi.mock("@/components/Pits/PitFeed", () => ({
  PitFeed: () => null,
}));

vi.mock("@/components/Overtakes/OvertakeFeed", () => ({
  OvertakeFeed: () => null,
}));

vi.mock("@/components/KeyMoments/KeyMoments", () => ({
  KeyMoments: () => null,
}));

vi.mock("@/components/RaceChapters/RaceChapters", () => ({
  RaceChapters: (props: unknown) => {
    raceChaptersPropsSpy(props);
    return null;
  },
}));

vi.mock("@/components/Weather/WeatherHistory", () => ({
  WeatherHistory: (props: unknown) => {
    weatherHistoryPropsSpy(props);
    return null;
  },
}));

type RaceChaptersProps = {
  chapters: Array<{ kind: string }>;
};
type WeatherHistoryProps = {
  entries: Array<{ date: string }>;
  sessionKey: number | null;
  sessionTimeMs: number;
  sessionStartMs: number;
};

const emptyDrivers: Driver[] = [];
const emptyLaps: Lap[] = [];
const emptyPositions: Position[] = [];
const emptyPits: Pit[] = [];
const emptyStints: Stint[] = [];
const emptyOvertakes: Overtake[] = [];
const emptyRadio: TeamRadio[] = [];
const emptyToasts: ToastEvent[] = [];

function renderCommentaryPanel(
  commentaryTab: "chapters" | "weather",
  raceControlEntries: RaceControl[] = [],
  weatherError = false,
) {
  render(
    <CommentaryPanels
      commentaryTab={commentaryTab}
      raceControlError={false}
      teamRadioError={false}
      pitsError={false}
      overtakesError={false}
      weatherError={weatherError}
      raceControlEntries={raceControlEntries}
      teamRadioEntries={emptyRadio}
      pitEntries={emptyPits}
      stints={emptyStints}
      overtakeEntries={emptyOvertakes}
      weatherEntries={[
        {
          air_temperature: 25,
          date: "2024-01-01T00:00:00.000Z",
          humidity: 50,
          meeting_key: 1,
          pressure: 1012,
          rainfall: 0,
          session_key: 1,
          track_temperature: 30,
          wind_direction: 90,
          wind_speed: 2,
        },
      ]}
      drivers={emptyDrivers}
      laps={emptyLaps}
      positions={emptyPositions}
      incidentWindows={[]}
      sessionKey={1}
      sessionYear={2026}
      sessionType="Race"
      sessionTimeMs={0}
      sessionStartMs={Date.parse("2024-01-01T00:00:00Z")}
      toastEvents={emptyToasts}
      showAllItems
      focusDriver={null}
      onPlayWindow={vi.fn()}
    />,
  );
}

describe("CommentaryPanels", () => {
  it("uses chequered message to build finish chapter when flag casing is non-standard", async () => {
    raceChaptersPropsSpy.mockClear();

    renderCommentaryPanel("chapters", [
      {
        category: "Flag",
        date: "2024-01-01T00:00:20Z",
        driver_number: null,
        flag: "Chequered",
        lap_number: 57,
        meeting_key: 1,
        message: "CHEQUERED FLAG",
        qualifying_phase: null,
        scope: "Track",
        sector: null,
        session_key: 1,
      },
    ]);

    await waitFor(() => {
      expect(raceChaptersPropsSpy).toHaveBeenCalled();
    });

    const lastCall = raceChaptersPropsSpy.mock.calls.at(-1)?.[0] as
      | RaceChaptersProps
      | undefined;

    expect(lastCall).toBeDefined();
    expect(
      lastCall?.chapters.some((chapter) => chapter.kind === "finish"),
    ).toBe(true);
  });

  it("renders weather history with the current session and playhead", async () => {
    weatherHistoryPropsSpy.mockClear();

    renderCommentaryPanel("weather");

    await waitFor(() => {
      expect(weatherHistoryPropsSpy).toHaveBeenCalled();
    });

    const props = weatherHistoryPropsSpy.mock.calls.at(-1)?.[0] as
      | WeatherHistoryProps
      | undefined;

    expect(props).toMatchObject({
      sessionKey: 1,
      sessionTimeMs: 0,
      sessionStartMs: Date.parse("2024-01-01T00:00:00Z"),
      entries: [{ date: "2024-01-01T00:00:00.000Z" }],
    });
  });

  it("shows an explicit error when weather fails to load", () => {
    weatherHistoryPropsSpy.mockClear();
    renderCommentaryPanel("weather", [], true);

    expect(screen.getByText("Failed to load weather")).toBeInTheDocument();
    expect(weatherHistoryPropsSpy).not.toHaveBeenCalled();
  });
});
