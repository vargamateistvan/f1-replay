import { describe, expect, it, vi } from "vitest";
import { fireEvent, render, screen, within } from "@testing-library/react";
import type { ReactNode } from "react";
import { TyreDeg } from "@/components/TyreDeg/TyreDeg";
import type { Driver, Lap, Stint } from "@/api/types";

vi.mock("recharts", () => {
  const Box = ({ children }: { children?: ReactNode }) => <div>{children}</div>;
  return {
    ResponsiveContainer: Box,
    ScatterChart: Box,
    Scatter: ({ data }: { data: unknown[] }) => <div data-testid="scatter">{data.length}</div>,
    XAxis: Box,
    YAxis: Box,
    CartesianGrid: Box,
    Tooltip: Box,
    ReferenceLine: Box,
  };
});

const START = Date.parse("2026-05-01T13:00:00Z");

const drivers = [
  { driver_number: 1, name_acronym: "VER", team_colour: "3671C6" },
  { driver_number: 16, name_acronym: "LEC", team_colour: "E8002D" },
] as unknown as Driver[];

function lapsFor(driverNumber: number, times: number[]): Lap[] {
  return times.map(
    (lapS, i) =>
      ({
        date_start: new Date(START + i * 90_000).toISOString(),
        driver_number: driverNumber,
        is_pit_out_lap: false,
        lap_duration: lapS,
        lap_number: i + 1,
      }) as Lap,
  );
}

const stints = [1, 16].map(
  (driver_number) =>
    ({
      compound: "MEDIUM",
      driver_number,
      lap_start: 1,
      lap_end: 20,
      stint_number: 1,
      tyre_age_at_start: 0,
    }) as Stint,
);

// Lap 1 is never clean; laps 2–9 give each car an 8-lap stint.
const ramp = (first: number, step: number) =>
  [95, ...Array.from({ length: 8 }, (_, i) => first + step * i)];
const laps = [...lapsFor(1, ramp(90.1, 0.1)), ...lapsFor(16, ramp(90, 0.05))];

function renderDeg(sessionTimeMs: number, focusDriver: number | null = null) {
  return render(
    <TyreDeg
      drivers={drivers}
      laps={laps}
      stints={stints}
      pits={[]}
      neutralised={[]}
      sessionStartMs={START}
      sessionTimeMs={sessionTimeMs}
      focusDriver={focusDriver}
    />,
  );
}

describe("TyreDeg", () => {
  it("waits for enough clean laps before showing anything", () => {
    // Only laps 2–4 have finished.
    renderDeg(360_000);
    expect(screen.getByText(/Not enough clean green-flag laps/)).toBeTruthy();
  });

  it("lists each stint's slope and plots the focused driver", () => {
    renderDeg(60 * 60_000, 16);
    const table = within(screen.getByRole("table"));
    expect(table.getByText("+0.100")).toBeTruthy();
    expect(table.getByText("+0.050")).toBeTruthy();
    expect(screen.getAllByTestId("scatter")).toHaveLength(1);
    expect(table.getByText("LEC").closest("tr")?.getAttribute("aria-selected")).toBe("true");
  });

  it("summarises the field per compound", () => {
    renderDeg(60 * 60_000);
    expect(screen.getByText("Medium")).toBeTruthy();
    // Median of +0.100 and +0.050; LEC has the gentler stint.
    expect(screen.getByText("+0.075")).toBeTruthy();
    expect(screen.getByText("Best", { exact: false }).textContent).toContain("LEC");
  });

  it("orders rows by race position when known", () => {
    render(
      <TyreDeg
        drivers={drivers}
        laps={laps}
        stints={stints}
        pits={[]}
        neutralised={[]}
        sessionStartMs={START}
        sessionTimeMs={60 * 60_000}
        positionByDriver={new Map([[16, 1], [1, 2]])}
      />,
    );
    const names = screen.getAllByRole("row").slice(1).map((r) => r.textContent ?? "");
    expect(names[0]).toContain("LEC");
    expect(names[1]).toContain("VER");
  });

  it("toggles drivers into the chart and applies fuel correction", () => {
    renderDeg(60 * 60_000);
    const table = within(screen.getByRole("table"));
    fireEvent.click(table.getByText("LEC"));
    expect(screen.getAllByTestId("scatter")).toHaveLength(2);

    fireEvent.click(screen.getByRole("button", { name: "Remove VER from chart" }));
    expect(screen.getAllByTestId("scatter")).toHaveLength(1);

    fireEvent.click(screen.getByRole("button", { name: "Fuel corr." }));
    expect(table.getByText("+0.150")).toBeTruthy();
    expect(table.getByText("+0.100")).toBeTruthy();
  });
});
