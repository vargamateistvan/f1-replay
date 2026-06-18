import { describe, expect, it } from "vitest";
import { fireEvent, render, screen } from "@testing-library/react";
import { StrategyBar } from "@/components/Strategy/StrategyBar";
import type { Driver, Lap, Pit, Stint } from "@/api/types";

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

describe("StrategyBar", () => {
  it("renders empty state when no stints are available", () => {
    render(
      <StrategyBar
        stints={[]}
        drivers={drivers}
        laps={[]}
        pits={[]}
        sessionTimeMs={0}
        sessionStartMs={0}
      />,
    );

    expect(screen.getByText("No strategy data")).toBeInTheDocument();
  });

  it("renders timeline with pit marker and supports elapsed toggle", () => {
    const sessionStartMs = Date.parse("2024-01-01T00:00:00.000Z");

    render(
      <StrategyBar
        stints={
          [
            {
              compound: "MEDIUM",
              driver_number: 1,
              lap_end: 10,
              lap_start: 1,
              meeting_key: 1,
              session_key: 1,
              stint_number: 1,
              tyre_age_at_start: 0,
            },
            {
              compound: "SOFT",
              driver_number: 1,
              lap_end: 20,
              lap_start: 11,
              meeting_key: 1,
              session_key: 1,
              stint_number: 2,
              tyre_age_at_start: 0,
            },
            {
              compound: "HARD",
              driver_number: 16,
              lap_end: 20,
              lap_start: 1,
              meeting_key: 1,
              session_key: 1,
              stint_number: 1,
              tyre_age_at_start: 2,
            },
          ] as Stint[]
        }
        drivers={drivers}
        laps={
          [
            {
              date_start: "2024-01-01T00:00:10.000Z",
              driver_number: 1,
              duration_sector_1: 30,
              duration_sector_2: 31,
              duration_sector_3: 32,
              i1_speed: null,
              i2_speed: null,
              is_pit_out_lap: false,
              lap_duration: 93,
              lap_number: 1,
              meeting_key: 1,
              segments_sector_1: null,
              segments_sector_2: null,
              segments_sector_3: null,
              session_key: 1,
              st_speed: null,
            },
            {
              date_start: "2024-01-01T00:02:00.000Z",
              driver_number: 1,
              duration_sector_1: 29,
              duration_sector_2: 30,
              duration_sector_3: 31,
              i1_speed: null,
              i2_speed: null,
              is_pit_out_lap: false,
              lap_duration: 90,
              lap_number: 2,
              meeting_key: 1,
              segments_sector_1: null,
              segments_sector_2: null,
              segments_sector_3: null,
              session_key: 1,
              st_speed: null,
            },
          ] as Lap[]
        }
        pits={
          [
            {
              date: "2024-01-01T00:03:00.000Z",
              driver_number: 1,
              lap_number: 2,
              meeting_key: 1,
              stop_duration: 2.5,
              lane_duration: 24,
              pit_duration: null,
              session_key: 1,
            },
          ] as Pit[]
        }
        sessionTimeMs={190_000}
        sessionStartMs={sessionStartMs}
      />,
    );

    expect(screen.getByRole("button", { name: "Elapsed" })).toBeInTheDocument();
    expect(screen.getAllByText("VER").length).toBeGreaterThan(0);
    expect(screen.getAllByText("LEC").length).toBeGreaterThan(0);
    expect(screen.getByText("Pit")).toBeInTheDocument();
    expect(screen.getByText("Age = laps on tyre")).toBeInTheDocument();
    expect(screen.getByTitle(/Pit L2/)).toBeInTheDocument();

    fireEvent.click(screen.getByRole("button", { name: "Elapsed" }));
    expect(screen.getByRole("button", { name: "All" })).toBeInTheDocument();
  });
});
