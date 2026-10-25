import { beforeEach, describe, expect, it, vi } from "vitest";
import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import { SessionInfoBar } from "@/components/SessionInfoBar";
import type { Driver, Lap, RaceControl } from "@/api/types";

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

  it.each(["Q1", "Q2"])(
    "shows Break in the lap-counter slot after %s and clears it on restart or seek",
    (phase) => {
      const sessionStartMs = Date.parse("2026-10-10T13:00:00Z");
      const raceControl: RaceControl[] = [
        {
          category: "SessionStatus",
          date: "2026-10-10T13:55:00Z",
          message: "SESSION STARTED",
          qualifying_phase: 2,
          driver_number: null,
          flag: null,
          lap_number: null,
          meeting_key: 1296,
          scope: null,
          sector: null,
          session_key: 11384,
        },
        {
          category: "SessionStatus",
          date: "2026-10-10T13:48:00Z",
          message: "SESSION FINISHED",
          qualifying_phase: 1,
          driver_number: null,
          flag: null,
          lap_number: null,
          meeting_key: 1296,
          scope: null,
          sector: null,
          session_key: 11384,
        },
      ];
      const props = {
        laps: [],
        raceControl,
        sessionStartMs,
        qualiPhase: phase,
        countdownMs: 0,
        onShowEliminations: vi.fn(),
      };
      const { rerender } = render(
        <SessionInfoBar {...props} sessionTimeMs={48 * 60_000} />,
      );
      expect(screen.getByText("Break")).toBeInTheDocument();
      expect(screen.queryByText("Lap")).not.toBeInTheDocument();
      fireEvent.click(screen.getByRole("button", { name: "Show eliminated drivers" }));
      expect(props.onShowEliminations).toHaveBeenCalledOnce();

      rerender(
        <SessionInfoBar
          {...props}
          qualiPhase="Q2"
          countdownMs={15 * 60_000}
          sessionTimeMs={55 * 60_000}
        />,
      );
      expect(screen.queryByText("Break")).not.toBeInTheDocument();
      expect(screen.getByText("15:00")).toBeInTheDocument();

      rerender(<SessionInfoBar {...props} sessionTimeMs={47 * 60_000} />);
      expect(screen.queryByText("Break")).not.toBeInTheDocument();

      rerender(
        <SessionInfoBar {...props} qualiPhase="Q3" sessionTimeMs={50 * 60_000} />,
      );
      expect(screen.queryByText("Break")).not.toBeInTheDocument();

      rerender(
        <SessionInfoBar
          {...props}
          onShowEliminations={undefined}
          sessionTimeMs={50 * 60_000}
        />,
      );
      expect(screen.getByText("Break")).toBeInTheDocument();

      rerender(
        <SessionInfoBar
          {...props}
          raceControl={raceControl.map((entry) => ({
            ...entry,
            message: entry.message.replace("FINISHED", "ABORTED"),
          }))}
          sessionTimeMs={50 * 60_000}
        />,
      );
      expect(screen.queryByText("Break")).not.toBeInTheDocument();
    },
  );

  it("shows countdown instead of lap counter for timed non-race sessions", () => {
    const sessionStartMs = Date.parse("2024-01-01T00:00:00.000Z");

    render(
      <SessionInfoBar
        laps={[] as Lap[]}
        raceControl={[] as RaceControl[]}
        sessionTimeMs={10_000}
        sessionStartMs={sessionStartMs}
        countdownMs={3_500_000}
        isRaceSession={false}
      />,
    );

    expect(screen.getByText("Countdown")).toBeInTheDocument();
    expect(screen.getByText("58:20")).toBeInTheDocument();
    expect(screen.queryByText("Lap")).not.toBeInTheDocument();
  });

  it("styles the latest race control message like the commentary feed", () => {
    const sessionStartMs = Date.parse("2024-01-01T00:00:00.000Z");

    render(
      <SessionInfoBar
        laps={[] as Lap[]}
        raceControl={
          [
            {
              date: "2024-01-01T00:00:10.000Z",
              flag: "YELLOW",
              lap_number: 3,
              message: "YELLOW IN TRACK SECTOR 4",
            },
            {
              date: "2024-01-01T00:00:20.000Z",
              category: "Other",
              flag: null,
              driver_number: 44,
              lap_number: 4,
              message: "5 SECOND TIME PENALTY FOR CAR 44 (HAM)",
            },
            {
              date: "2024-01-01T00:05:00.000Z",
              flag: "RED",
              lap_number: 9,
              message: "RED FLAG",
            },
          ] as RaceControl[]
        }
        drivers={
          [
            { driver_number: 44, name_acronym: "HAM", team_colour: "E8002D" },
          ] as Driver[]
        }
        sessionTimeMs={30_000}
        sessionStartMs={sessionStartMs}
      />,
    );

    expect(
      screen.getByText("5 SECOND TIME PENALTY FOR CAR 44 (HAM)"),
    ).toBeInTheDocument();
    expect(screen.queryByText("RED FLAG")).not.toBeInTheDocument();
    expect(screen.getByText("L4")).toBeInTheDocument();
    expect(screen.getByText("Penalty")).toHaveClass("bg-red-500/25");
    expect(screen.getByText("HAM")).toHaveStyle({ color: "#E8002D" });
  });

  it("shows message age and same-instant count, and replays from the message on click", () => {
    const sessionStartMs = Date.parse("2024-01-01T00:00:00.000Z");
    const onJumpToSessionTime = vi.fn();
    const raceControl = [
      {
        date: "2024-01-01T00:01:00.000Z",
        flag: "GREEN",
        lap_number: 2,
        message: "GREEN LIGHT - PIT EXIT OPEN",
      },
      {
        date: "2024-01-01T00:01:00.000Z",
        flag: null,
        lap_number: 2,
        message: "DRS ENABLED",
      },
    ] as RaceControl[];

    const { rerender } = render(
      <SessionInfoBar
        laps={[] as Lap[]}
        raceControl={raceControl}
        sessionTimeMs={72_000}
        sessionStartMs={sessionStartMs}
        onJumpToSessionTime={onJumpToSessionTime}
      />,
    );

    expect(screen.getByText("GREEN LIGHT - PIT EXIT OPEN")).toHaveClass("text-white/90");
    expect(screen.getByText("12s ago")).toBeInTheDocument();
    expect(screen.getByText("+1")).toBeInTheDocument();

    fireEvent.click(
      screen.getByRole("button", {
        name: "Replay from race control message: GREEN LIGHT - PIT EXIT OPEN",
      }),
    );
    expect(onJumpToSessionTime).toHaveBeenCalledWith(60_000);

    rerender(
      <SessionInfoBar
        laps={[] as Lap[]}
        raceControl={raceControl}
        sessionTimeMs={60_000 + 5 * 60_000}
        sessionStartMs={sessionStartMs}
      />,
    );

    expect(screen.getByText("5m ago")).toBeInTheDocument();
    expect(screen.getByText("GREEN LIGHT - PIT EXIT OPEN")).toHaveClass("text-white/60");
    expect(
      screen.queryByRole("button", { name: /Replay from race control/ }),
    ).not.toBeInTheDocument();
  });
});
