import { describe, expect, it } from "vitest";
import type { RaceControl } from "@/api/types";
import {
  buildIncidentWindows,
  deriveTrackFlagState,
  normalizeRaceControl,
} from "./raceControl";

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

describe("deriveTrackFlagState", () => {
  it("tracks independent sector and global flags", () => {
    const state = deriveTrackFlagState(
      [
        rc({ date: iso(10), flag: "YELLOW", scope: "Sector", sector: 2 }),
        rc({ date: iso(12), flag: "YELLOW", scope: "Sector", sector: 3 }),
        rc({ date: iso(20), flag: "SAFETY_CAR", scope: "Track" }),
      ],
      START,
      START + 30_000,
    );

    expect(state).toEqual({
      globalFlag: "SAFETY_CAR",
      sectorFlags: {
        1: null,
        2: "YELLOW",
        3: "YELLOW",
      },
      updatedAtMs: START + 20_000,
    });
  });

  it("clears only scoped sector on green", () => {
    const state = deriveTrackFlagState(
      [
        rc({ date: iso(9), flag: "SAFETY_CAR", scope: "Track" }),
        rc({ date: iso(10), flag: "YELLOW", scope: "Sector", sector: 2 }),
        rc({ date: iso(18), flag: "GREEN", scope: "Sector", sector: 2 }),
      ],
      START,
      START + 30_000,
    );

    expect(state).toEqual({
      globalFlag: "SAFETY_CAR",
      sectorFlags: {
        1: null,
        2: null,
        3: null,
      },
      updatedAtMs: START + 18_000,
    });
  });

  it("returns null when no active flags remain after full clear", () => {
    const state = deriveTrackFlagState(
      [
        rc({ date: iso(8), flag: "YELLOW", scope: "Track" }),
        rc({ date: iso(12), flag: "GREEN", scope: "Track" }),
      ],
      START,
      START + 30_000,
    );

    expect(state).toBeNull();
  });

  it("captures RED flag as globalFlag", () => {
    const state = deriveTrackFlagState(
      [
        rc({ date: iso(10), flag: "YELLOW", scope: "Sector", sector: 1 }),
        rc({ date: iso(20), flag: "RED", scope: "Track", message: "RED FLAG" }),
      ],
      START,
      START + 30_000,
    );

    expect(state?.globalFlag).toBe("RED");
  });

  it("sorts unsorted entries by date before processing", () => {
    const state = deriveTrackFlagState(
      [
        rc({ date: iso(20), flag: "RED", scope: "Track", message: "RED FLAG" }),
        rc({ date: iso(10), flag: "GREEN", scope: "Track" }),
      ],
      START,
      START + 30_000,
    );

    // After sorting: GREEN at 10s, RED at 20s — result should be RED
    expect(state?.globalFlag).toBe("RED");
  });
});
