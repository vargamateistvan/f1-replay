import { beforeEach, describe, expect, it, vi } from "vitest";
import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import { SessionInfoBar } from "@/components/SessionInfoBar";
import type { Lap, RaceControl } from "@/api/types";

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

describe("SessionInfoBar", () => {
  beforeEach(() => {
    state.lightMode = false;
  });

  it("covers formation lap, jump dialog and callbacks", async () => {
    const onShowEliminations = vi.fn();
    const onShowResults = vi.fn();
    const onJumpToSessionTime = vi.fn();
    const sessionStartMs = Date.parse("2024-01-01T00:00:00.000Z");

    render(
      <SessionInfoBar
        laps={
          [
            {
              lap_number: 1,
              date_start: "2024-01-01T00:01:00.000Z",
            },
            {
              lap_number: 2,
              date_start: "2024-01-01T00:02:00.000Z",
            },
          ] as Lap[]
        }
        raceControl={
          [
            {
              date: "2024-01-01T00:00:10.000Z",
              flag: "YELLOW",
              lap_number: 1,
              message: "Yellow in sector 2",
            },
          ] as RaceControl[]
        }
        sessionTimeMs={30_000}
        sessionStartMs={sessionStartMs}
        airTemp={23.4}
        trackTemp={35.1}
        lightsOutMs={60_000}
        isRaceSession
        totalLapCount={58}
        onShowEliminations={onShowEliminations}
        onShowResults={onShowResults}
        onJumpToSessionTime={onJumpToSessionTime}
      />,
    );

    expect(screen.getByRole("button", { name: "F" })).toBeInTheDocument();
    expect(screen.queryByText("YELLOW FLAG")).not.toBeInTheDocument();
    expect(screen.getByText("Yellow in sector 2")).toBeInTheDocument();
    expect(screen.getByText("23°C")).toBeInTheDocument();
    expect(screen.getByText("35°C")).toBeInTheDocument();

    fireEvent.click(screen.getByText("Eliminated"));
    expect(onShowEliminations).toHaveBeenCalled();

    fireEvent.click(screen.getByText("Show Results"));
    expect(onShowResults).toHaveBeenCalled();

    fireEvent.click(screen.getByRole("button", { name: "F" }));
    expect(screen.getByText("Jump To Lap")).toBeInTheDocument();

    const input = screen.getByRole("spinbutton");
    fireEvent.change(input, { target: { value: "99" } });
    fireEvent.click(screen.getByRole("button", { name: "Jump" }));
    expect(
      screen.getByText("Enter a lap between 1 and 58."),
    ).toBeInTheDocument();

    fireEvent.change(input, { target: { value: "2" } });
    fireEvent.click(screen.getByRole("button", { name: "Jump" }));
    await waitFor(() => {
      expect(onJumpToSessionTime).toHaveBeenCalledWith(120_000);
    });

    fireEvent.click(screen.getByRole("button", { name: "F" }));
    fireEvent.keyDown(window, { key: "Escape" });
    await waitFor(() => {
      expect(screen.queryByText("Jump To Lap")).not.toBeInTheDocument();
    });
  });

  it("renders qualifying elimination tile in the left slot", () => {
    const onShowEliminations = vi.fn();
    const sessionStartMs = Date.parse("2024-01-01T00:00:00.000Z");

    render(
      <SessionInfoBar
        laps={[] as Lap[]}
        raceControl={[] as RaceControl[]}
        sessionTimeMs={0}
        sessionStartMs={sessionStartMs}
        qualiPhase="Q2"
        countdownMs={2_305_000}
        onShowEliminations={onShowEliminations}
      />,
    );

    expect(screen.queryByText("Lap")).not.toBeInTheDocument();
    expect(screen.getByText("Q2")).toBeInTheDocument();
    expect(screen.getByText("38:25")).toBeInTheDocument();

    fireEvent.click(
      screen.getByRole("button", { name: "Show eliminated drivers" }),
    );
    expect(onShowEliminations).toHaveBeenCalledTimes(1);
  });
});
