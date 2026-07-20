import { describe, expect, it, vi } from "vitest";
import { fireEvent, render, screen } from "@testing-library/react";
import { CatchupSummary } from "@/components/CatchupSummary/CatchupSummary";
import type { Driver } from "@/api/types";
import type { CatchupSummary as CatchupSummaryData } from "@/hooks/useCatchupSummary";

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

describe("CatchupSummary", () => {
  it("renders headline/notable events and supports dismiss actions", () => {
    const onDismiss = vi.fn();
    render(
      <CatchupSummary
        summary={
          {
            fromMs: 0,
            toMs: 120_000,
            events: [
              {
                id: "f1",
                ms: 10_000,
                kind: "fastest_lap",
                payload: { driverNumber: 1, lapTime: 88.123 },
              },
              {
                id: "o1",
                ms: 20_000,
                kind: "overtake",
                payload: { overtaking: 1, overtaken: 16, position: 2 },
              },
              {
                id: "p1",
                ms: 25_000,
                kind: "penalty",
                payload: { message: "Car 16 receives 5 second time penalty" },
              },
              {
                id: "fl1",
                ms: 30_000,
                kind: "flag",
                payload: { flag: "RED", message: "Red flag", lapNumber: 5 },
              },
              {
                id: "pit1",
                ms: 35_000,
                kind: "pit",
                payload: { driverNumber: 16, lap: 5 },
              },
            ],
          } as CatchupSummaryData
        }
        drivers={drivers}
        onDismiss={onDismiss}
      />,
    );

    expect(screen.getByText("While you were away")).toBeInTheDocument();
    expect(screen.getByText(/1 pit stop/)).toBeInTheDocument();
    expect(screen.getByText("FASTEST")).toBeInTheDocument();
    expect(screen.getByText("PENALTY")).toBeInTheDocument();

    fireEvent.click(screen.getAllByRole("button", { name: "Dismiss" })[0]!);
    expect(onDismiss).toHaveBeenCalled();
  });

  it("renders a styled tooltip for long event messages", () => {
    render(
      <CatchupSummary
        summary={
          {
            fromMs: 0,
            toMs: 45_000,
            events: [
              {
                id: "penalty-long",
                ms: 25_000,
                kind: "penalty",
                payload: {
                  message:
                    "Car 16 receives a five second time penalty for leaving the track and gaining a lasting advantage at Turn 12",
                },
              },
            ],
          } as CatchupSummaryData
        }
        drivers={drivers}
        onDismiss={vi.fn()}
      />,
    );

    expect(screen.getByRole("tooltip")).toBeInTheDocument();
    expect(screen.getByText("Full event")).toBeInTheDocument();
  });
});
