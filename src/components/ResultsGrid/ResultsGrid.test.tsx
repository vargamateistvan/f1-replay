import { describe, expect, it } from "vitest";
import { fireEvent, render, screen, within } from "@testing-library/react";
import { ResultsGrid } from "./ResultsGrid";
import type { GridCell, ProgressionRound } from "@/utils/championship";
import type { DriverStanding } from "@/utils/standings";

const rounds: ProgressionRound[] = [
  { sessionKey: 1, label: "Sakhir", code: "BRN", isSprint: false },
  { sessionKey: 2, label: "Shanghai (S)", code: "CHN", isSprint: true },
  { sessionKey: 3, label: "Shanghai", code: "CHN", isSprint: false },
];

const standing = (driverNumber: number, acronym: string, position: number, points: number): DriverStanding => ({
  position,
  driverNumber,
  acronym,
  fullName: acronym,
  team: "Team",
  color: "#fff",
  points,
  wins: 0,
  podiums: 0,
});

const cell = (position: number | null, points: number, status: GridCell["status"] = "finished"): GridCell => ({
  position,
  points,
  status,
});

const cells = new Map<number, (GridCell | null)[]>([
  [1, [cell(1, 25), cell(2, 7), cell(null, 0, "dnf")]],
  [4, [cell(12, 0), null, cell(3, 15)]],
]);

const standings = [standing(1, "VER", 1, 32), standing(4, "NOR", 2, 15)];

function rowFor(acronym: string) {
  return screen.getByRole("rowheader", { name: new RegExp(acronym) }).closest("tr")!;
}

describe("ResultsGrid", () => {
  it("renders one column per round with sprint markers", () => {
    render(<ResultsGrid rounds={rounds} standings={standings} cells={cells} />);
    const headers = screen.getAllByRole("columnheader").map((h) => h.textContent);
    expect(headers).toEqual(["Driver", "BRN", "CHNS", "CHN", "Pts"]);
    expect(screen.getAllByRole("columnheader")[2]).toHaveAttribute("title", "Shanghai (S)");
  });

  it("shows positions, retirements and colour-codes podiums", () => {
    render(<ResultsGrid rounds={rounds} standings={standings} cells={cells} />);
    const ver = within(rowFor("VER")).getAllByRole("cell");
    expect(ver.map((c) => c.textContent)).toEqual(["1", "2", "DNF", "32"]);
    expect(ver[0]).toHaveClass("bg-amber-300");
    expect(ver[0]).toHaveAttribute("title", "VER · Sakhir: P1 · 25 pts");
    expect(ver[2]).toHaveClass("text-f1red");

    const nor = within(rowFor("NOR")).getAllByRole("cell");
    expect(nor.map((c) => c.textContent)).toEqual(["12", "", "3", "15"]);
    expect(nor[1]).toHaveAttribute("title", "NOR · Shanghai (S): did not take part");
  });

  it("switches to points scored", () => {
    render(<ResultsGrid rounds={rounds} standings={standings} cells={cells} />);
    fireEvent.click(screen.getByRole("button", { name: "points" }));
    expect(within(rowFor("VER")).getAllByRole("cell").map((c) => c.textContent)).toEqual(["25", "7", "DNF", "32"]);
    expect(within(rowFor("NOR")).getAllByRole("cell")[0]).toHaveTextContent("–");
  });

  it("shows an empty or loading state", () => {
    const { rerender } = render(<ResultsGrid rounds={[]} standings={standings} cells={new Map()} />);
    expect(screen.getByText("No race results yet")).toBeInTheDocument();
    rerender(<ResultsGrid rounds={[]} standings={standings} cells={new Map()} loading />);
    expect(screen.getByText("Loading race results…")).toBeInTheDocument();
  });
});
