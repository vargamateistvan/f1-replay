import { beforeEach, describe, expect, it, vi } from "vitest";
import { fireEvent, render, screen } from "@testing-library/react";
import { OvertakeFeed } from "@/components/Overtakes/OvertakeFeed";
import type { Driver, Overtake } from "@/api/types";

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
  {
    driver_number: 63,
    name_acronym: "RUS",
    full_name: "George Russell",
    team_colour: "00D2BE",
  },
] as unknown as Driver[];

describe("OvertakeFeed", () => {
  beforeEach(() => {
    state.showCsvExportButtons = false;
    state.downloadCsv.mockReset();
  });

  it("covers empty states and populated list with csv export", () => {
    const { rerender } = render(
      <OvertakeFeed
        entries={[]}
        sessionKey={null}
        drivers={drivers}
        sessionTimeMs={0}
        sessionStartMs={0}
      />,
    );
    expect(screen.getByText("Select a session")).toBeInTheDocument();

    rerender(
      <OvertakeFeed
        entries={[]}
        sessionKey={10}
        drivers={drivers}
        sessionTimeMs={0}
        sessionStartMs={1}
      />,
    );
    expect(screen.getByText("No overtakes yet — scrub forward")).toBeInTheDocument();

    state.showCsvExportButtons = true;
    const entries = [
      {
        date: "2024-01-01T00:00:10.000Z",
        overtaking_driver_number: 1,
        overtaken_driver_number: 16,
        position: 2,
        meeting_key: 1,
        session_key: 10,
      },
      {
        date: "2024-01-01T00:00:12.000Z",
        overtaking_driver_number: 63,
        overtaken_driver_number: 1,
        position: null,
        meeting_key: 1,
        session_key: 10,
      },
    ] as Overtake[];

    rerender(
      <OvertakeFeed
        entries={entries}
        sessionKey={10}
        drivers={drivers}
        sessionTimeMs={20_000}
        sessionStartMs={Date.parse("2024-01-01T00:00:00.000Z")}
      />,
    );

    expect(screen.getAllByText("VER").length).toBeGreaterThan(0);
    expect(screen.getByText("LEC")).toBeInTheDocument();
    expect(screen.getByText("for P2")).toBeInTheDocument();
    expect(screen.queryByText("for Pnull")).not.toBeInTheDocument();

    fireEvent.click(screen.getByRole("button", { name: "Export overtakes CSV" }));
    expect(state.downloadCsv).toHaveBeenCalledWith(
      "overtakes",
      { session_key: 10 },
      "overtakes_10.csv",
    );
  });
});
