import { describe, expect, it } from "vitest";
import { computeBattlingDrivers } from "./battles";
import type { Interval } from "@/api/types";

describe("computeBattlingDrivers", () => {
  const base: Omit<Interval, "driver_number" | "date" | "interval"> = {
    gap_to_leader: null,
    meeting_key: 1,
    session_key: 1,
  };

  it("keeps latest snapshot per driver up to cutoff", () => {
    const intervals: Interval[] = [
      {
        ...base,
        driver_number: 1,
        date: "2024-01-01T00:00:00Z",
        interval: 1.5,
      },
      {
        ...base,
        driver_number: 1,
        date: "2024-01-01T00:00:01Z",
        interval: 0.8,
      },
    ];

    const out = computeBattlingDrivers(
      intervals,
      Date.parse("2024-01-01T00:00:02Z"),
    );

    expect([...out]).toEqual([1]);
  });

  it("ignores rows after cutoff", () => {
    const intervals: Interval[] = [
      {
        ...base,
        driver_number: 4,
        date: "2024-01-01T00:00:00Z",
        interval: 0.6,
      },
      {
        ...base,
        driver_number: 4,
        date: "2024-01-01T00:00:05Z",
        interval: 2.0,
      },
    ];

    const out = computeBattlingDrivers(
      intervals,
      Date.parse("2024-01-01T00:00:01Z"),
    );

    expect([...out]).toEqual([4]);
  });

  it("supports string interval values and ignores non-gap tokens", () => {
    const intervals: Interval[] = [
      {
        ...base,
        driver_number: 10,
        date: "2024-01-01T00:00:01Z",
        interval: "+0.95",
      },
      {
        ...base,
        driver_number: 11,
        date: "2024-01-01T00:00:01Z",
        interval: "LAP",
      },
    ];

    const out = computeBattlingDrivers(
      intervals,
      Date.parse("2024-01-01T00:00:02Z"),
    );

    expect([...out]).toEqual([10]);
  });
});
