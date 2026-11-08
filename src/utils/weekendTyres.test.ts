import { describe, expect, it } from "vitest";
import type { Stint } from "@/api/types";
import { estimateWeekendTyres } from "./weekendTyres";

const stint = (
  driver_number: number,
  compound: Stint["compound"],
  tyre_age_at_start: number,
): Stint => ({
  driver_number,
  compound,
  tyre_age_at_start,
  lap_start: 1,
  lap_end: 10,
  stint_number: 1,
  meeting_key: 1,
  session_key: 1,
});

describe("estimateWeekendTyres", () => {
  it("counts fresh sets by driver and compound, ignoring reused and unknown sets", () => {
    const estimates = estimateWeekendTyres([
      stint(44, "SOFT", 0),
      stint(44, "SOFT", 12),
      stint(44, "SOFT", 0),
      stint(44, "MEDIUM", 0),
      stint(1, "HARD", 0),
      stint(1, "UNKNOWN", 0),
    ]);

    expect(estimates).toHaveLength(2);
    expect(estimates[0].driverNumber).toBe(1);
    expect(estimates[0].compounds.find(({ compound }) => compound === "HARD")).toEqual({
      compound: "HARD",
      allocated: 2,
      used: 1,
      remaining: 1,
    });
    expect(estimates[1].driverNumber).toBe(44);
    expect(estimates[1].compounds.find(({ compound }) => compound === "SOFT")).toEqual({
      compound: "SOFT",
      allocated: 8,
      used: 2,
      remaining: 6,
    });
  });

  it("does not report negative remaining sets when observed stints exceed the allocation", () => {
    const estimates = estimateWeekendTyres(
      Array.from({ length: 9 }, () => stint(1, "SOFT", 0)),
    );

    expect(estimates[0].compounds.find(({ compound }) => compound === "SOFT")).toMatchObject({
      used: 9,
      remaining: 0,
    });
  });
});
