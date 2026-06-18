import { beforeEach, describe, expect, it, vi } from "vitest";
import { fireEvent, render, screen } from "@testing-library/react";
import { TeamRadioFeed } from "@/components/TeamRadio/TeamRadio";
import type { Driver, TeamRadio } from "@/api/types";

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
] as unknown as Driver[];

describe("TeamRadio", () => {
  beforeEach(() => {
    state.showCsvExportButtons = false;
    state.downloadCsv.mockReset();
  });

  it("covers empty states, play/stop toggle, and csv export", () => {
    const { rerender, container } = render(
      <TeamRadioFeed
        entries={[]}
        sessionKey={null}
        sessionYear={null}
        drivers={drivers}
        sessionTimeMs={0}
        sessionStartMs={0}
      />,
    );
    expect(screen.getByText("Select a session")).toBeInTheDocument();

    rerender(
      <TeamRadioFeed
        entries={[]}
        sessionKey={77}
        sessionYear={2026}
        drivers={drivers}
        sessionTimeMs={0}
        sessionStartMs={1}
      />,
    );
    expect(screen.getByText(/coverage is often limited in 2026\+ events/i)).toBeInTheDocument();

    state.showCsvExportButtons = true;
    rerender(
      <TeamRadioFeed
        entries={[
          {
            date: "2024-01-01T00:00:10.000Z",
            driver_number: 1,
            meeting_key: 1,
            recording_url: "https://example.com/radio.mp3",
            session_key: 77,
          },
        ] as TeamRadio[]}
        sessionKey={77}
        sessionYear={2024}
        drivers={drivers}
        sessionTimeMs={20_000}
        sessionStartMs={Date.parse("2024-01-01T00:00:00.000Z")}
      />,
    );

    expect(screen.getByText("VER")).toBeInTheDocument();
    fireEvent.click(screen.getByRole("button", { name: "Play" }));
    expect(screen.getByRole("button", { name: "Stop" })).toBeInTheDocument();
    expect(container.querySelector("audio")).toBeInTheDocument();

    fireEvent.click(screen.getByRole("button", { name: "Stop" }));
    expect(screen.getByRole("button", { name: "Play" })).toBeInTheDocument();

    fireEvent.click(screen.getByRole("button", { name: "Export team radio CSV" }));
    expect(state.downloadCsv).toHaveBeenCalledWith(
      "team_radio",
      { session_key: 77 },
      "team_radio_77.csv",
    );
  });
});
