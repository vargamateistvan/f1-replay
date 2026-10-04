import { beforeEach, describe, expect, it, vi } from "vitest";
import { render, screen } from "@testing-library/react";
import type { ReactNode } from "react";
import type { Weather } from "@/api/types";
import { useSettings } from "@/stores/settings";
import { WeatherHistory } from "./WeatherHistory";

vi.mock("./WeatherPanel", () => ({
  WeatherPanel: ({ sessionTimeMs }: { sessionTimeMs: number }) => (
    <div data-testid="current-weather">{sessionTimeMs}</div>
  ),
}));

vi.mock("recharts", () => {
  const Box = ({ children }: { children?: ReactNode }) => <div>{children}</div>;
  return {
    ResponsiveContainer: Box,
    LineChart: ({ children, data }: { children?: ReactNode; data: unknown }) => (
      <div data-testid="weather-chart" data-rows={JSON.stringify(data)}>
        {children}
      </div>
    ),
    Line: ({ dataKey, type }: { dataKey: string; type: string }) => (
      <div data-testid={`series-${dataKey}`} data-type={type} />
    ),
    XAxis: ({ domain, tickFormatter }: {
      domain: [number, number];
      tickFormatter: (value: number) => string;
    }) => (
      <div data-testid="time-axis" data-domain={JSON.stringify(domain)}>
        {tickFormatter(domain[1])}
      </div>
    ),
    YAxis: Box,
    CartesianGrid: Box,
    Tooltip: ({ labelFormatter }: {
      labelFormatter: (value: number) => string;
    }) => (
      <div data-testid="weather-tooltip">{labelFormatter(3_661_999)}</div>
    ),
    ReferenceLine: ({ x }: { x: number }) => (
      <div data-testid="playhead">{x}</div>
    ),
  };
});

const sessionStartMs = Date.parse("2024-01-01T00:00:00Z");
const entries: Weather[] = [
  {
    air_temperature: 20,
    date: "2024-01-01T00:00:00Z",
    humidity: 50,
    meeting_key: 1,
    pressure: 1012,
    rainfall: 0,
    session_key: 1,
    track_temperature: 30,
    wind_direction: 90,
    wind_speed: 2,
  },
  {
    air_temperature: 19,
    date: "2024-01-01T00:01:00Z",
    humidity: 60,
    meeting_key: 1,
    pressure: 1011,
    rainfall: 1,
    session_key: 1,
    track_temperature: 28,
    wind_direction: 100,
    wind_speed: 3,
  },
];

const props = {
  entries,
  sessionKey: 1,
  sessionStartMs,
  sessionTimeMs: 30_000,
};

function chartRows(): unknown {
  return JSON.parse(screen.getAllByTestId("weather-chart")[0].getAttribute("data-rows") ?? "null");
}

