import { describe, expect, it } from "vitest";
import type { Stint } from "@/api/types";
import { tyreForLap } from "./lapContext";

function stint(partial: Partial<Stint>): Stint {
  return {
    compound: "SOFT",
    driver_number: 1,
    lap_start: 1,
    lap_end: 10,
    meeting_key: 1,
    session_key: 1,
    stint_number: 1,
    tyre_age_at_start: 0,
    ...partial,
  };
}

describe("tyreForLap", () => {
  const stints = [
    stint({ lap_start: 1, lap_end: 10, tyre_age_at_start: 3 }),
    stint({ compound: "HARD", lap_start: 11, lap_end: 30, stint_number: 2 }),
    stint({ driver_number: 44, compound: "MEDIUM", lap_start: 1, lap_end: 30 }),
  ];

  it("finds the stint covering the lap and includes pre-stint age", () => {
    expect(tyreForLap(stints, 1, 5)).toEqual({
      compound: "SOFT",
      age: 7,
      stintNumber: 1,
    });
  });

  it("matches the correct driver and later stints", () => {
    expect(tyreForLap(stints, 1, 11)).toEqual({
      compound: "HARD",
      age: 0,
      stintNumber: 2,
    });
    expect(tyreForLap(stints, 44, 11)?.compound).toBe("MEDIUM");
  });

  it("returns null when no stint covers the lap", () => {
    expect(tyreForLap(stints, 1, 31)).toBeNull();
    expect(tyreForLap(stints, 99, 1)).toBeNull();
  });
});
