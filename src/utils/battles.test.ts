import { describe, expect, it } from "vitest";
import { battlingFrom, computeBattlingDrivers, latestIntervalSeconds } from "./battles";
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

describe("latestIntervalSeconds / battlingFrom", () => {
  const row = (driver_number: number, date: string, interval: Interval["interval"]): Interval => ({
    gap_to_leader: null,
    meeting_key: 1,
    session_key: 1,
    driver_number,
    date,
    interval,
  });

  it("keeps each driver's latest numeric interval up to the cutoff", () => {
    const seconds = latestIntervalSeconds(
      [
        row(1, "2024-01-01T00:00:00Z", 1.5),
        row(1, "2024-01-01T00:00:01Z", 0.8),
        row(1, "2024-01-01T00:00:09Z", 3),
        row(4, "2024-01-01T00:00:01Z", "+1 LAP"),
      ],
      Date.parse("2024-01-01T00:00:02Z"),
    );
    expect([...seconds]).toEqual([[1, 0.8]]);
  });

  it("picks the drivers within the gap", () => {
    expect([...battlingFrom(new Map([[1, 0.8], [2, 1.2], [3, 1]]), 1)]).toEqual([1, 3]);
  });
});
