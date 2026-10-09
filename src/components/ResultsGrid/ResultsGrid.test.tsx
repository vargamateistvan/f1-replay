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
  [16, [cell(null, 0, "dns"), cell(null, 0, "dsq"), { ...cell(8, 4), fastestLap: true }]],
  [44, [{ ...cell(2, 18), pole: true, fastestLap: true }, null, { ...cell(5, 10), pole: true }]],
]);

const standings = [
  standing(1, "VER", 1, 32),
  standing(4, "NOR", 2, 15),
  standing(16, "LEC", 3, 4),
  standing(44, "HAM", 4, 28),
];

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
    expect(ver[2]).toHaveAttribute("title", "VER · Shanghai: DNF (did not finish) · 0 pts");

    const nor = within(rowFor("NOR")).getAllByRole("cell");
    expect(nor.map((c) => c.textContent)).toEqual(["12", "", "3", "15"]);
    expect(nor[1]).toHaveAttribute("title", "NOR · Shanghai (S): did not take part");
  });

  it("distinguishes non-starts and disqualifications", () => {
    render(<ResultsGrid rounds={rounds} standings={standings} cells={cells} />);
    const lec = within(rowFor("LEC")).getAllByRole("cell");
    expect(lec.map((c) => c.textContent)).toEqual(["DNS", "DSQ", "8F", "4"]);
    expect(lec[0]).toHaveClass("text-f1red/60");
    expect(lec[0]).toHaveAttribute("title", "LEC · Sakhir: DNS (did not start) · 0 pts");
    expect(lec[1]).toHaveClass("bg-f1red");
    expect(lec[1]).toHaveAttribute("title", "LEC · Shanghai (S): DSQ (disqualified) · 0 pts");
  });

  it("explains every non-classified status in the legend", () => {
    render(<ResultsGrid rounds={rounds} standings={standings} cells={cells} />);
    for (const text of ["Did not start", "Did not finish", "Disqualified"]) {
      expect(screen.getByText(text)).toBeInTheDocument();
    }
  });

  it("marks pole position and fastest lap as superscripts", () => {
    render(<ResultsGrid rounds={rounds} standings={standings} cells={cells} />);
    const ham = within(rowFor("HAM")).getAllByRole("cell");
    expect(ham.map((c) => c.textContent)).toEqual(["2PF", "", "5P", "28"]);
    expect(ham[0].querySelector("sup")).toHaveTextContent("PF");
    expect(ham[0]).toHaveAttribute(
      "title",
      "HAM · Sakhir: P2 · 18 pts · pole position · fastest lap",
    );
    expect(within(rowFor("LEC")).getAllByRole("cell")[2]).toHaveTextContent("8F");
    expect(screen.getByText("Pole position")).toBeInTheDocument();
    expect(screen.getByText("Fastest lap")).toBeInTheDocument();
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
