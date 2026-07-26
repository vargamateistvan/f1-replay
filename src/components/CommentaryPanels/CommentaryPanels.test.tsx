import { describe, expect, it, vi } from "vitest";
import { render, waitFor } from "@testing-library/react";
import type {
  Driver,
  Lap,
  Overtake,
  Pit,
  Position,
  RaceControl,
  TeamRadio,
} from "@/api/types";
import type { ToastEvent } from "@/timeline/events";
import { CommentaryPanels } from "./CommentaryPanels";

const raceChaptersPropsSpy = vi.fn<(props: unknown) => void>();

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

type RaceChaptersProps = {
  chapters: Array<{ kind: string }>;
};

const emptyDrivers: Driver[] = [];
const emptyLaps: Lap[] = [];
const emptyPositions: Position[] = [];
const emptyPits: Pit[] = [];
const emptyOvertakes: Overtake[] = [];
const emptyRadio: TeamRadio[] = [];
const emptyToasts: ToastEvent[] = [];

function renderChaptersPanel(raceControlEntries: RaceControl[]) {
  render(
    <CommentaryPanels
      commentaryTab="chapters"
      raceControlError={false}
      teamRadioError={false}
      pitsError={false}
      overtakesError={false}
      raceControlEntries={raceControlEntries}
      teamRadioEntries={emptyRadio}
      pitEntries={emptyPits}
      overtakeEntries={emptyOvertakes}
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

    renderChaptersPanel([
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
});
