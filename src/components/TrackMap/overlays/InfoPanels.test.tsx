import { render, screen } from "@testing-library/react";
import { describe, expect, it } from "vitest";
import type { Weather } from "@/api/types";
import { TrackClockPanel, WeatherPanel } from "./InfoPanels";
import { formatTrackClock } from "../trackMapFormat";

const weather: Weather = {
  session_key: 1,
  meeting_key: 1,
  date: "2026-07-26T12:30:08Z",
  track_temperature: 45.8,
  air_temperature: 23.9,
  humidity: 40,
  pressure: 784,
  wind_speed: 2.8,
  wind_direction: 290,
  rainfall: 0,
};

describe("map information cards", () => {
  it("shows track and local clocks with their timezones in a compact frame", () => {
    const nowMs = Date.parse(weather.date);
    const zone = Intl.DateTimeFormat().resolvedOptions().timeZone || "UTC";
    render(<TrackClockPanel nowMs={nowMs} sessionGmtOffset="+02:00" raining={false} />);
    expect(screen.getByText("Track").parentElement).toHaveTextContent("14:30:08");
    expect(screen.getByText("Local").parentElement).toHaveTextContent(formatTrackClock(nowMs, "local", zone));
    expect(screen.getByTitle(`Local timezone: ${zone}`)).toHaveTextContent(zone);
    expect(screen.getByLabelText("Track time")).toHaveClass("w-56", "rounded-sm", "md:block");
  });

  it("retains temperatures, humidity, pressure and wind in dry conditions", () => {
    render(<WeatherPanel weather={weather} metricSystem="metric" />);
    expect(screen.getByText("Dry")).toBeInTheDocument();
    expect(screen.getByText("45.8")).toHaveTextContent("°C");
    expect(screen.getByText("23.9")).toHaveTextContent("°C");
    expect(screen.getByText("40%")).toBeInTheDocument();
    expect(screen.getByText("784 hPa")).toBeInTheDocument();
    expect(screen.getByText("m/s").parentElement).toHaveTextContent("2.8 m/s WNW");
    expect(screen.getByLabelText("Track weather")).toHaveClass("w-56", "rounded-sm");
  });

  it("preserves imperial conversion and highlights rain", () => {
    render(<WeatherPanel weather={{ ...weather, rainfall: 1 }} metricSystem="imperial" />);
    expect(screen.getByText("114.4")).toHaveTextContent("°F");
    expect(screen.getByText("75.0")).toHaveTextContent("°F");
    expect(screen.getByText("mph").parentElement).toHaveTextContent("6.3 mph");
    expect(screen.getByText("Rain")).toHaveClass("text-blue-fg", "bg-blue-tint");
    expect(screen.getByLabelText("Track weather")).toHaveClass("border-l-blue");
  });
});
