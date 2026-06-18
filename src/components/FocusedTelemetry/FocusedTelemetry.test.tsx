import { beforeEach, describe, expect, it, vi } from "vitest";
import { fireEvent, render, screen } from "@testing-library/react";
import { FocusedTelemetry } from "@/components/FocusedTelemetry/FocusedTelemetry";
import type { Driver } from "@/api/types";

const state = vi.hoisted(() => ({
  t: 20_000,
  windowData: [] as unknown[],
  compareWindowData: [] as unknown[],
  lapData: [] as unknown[],
  compareLapData: [] as unknown[],
}));

vi.mock("@/timeline/clock", () => ({
  useTimeline: () => ({ t: state.t }),
}));

vi.mock("@/hooks/useLocationChunks", () => ({
  chunkIndexFor: () => 0,
}));

vi.mock("@/hooks/useCarDataWindow", () => ({
  useCarDataWindow: (_s: unknown, driverNumber: number | null) => ({
    data: driverNumber === 16 ? state.compareWindowData : state.windowData,
  }),
}));

vi.mock("@/hooks/useCarDataForLap", () => ({
  useCarDataForLap: (_s: unknown, driverNumber: number | null) => ({
    data: driverNumber === 16 ? state.compareLapData : state.lapData,
  }),
}));

vi.mock("@/components/TelemetryChart/TelemetryChart", () => ({
  TelemetryChart: ({ title }: { title: string }) => <div>{title}</div>,
}));

const driverA: Driver = {
  driver_number: 1,
  name_acronym: "VER",
  full_name: "Max Verstappen",
  team_colour: "3671C6",
} as Driver;

const driverB: Driver = {
  driver_number: 16,
  name_acronym: "LEC",
  full_name: "Charles Leclerc",
  team_colour: "E8002D",
} as Driver;

describe("FocusedTelemetry", () => {
  beforeEach(() => {
    state.windowData = [];
    state.compareWindowData = [];
    state.lapData = [];
    state.compareLapData = [];
  });

  it("shows no-sample message and clear focus action", () => {
    const onClear = vi.fn();
    render(
      <FocusedTelemetry
        sessionKey={1}
        driver={driverA}
        sessionStartMs={Date.parse("2024-01-01T00:00:00.000Z")}
        onClear={onClear}
      />,
    );

    expect(
      screen.getByText("No telemetry at this point — scrub into the session"),
    ).toBeInTheDocument();
    fireEvent.click(screen.getByRole("button", { name: "Clear focus" }));
    expect(onClear).toHaveBeenCalled();
  });

  it("renders compare controls and telemetry charts", () => {
    const onClearCompare = vi.fn();
    state.windowData = [
      {
        date: "2024-01-01T00:00:10.000Z",
        speed: 300,
        n_gear: 7,
        rpm: 12000,
        throttle: 95,
        brake: 5,
        drs: 12,
      },
    ];
    state.compareWindowData = [
      {
        date: "2024-01-01T00:00:10.000Z",
        speed: 290,
        n_gear: 6,
        rpm: 11500,
        throttle: 90,
        brake: 8,
        drs: 8,
      },
    ];
    state.lapData = [
      { distM: 0, speed: 200, throttle: 50 },
      { distM: 100, speed: 210, throttle: 60 },
    ];
    state.compareLapData = [
      { distM: 0, speed: 198, throttle: 48 },
      { distM: 100, speed: 208, throttle: 58 },
    ];

    render(
      <FocusedTelemetry
        sessionKey={1}
        driver={driverA}
        compareDriver={driverB}
        sessionStartMs={Date.parse("2024-01-01T00:00:00.000Z")}
        driverLap={10}
        compareDriverLap={10}
        onClear={vi.fn()}
        onClearCompare={onClearCompare}
      />,
    );

    expect(
      screen.getByRole("button", { name: "Clear comparison driver" }),
    ).toBeInTheDocument();
    expect(
      screen.getByText(/Speed \(km\/h\) · L10 vs L10/),
    ).toBeInTheDocument();
    fireEvent.click(
      screen.getByRole("button", { name: "Clear comparison driver" }),
    );
    expect(onClearCompare).toHaveBeenCalled();
  });
});
