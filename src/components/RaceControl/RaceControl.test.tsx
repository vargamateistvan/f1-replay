import { beforeEach, describe, expect, it, vi } from "vitest";
import { fireEvent, render, screen } from "@testing-library/react";
import { RaceControlFeed } from "@/components/RaceControl/RaceControl";
import type { Driver, RaceControl } from "@/api/types";

const state = vi.hoisted(() => ({
  showCsvExportButtons: false,
  downloadCsv: vi.fn(),
}));

vi.mock("@/stores/settings", () => ({
  useSettings: (
    selector:
      | ((s: { showCsvExportButtons: boolean }) => unknown)
      | undefined,
  ) => {
    const store = { showCsvExportButtons: state.showCsvExportButtons };
    return selector ? selector(store) : store;
  },
}));

vi.mock("@/api/client", () => ({
  downloadEndpointCsv: (...args: unknown[]) => state.downloadCsv(...args),
}));

const drivers: Driver[] = [
  {
    driver_number: 1,
    name_acronym: "VER",
    full_name: "Max Verstappen",
    team_colour: "3671C6",
  },
  {
    driver_number: 16,
    name_acronym: "LEC",
    full_name: "Charles Leclerc",
    team_colour: "E8002D",
  },
] as unknown as Driver[];

describe("RaceControl", () => {
  beforeEach(() => {
    state.showCsvExportButtons = false;
    state.downloadCsv.mockReset();
  });

  it("covers empty states, filters, tracker and csv export", () => {
    const onClearFocus = vi.fn();

    const { rerender } = render(
      <RaceControlFeed
        entries={[]}
        sessionTimeMs={0}
        sessionStartMs={0}
        drivers={drivers}
      />,
    );
    expect(screen.getByText("Select a session")).toBeInTheDocument();

    rerender(
      <RaceControlFeed
        entries={[]}
        sessionTimeMs={0}
        sessionStartMs={1}
        drivers={drivers}
      />,
    );
    expect(screen.getByText("No events match filters")).toBeInTheDocument();

    state.showCsvExportButtons = true;
    rerender(
      <RaceControlFeed
        entries={[
          {
            category: "Flag",
            date: "2024-01-01T00:00:10.000Z",
            driver_number: null,
            flag: "YELLOW",
            lap_number: 1,
            meeting_key: 1,
            message: "Yellow flag sector 2",
            qualifying_phase: null,
            scope: "sector",
            sector: 2,
            session_key: 99,
          },
          {
            category: "Incident",
            date: "2024-01-01T00:00:20.000Z",
            driver_number: 16,
            flag: null,
            lap_number: 2,
            meeting_key: 1,
            message: "Car 16 under investigation",
            qualifying_phase: null,
            scope: null,
            sector: null,
            session_key: 99,
          },
          {
            category: "Incident",
            date: "2024-01-01T00:00:30.000Z",
            driver_number: 16,
            flag: null,
            lap_number: 3,
            meeting_key: 1,
            message: "Car 16 receives 5 second time penalty",
            qualifying_phase: null,
            scope: null,
            sector: null,
            session_key: 99,
          },
        ] as RaceControl[]}
        sessionKey={99}
        sessionTimeMs={60_000}
        sessionStartMs={Date.parse("2024-01-01T00:00:00.000Z")}
        drivers={drivers}
        focusDriver={16}
        onClearFocus={onClearFocus}
      />,
    );

    expect(screen.getAllByText("YELLOW").length).toBeGreaterThan(0);
    expect(screen.getByText("driver filter active")).toBeInTheDocument();
    expect(screen.getByText("Lap 3")).toBeInTheDocument();

    fireEvent.click(screen.getByRole("button", { name: "Tracker" }));
    expect(screen.getByText("Penalty Tracker")).toBeInTheDocument();
    expect(screen.getByText("Penalty")).toBeInTheDocument();

    fireEvent.change(screen.getByPlaceholderText("Search…"), {
      target: { value: "nothing-here" },
    });
    expect(screen.getByText("No events match filters")).toBeInTheDocument();

    fireEvent.click(screen.getByRole("button", { name: "Clear driver filter" }));
    expect(onClearFocus).toHaveBeenCalled();

    fireEvent.click(screen.getByRole("button", { name: "Export race control CSV" }));
    expect(state.downloadCsv).toHaveBeenCalledWith(
      "race_control",
      { session_key: 99 },
      "race_control_99.csv",
    );
  });
});
