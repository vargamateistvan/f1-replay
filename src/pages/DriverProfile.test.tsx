import { describe, expect, it, vi, beforeEach } from "vitest";
import { render, screen, within } from "@testing-library/react";
import { MemoryRouter, Route, Routes } from "react-router-dom";
import DriverProfile from "./DriverProfile";
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

const standing = (
  driverNumber: number,
  acronym: string,
  position: number,
  points: number,
  team = "Red Bull Racing",
) => ({
  position,
  driverNumber,
  acronym,
  fullName: `Driver ${acronym}`,
  team,
  color: "#3671C6",
  points,
  wins: 0,
  podiums: 0,
});

const rounds: ProgressionRound[] = [
  { sessionKey: 1, meetingKey: 1229, label: "Sakhir", code: "BRN", isSprint: false },
  { sessionKey: 2, label: "Jeddah", code: "KSA", isSprint: false },
];

const ver = standing(1, "VER", 1, 43);
const per = standing(11, "PER", 2, 33);
const ham = standing(44, "HAM", 3, 30, "Mercedes");

function setup(path: string) {
  mockUseStandings.mockReturnValue({
    hiddenSessions: [],
    throughSession: undefined,
    driverStandings: [ver, per, ham],
    driverProgression: {
      rounds,
      totals: new Map([
        [1, [25, 43]],
        [11, [18, 33]],
        [44, [15, 30]],
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
            { position: 1, points: 25, status: "finished", pole: true, qualifying: 1 },
            { position: 2, points: 18, status: "finished", qualifying: 3 },
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
        <Route path="/standings/driver/:driverNumber" element={<DriverProfile />} />
      </Routes>
    </MemoryRouter>,
  );
}

describe("DriverProfile page", () => {
  beforeEach(() => mockUseStandings.mockReset());

  it("shows the driver's season summary", () => {
    setup("/standings/driver/1?year=2024");
    expect(mockUseStandings).toHaveBeenCalledWith(2024, null, null, {
      includeQualifying: true,
      includeResultMarkers: true,
    });
    expect(
      screen.getByRole("heading", { level: 1, name: "Driver VER" }),
    ).toBeInTheDocument();
    expect(screen.getByRole("link", { name: /standings/i })).toHaveAttribute(
      "href",
      "/standings?year=2024",
    );
    // Teammate dashed, then the leader is the driver themself → not repeated.
    expect(screen.getByTestId("progression")).toHaveTextContent("VER,PER");
    expect(screen.getByLabelText("Red Bull Racing teammate comparison")).toBeInTheDocument();

    const rows = screen.getAllByRole("row");
    // Header + two rounds.
    expect(rows).toHaveLength(3);
    expect(within(rows[1]).getByText("P1", { selector: "span" })).toBeInTheDocument();
    expect(within(rows[2]).getByText("43")).toBeInTheDocument();
  });

  it("adds the leader to the chart for other drivers", () => {
    setup("/standings/driver/44");
    expect(screen.getByTestId("progression")).toHaveTextContent("HAM,VER");
  });

  it("reports drivers without a championship entry", () => {
    setup("/standings/driver/99?year=2024");
    expect(
      screen.getByText("No 2024 championship entry for driver #99"),
    ).toBeInTheDocument();
  });

  it("links rounds to the replay focused on the driver", () => {
    setup("/standings/driver/1?year=2024");
    expect(screen.getByRole("link", { name: "Sakhir" })).toHaveAttribute(
      "href",
      "/?year=2024&meeting=1229&session=1&view=tracker&focus=1",
    );
    // No meeting key → no link.
    expect(screen.queryByRole("link", { name: "Jeddah" })).not.toBeInTheDocument();
  });
});
