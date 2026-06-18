import { beforeEach, describe, expect, it, vi } from "vitest";
import { fireEvent, render, screen } from "@testing-library/react";
import { WeatherPanel } from "@/components/Weather/WeatherPanel";
import type { Weather } from "@/api/types";

const weatherPanelState = vi.hoisted(() => ({
  lightMode: false,
  showCsvExportButtons: false,
  downloadCsv: vi.fn(),
}));

vi.mock("@/stores/settings", () => ({
  useSettings: (
    selector:
      | ((state: { lightMode: boolean; showCsvExportButtons: boolean }) => unknown)
      | undefined,
  ) => {
    const store = {
      lightMode: weatherPanelState.lightMode,
      showCsvExportButtons: weatherPanelState.showCsvExportButtons,
    };
    return selector ? selector(store) : store;
  },
}));

vi.mock("@/api/client", () => ({
  downloadEndpointCsv: (...args: unknown[]) => weatherPanelState.downloadCsv(...args),
}));

describe("WeatherPanel", () => {
  beforeEach(() => {
    weatherPanelState.lightMode = false;
    weatherPanelState.showCsvExportButtons = false;
    weatherPanelState.downloadCsv.mockReset();
  });

  it("renders no-data state", () => {
    render(
      <WeatherPanel
        entries={[]}
        sessionTimeMs={0}
        sessionStartMs={0}
        sessionKey={null}
      />,
    );

    expect(screen.getByText("No weather data")).toBeInTheDocument();
  });

  it("renders rain/trend rows and exports csv", () => {
    weatherPanelState.showCsvExportButtons = true;
    weatherPanelState.lightMode = true;

    const entries = [
      {
        air_temperature: 25.2,
        date: "2024-01-01T00:00:00.000Z",
        humidity: 52,
        meeting_key: 1,
        pressure: 1012.4,
        rainfall: 0,
        session_key: 77,
        track_temperature: 33.1,
        wind_direction: 90,
        wind_speed: 2.5,
      },
      {
        air_temperature: 24.6,
        date: "2024-01-01T00:01:05.000Z",
        humidity: 55,
        meeting_key: 1,
        pressure: 1011.8,
        rainfall: 0.8,
        session_key: 77,
        track_temperature: 34.0,
        wind_direction: Number.NaN,
        wind_speed: 3.1,
      },
      {
        air_temperature: 23.9,
        date: "2024-01-01T00:02:10.000Z",
        humidity: 58,
        meeting_key: 1,
        pressure: 1010.9,
        rainfall: 0.3,
        session_key: 77,
        track_temperature: 32.6,
        wind_direction: Number.NaN,
        wind_speed: 4.0,
      },
    ] as Weather[];

    const { rerender } = render(
      <WeatherPanel
        entries={entries}
        sessionTimeMs={70_000}
        sessionStartMs={Date.parse("2024-01-01T00:00:00.000Z")}
        sessionKey={77}
      />,
    );

    expect(screen.getByText("Track Weather")).toBeInTheDocument();
    expect(screen.getByText("Rain")).toBeInTheDocument();
    expect(screen.getByText("Dir")).toBeInTheDocument();
    expect(screen.getAllByText("↑").length).toBeGreaterThan(0);
    expect(screen.getAllByText("▲").length).toBeGreaterThan(0);

    fireEvent.click(screen.getByRole("button", { name: "Export weather CSV" }));
    expect(weatherPanelState.downloadCsv).toHaveBeenCalledWith(
      "weather",
      { session_key: 77 },
      "weather_77.csv",
    );

    rerender(
      <WeatherPanel
        entries={entries}
        sessionTimeMs={140_000}
        sessionStartMs={Date.parse("2024-01-01T00:00:00.000Z")}
        sessionKey={77}
      />,
    );

    expect(screen.getAllByText("▼").length).toBeGreaterThan(0);
  });
});
