import { render, screen } from "@testing-library/react";
import { describe, expect, it } from "vitest";
import type { Driver, Pit, Stint } from "@/api/types";
import { PitFeed } from "./PitFeed";

const drivers: Driver[] = [
  {
    driver_number: 1,
    broadcast_name: "M VERSTAPPEN",
    full_name: "Max Verstappen",
    name_acronym: "VER",
    team_name: "Red Bull Racing",
    team_colour: "3671C6",
    first_name: "Max",
    last_name: "Verstappen",
    headshot_url: null,
    country_code: "NED",
    session_key: 1,
    meeting_key: 1,
  },
];

const pits: Pit[] = [
  {
    date: "2024-01-01T00:10:00Z",
    driver_number: 1,
    lap_number: 10,
    meeting_key: 1,
    stop_duration: 2.5,
    lane_duration: 22,
    pit_duration: null,
    session_key: 1,
  },
];

const stints: Stint[] = [
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
    tyre_age_at_start: 2,
  },
];

function renderPitFeed(feedStints: Stint[]) {
  render(
    <PitFeed
      entries={pits}
      stints={feedStints}
      drivers={drivers}
      sessionTimeMs={0}
      sessionStartMs={Date.parse("2024-01-01T00:00:00Z")}
      showAllItems
      sessionType="Race"
    />,
  );
}

describe("PitFeed", () => {
  it("shows the leaderboard tyre badge for the stint after each stop", () => {
    renderPitFeed(stints);

    expect(screen.getByText("2")).toBeInTheDocument();
    expect(screen.getByText("S")).toBeInTheDocument();
    expect(screen.getByTitle("SOFT · 2 laps old")).toBeInTheDocument();
    expect(screen.queryByText("M")).not.toBeInTheDocument();
  });

  it("omits tyre details when no following stint is available", () => {
    renderPitFeed(stints.slice(0, 1));

    expect(screen.queryByTitle(/lap.*old/)).not.toBeInTheDocument();
  });
});
