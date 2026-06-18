import { describe, expect, it, vi } from "vitest";
import { fireEvent, render, screen } from "@testing-library/react";
import type { ReactNode } from "react";
import { LapChart } from "@/components/LapChart/LapChart";
import type { Driver, Position } from "@/api/types";

vi.mock("recharts", () => {
  const Box = ({ children }: { children?: ReactNode }) => <div>{children}</div>;
  return {
    ResponsiveContainer: Box,
    LineChart: Box,
    Line: Box,
    XAxis: Box,
    YAxis: Box,
    CartesianGrid: Box,
    Tooltip: Box,
    ReferenceLine: Box,
  };
});

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

describe("LapChart", () => {
  it("covers empty state and elapsed/all toggle", () => {
    const sessionStartMs = Date.parse("2024-01-01T00:00:00.000Z");
    const { rerender } = render(
      <LapChart
        drivers={drivers}
        positions={[]}
        lapStarts={[]}
        sessionStartMs={sessionStartMs}
        sessionTimeMs={0}
      />,
    );
    expect(screen.getByText("No position data for a lap chart yet")).toBeInTheDocument();

    rerender(
      <LapChart
        drivers={drivers}
        positions={[
          {
            driver_number: 1,
            position: 1,
            date: "2024-01-01T00:00:10.000Z",
          },
          {
            driver_number: 16,
            position: 2,
            date: "2024-01-01T00:00:10.000Z",
          },
          {
            driver_number: 1,
            position: 2,
            date: "2024-01-01T00:00:30.000Z",
          },
        ] as unknown as Position[]}
        lapStarts={[10_000, 20_000, 30_000]}
        sessionStartMs={sessionStartMs}
        sessionTimeMs={25_000}
      />,
    );

    expect(screen.getByRole("button", { name: "Elapsed" })).toBeInTheDocument();
    fireEvent.click(screen.getByRole("button", { name: "Elapsed" }));
    expect(screen.getByRole("button", { name: "All" })).toBeInTheDocument();
  });
});
