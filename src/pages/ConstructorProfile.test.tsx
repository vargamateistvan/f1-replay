import { describe, expect, it, vi, beforeEach } from "vitest";
import { render, screen, within } from "@testing-library/react";
import { MemoryRouter, Route, Routes } from "react-router-dom";
import ConstructorProfile from "./ConstructorProfile";
import type { GridCell, ProgressionRound } from "@/utils/championship";

const mockUseStandings = vi.fn();
vi.mock("@/hooks/useStandings", () => ({
  useStandings: (...args: unknown[]) => mockUseStandings(...args),
}));
// Recharts needs real layout; the chart has its own tests.
vi.mock("@/components/PointsProgression/PointsProgressionChart", () => ({
  PointsProgressionChart: ({ series }: { series: { label: string }[] }) => (
    <div data-testid="progression">{series.map((s) => s.label).join(",")}</div>
  ),
}));

const driver = (
  driverNumber: number,
  acronym: string,
  position: number,
  points: number,
  constructorName: string,
) => ({
  position,
  driverNumber,
  acronym,
  fullName: `Driver ${acronym}`,
  team: constructorName,
  constructorName,
  color: "#3671C6",
  points,
  wins: 0,
  podiums: 0,
});

const team = (name: string, position: number, points: number) => ({
  position,
  name,
  color: "#3671C6",
  points,
  wins: 0,
});

const rounds: ProgressionRound[] = [
  { sessionKey: 1, meetingKey: 1229, label: "Sakhir", code: "BRN", isSprint: false },
  { sessionKey: 2, label: "Jeddah", code: "KSA", isSprint: false },
];

const ver = driver(1, "VER", 1, 43, "Red Bull Racing");
const per = driver(11, "PER", 2, 33, "Red Bull Racing");
const ham = driver(44, "HAM", 3, 30, "Mercedes");

function setup(path: string) {
  mockUseStandings.mockReturnValue({
    hiddenSessions: [],
    throughSession: undefined,
    driverStandings: [ver, per, ham],
    constructorStandings: [
      team("Red Bull Racing", 1, 76),
      team("Mercedes", 2, 30),
      team("Kick Sauber", 3, 0),
    ],
    constructorProgression: {
      rounds,
      totals: new Map([
        ["Red Bull Racing", [43, 76]],
        ["Mercedes", [15, 30]],
        ["Kick Sauber", [0, 0]],
      ]),
    },
    teammates: [
      {
        team: "Red Bull Racing",
        color: "#3671C6",
        a: ver,
        b: per,
        qualifying: { a: 2, b: 0 },
        race: { a: 2, b: 0 },
      },
    ],
    resultsGrid: {
      rounds,
      cells: new Map<number, (GridCell | null)[]>([
        [
          1,
          [
            { position: 1, points: 25, status: "finished", pole: true },
            { position: 2, points: 18, status: "finished" },
          ],
        ],
        [
          11,
          [
            { position: 2, points: 18, status: "finished" },
            { position: 1, points: 15, status: "finished" },
          ],
        ],
      ]),
    },
    qualifyingLoading: false,
    isLoading: false,
    isFetching: false,
    isError: false,
  });
  return render(
    <MemoryRouter initialEntries={[path]}>
      <Routes>
        <Route path="/standings/team/:teamName" element={<ConstructorProfile />} />
      </Routes>
    </MemoryRouter>,
  );
}

describe("ConstructorProfile page", () => {
  beforeEach(() => mockUseStandings.mockReset());

  it("shows the team's season summary", () => {
    setup("/standings/team/Red%20Bull%20Racing?year=2024");
    expect(
      screen.getByRole("heading", { level: 1, name: "Red Bull Racing" }),
    ).toBeInTheDocument();
    // Leader is the team itself; only the neighbour below is added.
    expect(screen.getByTestId("progression")).toHaveTextContent(
      "Red Bull Racing,Mercedes",
    );
    expect(
      screen.getByRole("link", { name: "Driver VER driver profile" }),
    ).toHaveAttribute("href", "/standings/driver/1?year=2024");
    expect(screen.queryByText("Driver HAM")).not.toBeInTheDocument();

    const table = screen.getAllByRole("table")[0];
    const rows = within(table).getAllByRole("row");
    expect(rows).toHaveLength(3);
    // Round 1: VER P1 + PER P2 = 43; running total 76 after round 2.
    // Cells: round, VER, PER, round points, total, championship position.
    const cellsOf = (row: HTMLElement) =>
      [...row.children].map((c) => c.textContent);
    expect(cellsOf(rows[1])).toEqual(["Sakhir", "P1P", "P2", "43", "43", "P1"]);
    expect(cellsOf(rows[2])).toEqual(["Jeddah", "P2", "P1", "33", "76", "P1"]);
    expect(screen.getByText("1-2 finishes").nextSibling).toHaveTextContent("2");
  });

  it("reports unknown teams", () => {
    setup("/standings/team/Nope?year=2024");
    expect(
      screen.getByText("No 2024 championship entry for Nope"),
    ).toBeInTheDocument();
  });

  it("links rounds to the replay and each car to that driver", () => {
    setup("/standings/team/Red%20Bull%20Racing?year=2024");
    expect(screen.getByRole("link", { name: "Sakhir" })).toHaveAttribute(
      "href",
      "/?year=2024&meeting=1229&session=1&view=tracker",
    );
    expect(screen.getByTitle("Watch PER in Sakhir")).toHaveAttribute(
      "href",
      "/?year=2024&meeting=1229&session=1&view=tracker&focus=11",
    );
  });
});
