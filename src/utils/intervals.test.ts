import { describe, expect, it } from "vitest";
import { latestIntervalRows, parseIntervalSeconds } from "./intervals";

describe("parseIntervalSeconds", () => {
  it("returns finite numeric values unchanged", () => {
    expect(parseIntervalSeconds(0.8)).toBe(0.8);
    expect(parseIntervalSeconds(1)).toBe(1);
  });

  it("parses numeric strings with optional plus prefix", () => {
    expect(parseIntervalSeconds("+0.842")).toBe(0.842);
    expect(parseIntervalSeconds("0.950")).toBe(0.95);
    expect(parseIntervalSeconds("  +1.200 ")).toBe(1.2);
  });

  it("returns null for non-numeric tokens", () => {
    expect(parseIntervalSeconds(null)).toBeNull();
    expect(parseIntervalSeconds("LAP")).toBeNull();
    expect(parseIntervalSeconds("PIT")).toBeNull();
    expect(parseIntervalSeconds(Number.NaN)).toBeNull();
    expect(parseIntervalSeconds(Number.POSITIVE_INFINITY)).toBeNull();
  });
});

describe("latestIntervalRows", () => {
  const row = (driver_number: number, sec: number, interval: number | string | null, gap: number | string | null) => ({
    date: new Date(Date.UTC(2024, 0, 1, 12, 0, sec)).toISOString(),
    driver_number,
    interval,
    gap_to_leader: gap,
    meeting_key: 1,
    session_key: 1,
  });

  it("keeps each driver's latest row up to the cutoff", () => {
    const out = latestIntervalRows(
      [row(1, 1, null, null), row(4, 1, 1.5, 1.5), row(4, 5, 0.9, 0.9), row(4, 20, 3, 3), row(81, 6, "+1 LAP", "+1 LAP")],
      Date.UTC(2024, 0, 1, 12, 0, 10),
    );
    expect(out.get(1)).toEqual({ interval: null, gap_to_leader: null });
    expect(out.get(4)).toEqual({ interval: 0.9, gap_to_leader: 0.9 });
    expect(out.get(81)).toEqual({ interval: "+1 LAP", gap_to_leader: "+1 LAP" });
  });
});
