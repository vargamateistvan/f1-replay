import { describe, expect, it, vi } from "vitest";
import { fireEvent, render, screen } from "@testing-library/react";
import { RaceChapters } from "@/components/RaceChapters/RaceChapters";
import type { Driver } from "@/api/types";
import type { RaceChapter, WhatChangedSnapshot } from "@/timeline/raceControl";

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

describe("RaceChapters", () => {
  it("shows empty state when no chapters are available", () => {
    render(
      <RaceChapters
        chapters={[]}
        snapshots={[]}
        drivers={drivers}
        sessionTimeMs={0}
        onJump={vi.fn()}
      />,
    );

    expect(
      screen.getByText("No session loaded — select a race session to see chapters"),
    ).toBeInTheDocument();
  });

  it("covers incident-only filter, jump and replay actions", () => {
    const onJump = vi.fn();
    const onPlayWindow = vi.fn();
    const chapters: RaceChapter[] = [
      {
        id: "green-0",
        kind: "start",
        label: "Race Start",
        startMs: 0,
        endMs: 20_000,
        durationMs: 20_000,
        incidentWindowId: null,
      },
      {
        id: "incident-1",
        kind: "safety_car",
        label: "Safety Car",
        startMs: 20_000,
        endMs: 45_000,
        durationMs: 25_000,
        incidentWindowId: "incident-1",
      },
    ];
    const snapshots: WhatChangedSnapshot[] = [
      {
        window: {
          id: "incident-1",
          kind: "safety_car",
          label: "Safety Car",
          startMs: 20_000,
          endMs: 45_000,
        },
        positionChanges: [
          { driverNumber: 1, before: 2, after: 1, delta: 1 },
          { driverNumber: 16, before: 1, after: 2, delta: -1 },
        ],
        pitsDuringWindow: [16],
      },
    ];

    render(
      <RaceChapters
        chapters={chapters}
        snapshots={snapshots}
        drivers={drivers}
        sessionTimeMs={25_000}
        onJump={onJump}
        onPlayWindow={onPlayWindow}
      />,
    );

    expect(screen.getByText("What Changed")).toBeInTheDocument();
    expect(screen.getByText("Pitted:")).toBeInTheDocument();

    fireEvent.click(screen.getAllByRole("button", { name: /Jump to/ })[0]!);
    expect(onJump).toHaveBeenCalled();

    fireEvent.click(screen.getByRole("button", { name: /Replay Safety Car/ }));
    expect(onPlayWindow).toHaveBeenCalledWith(20_000, 45_000);

    fireEvent.click(screen.getByRole("button", { name: "Incident Only" }));
    expect(screen.queryByText("Race Start")).not.toBeInTheDocument();
  });
});
