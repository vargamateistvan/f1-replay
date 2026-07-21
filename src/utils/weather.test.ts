import { describe, expect, it } from "vitest";
import type { Weather } from "@/api/types";
import { weatherAtSessionTime } from "@/utils/weather";

describe("weatherAtSessionTime", () => {
  it("resolves the latest weather sample at or before the replay time", () => {
    const sessionStartMs = Date.parse("2024-01-01T00:00:00.000Z");
    const entries = [
      {
        air_temperature: 18.1,
        date: "2024-01-01T00:00:15.000Z",
        humidity: 48,
        meeting_key: 1,
        pressure: 1014,
        rainfall: 0,
        session_key: 77,
        track_temperature: 27.4,
        wind_direction: 315,
        wind_speed: 2.1,
      },
      {
        air_temperature: 18.6,
        date: "2024-01-01T00:02:30.000Z",
        humidity: 51,
        meeting_key: 1,
        pressure: 1013.5,
        rainfall: 0,
        session_key: 77,
        track_temperature: 28.9,
        wind_direction: 320,
        wind_speed: 2.4,
      },
    ] as Weather[];

    expect(weatherAtSessionTime(entries, sessionStartMs, 0)).toBeNull();
    expect(weatherAtSessionTime(entries, sessionStartMs, 30_000)).toEqual(
      entries[0],
    );
    expect(weatherAtSessionTime(entries, sessionStartMs, 180_000)).toEqual(
      entries[1],
    );
  });
});
