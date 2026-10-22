import { describe, expect, it } from "vitest";
import type { Lap, Pit, Stint } from "@/api/types";
import type { IncidentWindow } from "@/timeline/raceControl";
import {
  cleanRaceLaps,
  compoundPaceSummary,
  fitStintPace,
  neutralisedWindows,
  type PaceLap,
  type StintPace,
} from "./racePace";

const START = Date.parse("2026-05-01T13:00:00Z");
const LAP_S = 90;

/** Lap `n` starts at (n - 1) × 90 s into the session. */
function lap(n: number, partial: Partial<Lap> = {}): Lap {
  return {
    date_start: new Date(START + (n - 1) * LAP_S * 1000).toISOString(),
    driver_number: 1,
    duration_sector_1: null,
    duration_sector_2: null,
    duration_sector_3: null,
    i1_speed: null,
    i2_speed: null,
    is_pit_out_lap: false,
    lap_duration: LAP_S,
    lap_number: n,
    meeting_key: 1,
    segments_sector_1: null,
    segments_sector_2: null,
    segments_sector_3: null,
    session_key: 1,
    st_speed: null,
    ...partial,
  };
}

function stint(partial: Partial<Stint> = {}): Stint {
  return {
    compound: "MEDIUM",
    driver_number: 1,
    lap_start: 1,
    lap_end: 30,
    meeting_key: 1,
    session_key: 1,
    stint_number: 1,
    tyre_age_at_start: 0,
    ...partial,
  };
}

function pit(lapNumber: number): Pit {
  return {
    date: new Date(START + lapNumber * LAP_S * 1000).toISOString(),
    driver_number: 1,
    lap_number: lapNumber,
    meeting_key: 1,
    stop_duration: 2.5,
    lane_duration: 22,
    pit_duration: null,
    session_key: 1,
  };
}

const ALL_TIME = 10 * 60 * 60 * 1000;

function laps(count: number): Lap[] {
  return Array.from({ length: count }, (_, i) => lap(i + 1));
}

function lapNumbers(paceLaps: PaceLap[]): number[] {
  return paceLaps.map((l) => l.lapNumber);
}

describe("cleanRaceLaps", () => {
  const base = {
    stints: [stint()],
    pits: [] as Pit[],
    neutralised: [],
    sessionStartMs: START,
    cutoffMs: ALL_TIME,
  };

  it("drops lap 1, pit out-laps and in-laps", () => {
    const input = laps(6);
    input[3] = lap(4, { is_pit_out_lap: true });
    const out = cleanRaceLaps({ ...base, laps: input, pits: [pit(3)] });
    expect(lapNumbers(out)).toEqual([2, 5, 6]);
  });

  it("drops laps that overlap a Safety Car / VSC / red flag window", () => {
    // Lap 3 runs 180–270 s; a window from 200 s to 300 s also touches lap 4.
    const out = cleanRaceLaps({
      ...base,
      laps: laps(6),
      neutralised: [{ startMs: 200_000, endMs: 300_000 }],
    });
    expect(lapNumbers(out)).toEqual([2, 5, 6]);
  });

  it("treats a still-open window as running to the cutoff", () => {
    const out = cleanRaceLaps({
      ...base,
      laps: laps(6),
      neutralised: [{ startMs: 290_000, endMs: null }],
    });
    expect(lapNumbers(out)).toEqual([2, 3]);
  });

  it("never uses a lap that hasn't finished by the playhead", () => {
    // Lap 4 ends at 360 s.
    expect(lapNumbers(cleanRaceLaps({ ...base, laps: laps(6), cutoffMs: 359_999 }))).toEqual([
      2, 3,
    ]);
    expect(lapNumbers(cleanRaceLaps({ ...base, laps: laps(6), cutoffMs: 360_000 }))).toEqual([
      2, 3, 4,
    ]);
  });

  it("drops laps without a time or a stint", () => {
    const input = laps(5);
    input[2] = lap(3, { lap_duration: null });
    const out = cleanRaceLaps({ ...base, laps: input, stints: [stint({ lap_end: 4 })] });
    expect(lapNumbers(out)).toEqual([2, 4]);
  });

  it("drops traffic / mistake laps much slower than the stint median", () => {
    const input = laps(8);
    input[4] = lap(5, { lap_duration: LAP_S * 1.1 });
    const out = cleanRaceLaps({ ...base, laps: input });
    expect(lapNumbers(out)).toEqual([2, 3, 4, 6, 7, 8]);
  });

  it("attaches compound, tyre age and stint", () => {
    const out = cleanRaceLaps({
      ...base,
      laps: laps(3),
      stints: [stint({ compound: "SOFT", tyre_age_at_start: 2 })],
    });
    expect(out[0]).toEqual({
      driverNumber: 1,
      lapNumber: 2,
      lapS: LAP_S,
      tyreAge: 3,
      compound: "SOFT",
      stintNumber: 1,
    });
  });
});

