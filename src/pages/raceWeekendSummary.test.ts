import { describe, expect, it } from "vitest";
import type { Driver, RaceControl, SessionResult, Weather } from "@/api/types";
import {
  buildTopFinisherLabel,
  countRaceControlPhaseStarts,
  countRedFlags,
  formatSessionDateLabel,
  getLatestWeatherSnapshot,
} from "@/pages/raceWeekendSummary";

describe("raceWeekendSummary helpers", () => {
  it("formats valid session dates and rejects invalid values", () => {
    expect(formatSessionDateLabel("2025-03-16T14:00:00Z")).toBe("March 16, 2025");
    expect(formatSessionDateLabel("not-a-date")).toBeNull();
  });

  it("builds top finisher label with driver metadata", () => {
    const drivers: Driver[] = [
      {
        driver_number: 1,
        broadcast_name: "M VERSTAPPEN",
        full_name: "Max Verstappen",
        name_acronym: "VER",
        team_name: "Red Bull Racing",
        team_colour: "3671C6",
        first_name: "Max",
        last_name: "Verstappen",
        headshot_url: null,
        country_code: "NLD",
        session_key: 1,
        meeting_key: 1,
      },
    ];
    const results: SessionResult[] = [
      {
        position: 1,
        driver_number: 1,
        number_of_laps: 58,
        points: 25,
        dnf: false,
        dns: false,
        dsq: false,
        duration: null,
        gap_to_leader: null,
        meeting_key: 1,
        session_key: 1,
      },
    ];

    expect(buildTopFinisherLabel(results, drivers)).toBe("Max Verstappen (VER)");
  });

  it("falls back to driver number when winner profile is missing", () => {
    const results: SessionResult[] = [
      {
        position: 1,
        driver_number: 81,
        number_of_laps: 58,
        points: 25,
        dnf: false,
        dns: false,
        dsq: false,
        duration: null,
        gap_to_leader: null,
        meeting_key: 1,
        session_key: 1,
      },
    ];

    expect(buildTopFinisherLabel(results, [])).toBe("#81");
  });

  it("counts safety car and vsc starts from signal phases", () => {
    const signals = [
      { phase: "safety_car_start" },
      { phase: "vsc_start" },
      { phase: "safety_car_start" },
      { phase: "vsc_end" },
    ];

    expect(countRaceControlPhaseStarts(signals, "safety_car_start")).toBe(2);
    expect(countRaceControlPhaseStarts(signals, "vsc_start")).toBe(1);
  });

  it("counts red flags from race control entries", () => {
    const raceControlEntries: RaceControl[] = [
      {
        category: "Flag",
        date: "2025-03-16T14:00:00Z",
        driver_number: null,
        flag: "YELLOW",
        lap_number: 10,
        meeting_key: 1,
        message: "Yellow flag",
        qualifying_phase: null,
        scope: null,
        sector: null,
        session_key: 1,
      },
      {
        category: "Flag",
        date: "2025-03-16T14:05:00Z",
        driver_number: null,
        flag: "RED",
        lap_number: 12,
        meeting_key: 1,
        message: "Red flag",
        qualifying_phase: null,
        scope: null,
        sector: null,
        session_key: 1,
      },
      {
        category: "Flag",
        date: "2025-03-16T14:08:00Z",
        driver_number: null,
        flag: "RED",
        lap_number: 13,
        meeting_key: 1,
        message: "Red flag",
        qualifying_phase: null,
        scope: null,
        sector: null,
        session_key: 1,
      },
    ];

    expect(countRedFlags(raceControlEntries)).toBe(2);
  });

  it("returns latest weather snapshot", () => {
    const weather: Weather[] = [
      {
        air_temperature: 24,
        date: "2025-03-16T14:00:00Z",
        humidity: 50,
        meeting_key: 1,
        pressure: 1000,
        rainfall: 0,
        session_key: 1,
        track_temperature: 35,
        wind_direction: 180,
        wind_speed: 5,
      },
      {
        air_temperature: 26,
        date: "2025-03-16T14:05:00Z",
        humidity: 48,
        meeting_key: 1,
        pressure: 1001,
        rainfall: 0,
        session_key: 1,
        track_temperature: 37,
        wind_direction: 190,
        wind_speed: 4,
      },
    ];

    expect(getLatestWeatherSnapshot(weather)).toEqual(weather[1]);
    expect(getLatestWeatherSnapshot([])).toBeNull();
  });
});