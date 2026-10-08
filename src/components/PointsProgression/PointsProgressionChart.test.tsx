import { describe, expect, it, vi } from "vitest";
import { fireEvent, render, screen } from "@testing-library/react";
import type { ReactNode } from "react";
import { PointsProgressionChart, type ProgressionSeries } from "./PointsProgressionChart";

vi.mock("recharts", () => {
  const Box = ({ children }: { children?: ReactNode }) => <div>{children}</div>;
  const Line = ({ dataKey, strokeOpacity }: { dataKey: string; strokeOpacity: number }) => (
    <div data-testid={`line-${dataKey}`} data-opacity={strokeOpacity} />
  );
  return {
    ResponsiveContainer: Box,
    LineChart: Box,
    Line,
    XAxis: Box,
    YAxis: Box,
    CartesianGrid: Box,
    Tooltip: Box,
  };
});

const rounds = [
  { sessionKey: 1, label: "Sakhir", isSprint: false },
  { sessionKey: 2, label: "Jeddah", isSprint: false },
];

const series: ProgressionSeries[] = Array.from({ length: 12 }, (_, i) => ({
  key: `d${i}`,
  label: `D${i}`,
  color: "#fff",
  dashed: i % 2 === 1,
  values: [i, i * 2],
}));

describe("PointsProgressionChart", () => {
  it("draws the top entries and can expand to all", () => {
    render(<PointsProgressionChart rounds={rounds} series={series} />);
    expect(screen.getAllByTestId(/^line-/)).toHaveLength(10);
    fireEvent.click(screen.getByRole("button", { name: "Show all 12" }));
    expect(screen.getAllByTestId(/^line-/)).toHaveLength(12);
    fireEvent.click(screen.getByRole("button", { name: "Top 10" }));
    expect(screen.getAllByTestId(/^line-/)).toHaveLength(10);
  });

  it("highlights a line when its legend entry is hovered", () => {
    render(<PointsProgressionChart rounds={rounds} series={series} />);
    fireEvent.mouseEnter(screen.getByRole("button", { name: "D3" }));
    expect(screen.getByTestId("line-d3")).toHaveAttribute("data-opacity", "1");
    expect(screen.getByTestId("line-d0")).toHaveAttribute("data-opacity", "0.15");
    fireEvent.mouseLeave(screen.getByRole("button", { name: "D3" }));
    expect(screen.getByTestId("line-d0")).toHaveAttribute("data-opacity", "1");
  });

  it("shows an empty or loading state without rounds", () => {
    const { rerender } = render(<PointsProgressionChart rounds={[]} series={[]} />);
    expect(screen.getByText("No race results yet")).toBeInTheDocument();
    rerender(<PointsProgressionChart rounds={[]} series={[]} loading />);
    expect(screen.getByText("Loading race results…")).toBeInTheDocument();
  });
});
