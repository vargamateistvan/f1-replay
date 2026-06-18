import { describe, expect, it } from "vitest";
import { render, screen } from "@testing-library/react";
import { QualifyingBanner } from "@/components/QualifyingBanner";
import type { Driver, Position } from "@/api/types";

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

describe("QualifyingBanner", () => {
  it("renders phase ranges, countdown and knockout chips", () => {
    const positions = [
      {
        driver_number: 1,
        position: 11,
        date: "2024-01-01T00:00:10.000Z",
      },
      {
        driver_number: 16,
        position: 15,
        date: "2024-01-01T00:00:10.000Z",
      },
      {
        driver_number: 63,
        position: 16,
        date: "2024-01-01T00:00:10.000Z",
      },
      {
        driver_number: 1,
        position: 1,
        date: "2024-01-01T00:02:00.000Z",
      },
    ] as Position[];

    const { rerender } = render(
      <QualifyingBanner
        phase="Q3"
        drivers={drivers}
        positions={positions}
        sessionTimeMs={20_000}
        sessionStartMs={Date.parse("2024-01-01T00:00:00.000Z")}
        countdownMs={91_000}
      />,
    );

    expect(screen.getByText("Q2 Eliminated")).toBeInTheDocument();
    expect(screen.getByText("01:31")).toBeInTheDocument();
    expect(screen.getByText("P11")).toBeInTheDocument();
    expect(screen.getByText("P15")).toBeInTheDocument();

    rerender(
      <QualifyingBanner
        phase="Q1"
        drivers={drivers}
        positions={positions}
        sessionTimeMs={20_000}
        sessionStartMs={Date.parse("2024-01-01T00:00:00.000Z")}
      />,
    );

    expect(screen.getByText("Q1 Knockout Zone")).toBeInTheDocument();
    expect(screen.getByText("P16")).toBeInTheDocument();
  });
});