/** `count` lap times starting at `first`, `step` s slower each lap. */
function ramp(first: number, step: number, count: number): number[] {
  return Array.from({ length: count }, (_, i) => first + step * i);
}

describe("fitStintPace", () => {
  function paceLaps(times: number[], firstLap = 2, firstAge = 1): PaceLap[] {
    return times.map((lapS, i) => ({
      driverNumber: 1,
      lapNumber: firstLap + i,
      lapS,
      tyreAge: firstAge + i,
      compound: "HARD",
      stintNumber: 2,
    }));
  }

  it("fits lap time against tyre age per stint", () => {
    const [fit] = fitStintPace(paceLaps(ramp(90.1, 0.1, 8)));
    expect(fit).toMatchObject({ driverNumber: 1, stintNumber: 2, compound: "HARD" });
    expect(fit!.degSPerLap).toBeCloseTo(0.1, 6);
    expect(fit!.baseS).toBeCloseTo(90.0, 6);
    expect(fit!.r2).toBeCloseTo(1, 6);
    expect(fit!.laps).toHaveLength(8);
  });

  it("skips stints with too few clean laps", () => {
    expect(fitStintPace(paceLaps(ramp(90.1, 0.1, 7)))).toEqual([]);
  });

  it("fits each driver's stints separately", () => {
    const other = paceLaps(ramp(91, 0, 8)).map((l) => ({ ...l, driverNumber: 44 }));
    const fits = fitStintPace([...paceLaps(ramp(90, 0.2, 8)), ...other]);
    expect(fits.map((f) => [f.driverNumber, f.degSPerLap])).toEqual([
      [1, expect.closeTo(0.2, 6)],
      [44, expect.closeTo(0, 6)],
    ]);
  });

  it("fuel correction adds back the time burnt fuel hides", () => {
    // Flat raw times on a car losing 0.05 s/lap of fuel weight = 0.05 s/lap of wear.
    const [raw] = fitStintPace(paceLaps(ramp(90, 0, 8)));
    const [fuel] = fitStintPace(paceLaps(ramp(90, 0, 8)), { fuelSPerLap: 0.05 });
    expect(raw!.degSPerLap).toBeCloseTo(0, 6);
    expect(fuel!.degSPerLap).toBeCloseTo(0.05, 6);
  });
});

describe("neutralisedWindows", () => {
  it("keeps Safety Car, VSC and red flag periods but not yellows", () => {
    const window = (kind: IncidentWindow["kind"], startMs: number): IncidentWindow => ({
      id: `${kind}-${startMs}`,
      kind,
      label: kind,
      startMs,
      endMs: startMs + 1000,
      startLap: null,
    });
    expect(
      neutralisedWindows([
        window("yellow_flag", 0),
        window("safety_car", 10),
        window("vsc", 20),
        window("red_flag", 30),
      ]),
    ).toEqual([
      { startMs: 10, endMs: 1010 },
      { startMs: 20, endMs: 1020 },
      { startMs: 30, endMs: 1030 },
    ]);
  });
});

describe("compoundPaceSummary", () => {
  const fit = (driverNumber: number, compound: StintPace["compound"], degSPerLap: number): StintPace => ({
    driverNumber,
    stintNumber: 1,
    compound,
    baseS: 90,
    degSPerLap,
    r2: 1,
    laps: [],
  });

  it("gives each compound's median and best stint, softest first", () => {
    const summary = compoundPaceSummary([
      fit(1, "HARD", 0.05),
      fit(4, "MEDIUM", 0.08),
      fit(16, "HARD", 0.02),
      fit(44, "HARD", 0.09),
      fit(63, "MEDIUM", 0.04),
    ]);
    expect(summary.map((c) => [c.compound, c.stints, c.best.driverNumber])).toEqual([
      ["MEDIUM", 2, 63],
      ["HARD", 3, 16],
    ]);
    expect(summary[0]!.medianDegSPerLap).toBeCloseTo(0.06, 6);
    expect(summary[1]!.medianDegSPerLap).toBeCloseTo(0.05, 6);
  });
});
