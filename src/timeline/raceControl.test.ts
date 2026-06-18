import { describe, expect, it } from "vitest";
import type { RaceControl } from "@/api/types";
import { buildIncidentWindows, normalizeRaceControl } from "./raceControl";

const START = new Date("2024-01-01T00:00:00Z").getTime();
const iso = (sec: number) => new Date(START + sec * 1000).toISOString();

function rc(partial: Partial<RaceControl>): RaceControl {
  return {
    category: "Flag",
    date: iso(0),
    driver_number: null,
    flag: null,
    lap_number: null,
    meeting_key: 1,
    message: "",
    qualifying_phase: null,
    scope: "Track",
    sector: null,
    session_key: 1,
    ...partial,
  };
}

describe("buildIncidentWindows safety control phases", () => {
  it("opens and closes a safety-car window from message phrases", () => {
    const events = normalizeRaceControl(
      [
        rc({ date: iso(10), message: "SAFETY CAR DEPLOYED", lap_number: 12 }),
        rc({
          date: iso(55),
          message: "SAFETY CAR IN THIS LAP",
          lap_number: 15,
        }),
      ],
      START,
    );

    expect(buildIncidentWindows(events)).toEqual([
      {
        id: "safety_car-10000",
        kind: "safety_car",
        label: "Safety Car",
        startMs: 10_000,
        endMs: 55_000,
        startLap: 12,
      },
    ]);
  });

  it("handles VSC alias flags and VSC ending message", () => {
    const events = normalizeRaceControl(
      [
        rc({
          date: iso(20),
          flag: "VIRTUAL_SAFETY_CAR",
          message: "VIRTUAL SAFETY CAR DEPLOYED",
          lap_number: 8,
        }),
        rc({ date: iso(36), message: "VSC ENDING", lap_number: 9 }),
      ],
      START,
    );

    expect(buildIncidentWindows(events)).toEqual([
      {
        id: "vsc-20000",
        kind: "vsc",
        label: "Virtual SC",
        startMs: 20_000,
        endMs: 36_000,
        startLap: 8,
      },
    ]);
  });
});
