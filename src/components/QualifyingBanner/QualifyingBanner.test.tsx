import { describe, expect, it } from "vitest";
import { fireEvent, render, screen } from "@testing-library/react";
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
  it("opens eliminated drivers in a dialog", () => {
    const positions = Array.from({ length: 20 }, (_, i) => ({
      driver_number: i + 1,
      position: i + 1,
      date: "2024-01-01T00:00:10.000Z",
    })) as Position[];

    render(
      <QualifyingBanner
        phase="Q3"
        drivers={drivers}
        positions={positions}
        sessionTimeMs={20_000}
        sessionStartMs={Date.parse("2024-01-01T00:00:00.000Z")}
        countdownMs={91_000}
      />,
    );

    expect(screen.getByText("01:31")).toBeInTheDocument();
    fireEvent.click(screen.getByRole("button", { name: "Eliminated" }));
    expect(screen.getByText("Q1 & Q2 Eliminated")).toBeInTheDocument();
    expect(screen.getAllByText("Q2 Eliminated").length).toBeGreaterThan(0);
    expect(screen.getAllByText("Q1 Eliminated").length).toBeGreaterThan(0);
    expect(screen.getByText("P11")).toBeInTheDocument();
    expect(screen.getByText("P15")).toBeInTheDocument();
    expect(screen.getByText("P16")).toBeInTheDocument();
    expect(screen.getByText("P20")).toBeInTheDocument();
  });
});
