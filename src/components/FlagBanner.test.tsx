import { beforeEach, describe, expect, it, vi } from "vitest";
import { render, screen } from "@testing-library/react";
import { FlagBanner } from "@/components/FlagBanner";
import type { RaceControl } from "@/api/types";

const state = vi.hoisted(() => ({
  lightMode: false,
}));

vi.mock("@/stores/settings", () => ({
  useSettings: (
    selector: ((s: { lightMode: boolean }) => unknown) | undefined,
  ) => {
    const store = { lightMode: state.lightMode };
    return selector ? selector(store) : store;
  },
}));

describe("FlagBanner", () => {
  beforeEach(() => {
    state.lightMode = false;
  });

  it("covers race-phase and active-flag branches", () => {
    const entries = [
      {
        date: "2024-01-01T00:01:00.000Z",
        flag: "YELLOW",
        lap_number: 2,
        message: "Yellow",
      },
      {
        date: "2024-01-01T00:02:00.000Z",
        flag: "GREEN",
        lap_number: 3,
        message: "Track clear",
      },
      {
        date: "2024-01-01T00:03:00.000Z",
        flag: "VIRTUAL_SC",
        lap_number: 4,
        message: "VSC",
      },
    ] as RaceControl[];
    const sessionStartMs = Date.parse("2024-01-01T00:00:00.000Z");

    const { rerender } = render(
      <FlagBanner
        entries={entries}
        sessionTimeMs={10_000}
        sessionStartMs={sessionStartMs}
        lightsOutMs={60_000}
        isRaceSession
      />,
    );
    expect(screen.getByText("FORMATION LAP")).toBeInTheDocument();

    rerender(
      <FlagBanner
        entries={entries}
        sessionTimeMs={57_000}
        sessionStartMs={sessionStartMs}
        lightsOutMs={60_000}
        isRaceSession
      />,
    );
    expect(screen.queryByText("FORMATION LAP")).not.toBeInTheDocument();

    rerender(
      <FlagBanner
        entries={entries}
        sessionTimeMs={60_100}
        sessionStartMs={sessionStartMs}
        lightsOutMs={60_000}
        isRaceSession
      />,
    );
    expect(screen.getByText(/LIGHTS OUT/)).toBeInTheDocument();

    rerender(
      <FlagBanner
        entries={entries}
        sessionTimeMs={180_000}
        sessionStartMs={sessionStartMs}
      />,
    );
    expect(screen.getByText("VSC DEPLOYED")).toBeInTheDocument();

    rerender(
      <FlagBanner
        entries={entries}
        sessionTimeMs={130_000}
        sessionStartMs={sessionStartMs}
      />,
    );
    expect(screen.queryByText("⚑ YELLOW FLAG")).not.toBeInTheDocument();
  });
});
