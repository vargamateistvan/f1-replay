import { describe, expect, it, vi } from "vitest";
import { fireEvent, render, screen } from "@testing-library/react";
import type { ReactNode } from "react";
import { GapChart } from "@/components/GapChart/GapChart";
import type { Driver, Interval } from "@/api/types";

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
  {
    driver_number: 63,
    name_acronym: "RUS",
    full_name: "George Russell",
    team_colour: "00D2BE",
  },
] as unknown as Driver[];

describe("GapChart", () => {
  it("covers empty and lap-axis toggle branches", () => {
    const sessionStartMs = Date.parse("2024-01-01T00:00:00.000Z");
    const { rerender } = render(
      <GapChart
        drivers={drivers}
        intervals={[]}
        sessionTimeMs={0}
        sessionStartMs={sessionStartMs}
      />,
    );
    expect(screen.getByText("No gap data available yet")).toBeInTheDocument();

    rerender(
      <GapChart
        drivers={drivers}
        intervals={[
          {
            driver_number: 1,
            date: "2024-01-01T00:00:10.000Z",
            gap_to_leader: 0,
          },
          {
            driver_number: 16,
            date: "2024-01-01T00:00:10.000Z",
            gap_to_leader: 1.234,
          },
          {
            driver_number: 63,
            date: "2024-01-01T00:00:15.000Z",
            gap_to_leader: "1 LAP",
          },
        ] as unknown as Interval[]}
        sessionTimeMs={25_000}
        sessionStartMs={sessionStartMs}
        lapStarts={[10_000, 20_000, 30_000]}
        currentLap={2}
      />,
    );

    expect(screen.getByRole("button", { name: "Elapsed" })).toBeInTheDocument();
    fireEvent.click(screen.getByRole("button", { name: "Elapsed" }));
    expect(screen.getByRole("button", { name: "All" })).toBeInTheDocument();
  });

  it("covers time-axis fallback when lap starts are missing", () => {
    const sessionStartMs = Date.parse("2024-01-01T00:00:00.000Z");
    render(
      <GapChart
        drivers={drivers}
        intervals={[
          {
            driver_number: 1,
            date: "2024-01-01T00:00:10.000Z",
            gap_to_leader: 0,
          },
          {
            driver_number: 16,
            date: "2024-01-01T00:00:15.000Z",
            gap_to_leader: 2.5,
          },
        ] as unknown as Interval[]}
        sessionTimeMs={30_000}
        sessionStartMs={sessionStartMs}
        lapStarts={[]}
      />,
    );

    expect(screen.queryByText("No gap data available yet")).not.toBeInTheDocument();
    expect(screen.queryByRole("button", { name: "Elapsed" })).not.toBeInTheDocument();
  });
});
