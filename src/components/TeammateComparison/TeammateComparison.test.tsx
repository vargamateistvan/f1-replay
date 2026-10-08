import { describe, expect, it } from "vitest";
import { render, screen } from "@testing-library/react";
import { TeammateComparison } from "./TeammateComparison";
import type { TeammateComparison as Comparison } from "@/hooks/useStandings";
import type { DriverStanding } from "@/utils/standings";

const standing = (acronym: string, position: number, points: number): DriverStanding => ({
  position,
  driverNumber: position,
  acronym,
  fullName: acronym,
  team: "McLaren",
  color: "#FF8000",
  points,
  wins: 0,
  podiums: 0,
});

const comparison: Comparison = {
  team: "McLaren",
  color: "#FF8000",
  a: standing("NOR", 1, 300),
  b: standing("PIA", 2, 280),
  qualifying: { a: 12, b: 8 },
  race: { a: 11, b: 9 },
};

describe("TeammateComparison", () => {
  it("shows qualifying, race and points head-to-heads", () => {
    render(<TeammateComparison comparisons={[comparison]} />);
    expect(screen.getByRole("region", { name: "McLaren teammate comparison" })).toBeInTheDocument();
    expect(screen.getByRole("img", { name: "Qualifying: 12–8" })).toBeInTheDocument();
    expect(screen.getByRole("img", { name: "Race: 11–9" })).toBeInTheDocument();
    expect(screen.getByRole("img", { name: "Points: 300–280" })).toBeInTheDocument();
    expect(screen.getByText("NOR")).toBeInTheDocument();
    expect(screen.getByText("PIA")).toBeInTheDocument();
  });

  it("shows a placeholder while qualifying results load", () => {
    render(
      <TeammateComparison
        comparisons={[{ ...comparison, qualifying: { a: 0, b: 0 } }]}
        qualifyingLoading
      />,
    );
    expect(screen.getAllByText("…")).toHaveLength(2);
  });

  it("shows an empty state", () => {
    render(<TeammateComparison comparisons={[]} />);
    expect(screen.getByText("No teammate data for the selected season")).toBeInTheDocument();
  });
});