describe("WeatherHistory", () => {
  beforeEach(() => {
    useSettings.setState({ metricSystem: "metric" });
  });

  it.each([
    [0, "00:00:00"],
    [30_000, "00:00:30"],
    [60_000, "00:01:00"],
    [3_661_999, "01:01:01"],
  ])("formats weather time %i as %s on the chart axis", (endMs, label) => {
    render(
      <WeatherHistory
        {...props}
        entries={[{ ...entries[0], date: new Date(sessionStartMs + endMs).toISOString() }]}
      />,
    );

    for (const axis of screen.getAllByTestId("time-axis")) {
      expect(axis).toHaveTextContent(label);
    }
    for (const tooltip of screen.getAllByTestId("weather-tooltip")) {
      expect(tooltip).toHaveTextContent("Session time: 01:01:01");
    }
  });

  it("always shows all weather series including future readings", () => {
    render(<WeatherHistory {...props} />);

    expect(screen.getAllByTestId("weather-chart")).toHaveLength(4);
    expect(chartRows()).toEqual([
      { ms: 0, air: 20, track: 30, wind: 2, humidity: 50, rain: 0 },
      { ms: 60_000, air: 19, track: 28, wind: 3, humidity: 60, rain: 1 },
    ]);
    expect(screen.getByTestId("series-track")).toBeInTheDocument();
    expect(screen.getByTestId("series-air")).toBeInTheDocument();
    expect(screen.getByTestId("series-wind")).toBeInTheDocument();
    expect(screen.getByTestId("series-humidity")).toBeInTheDocument();
    expect(screen.getByTestId("series-rain")).toHaveAttribute("data-type", "stepAfter");
    for (const marker of screen.getAllByTestId("playhead")) {
      expect(marker).toHaveTextContent("30000");
    }
    for (const axis of screen.getAllByTestId("time-axis")) {
      expect(axis).toHaveAttribute("data-domain", "[0,60000]");
    }
  });

  it("keeps the full history and time axis fixed during playback and backward seeks", () => {
    const { rerender } = render(<WeatherHistory {...props} />);
    for (const sessionTimeMs of [60_000, 0, 90_000]) {
      rerender(<WeatherHistory {...props} sessionTimeMs={sessionTimeMs} />);
      expect(chartRows()).toEqual([
        { ms: 0, air: 20, track: 30, wind: 2, humidity: 50, rain: 0 },
        { ms: 60_000, air: 19, track: 28, wind: 3, humidity: 60, rain: 1 },
      ]);
      for (const axis of screen.getAllByTestId("time-axis")) {
        expect(axis).toHaveAttribute("data-domain", "[0,60000]");
      }
      for (const marker of screen.getAllByTestId("playhead")) {
        expect(marker).toHaveTextContent(String(sessionTimeMs));
      }
      expect(screen.getByTestId("current-weather")).toHaveTextContent(String(sessionTimeMs));
    }
  });

  it("shows the full sorted session without moving the current weather or playhead", () => {
    render(<WeatherHistory {...props} entries={[entries[1], entries[0]]} />);
    expect(chartRows()).toEqual([
      { ms: 0, air: 20, track: 30, wind: 2, humidity: 50, rain: 0 },
      { ms: 60_000, air: 19, track: 28, wind: 3, humidity: 60, rain: 1 },
    ]);
    expect(screen.getByTestId("current-weather")).toHaveTextContent("30000");
    for (const axis of screen.getAllByTestId("time-axis")) {
      expect(axis).toHaveAttribute("data-domain", "[0,60000]");
    }
    for (const marker of screen.getAllByTestId("playhead")) {
      expect(marker).toHaveTextContent("30000");
    }
  });

  it("converts temperature and wind speed to the selected units", () => {
    useSettings.setState({ metricSystem: "imperial" });
    render(<WeatherHistory {...props} />);
    expect(chartRows()).toEqual([
      { ms: 0, air: 68, track: 86, wind: 4.473872, humidity: 50, rain: 0 },
      { ms: 60_000, air: 66.2, track: 82.4, wind: 6.710808, humidity: 60, rain: 1 },
    ]);
    expect(screen.getByText("(°F)")).toBeInTheDocument();
    expect(screen.getByText("(mph)")).toBeInTheDocument();
  });

  it("shows future-only history and handles empty or invalid data", () => {
    const { rerender } = render(<WeatherHistory {...props} entries={[]} />);
    expect(screen.getByText("No weather history available")).toBeInTheDocument();
    expect(screen.queryByTestId("weather-chart")).not.toBeInTheDocument();

    rerender(<WeatherHistory {...props} entries={[entries[1]]} />);
    expect(screen.getAllByTestId("weather-chart")).toHaveLength(4);
    expect(chartRows()).toEqual([
      { ms: 60_000, air: 19, track: 28, wind: 3, humidity: 60, rain: 1 },
    ]);

    rerender(<WeatherHistory {...props} entries={[{ ...entries[0], date: "invalid" }]} />);
    expect(screen.getByText("No weather history available")).toBeInTheDocument();
    expect(screen.queryByTestId("weather-chart")).not.toBeInTheDocument();
  });
});
