import { describe, expect, it } from "vitest";
import type { Lap } from "@/api/types";
import { buildLapLookup, lapNumberAtMs } from "@/utils/lapLookup";

describe("lapLookup", () => {
  it("builds earliest lap starts and resolves lap numbers by event time", () => {
    const sessionStartMs = Date.parse("2024-01-01T00:00:00.000Z");
    const laps = [
      {
        date_start: "2024-01-01T00:01:32.000Z",
        driver_number: 81,
        duration_sector_1: null,
        duration_sector_2: null,
        duration_sector_3: null,
        i1_speed: null,
        i2_speed: null,
        is_pit_out_lap: false,
        lap_duration: 91.2,
        lap_number: 2,
        meeting_key: 1,
        segments_sector_1: null,
        segments_sector_2: null,
        segments_sector_3: null,
        session_key: 44,
        st_speed: null,
      },
      {
        date_start: "2024-01-01T00:00:00.000Z",
        driver_number: 1,
        duration_sector_1: null,
        duration_sector_2: null,
        duration_sector_3: null,
        i1_speed: null,
        i2_speed: null,
        is_pit_out_lap: false,
        lap_duration: 92.3,
        lap_number: 1,
        meeting_key: 1,
        segments_sector_1: null,
        segments_sector_2: null,
        segments_sector_3: null,
        session_key: 44,
        st_speed: null,
      },
      {
        date_start: "2024-01-01T00:01:31.000Z",
        driver_number: 1,
        duration_sector_1: null,
        duration_sector_2: null,
        duration_sector_3: null,
        i1_speed: null,
        i2_speed: null,
        is_pit_out_lap: false,
        lap_duration: 90.9,
        lap_number: 2,
        meeting_key: 1,
        segments_sector_1: null,
        segments_sector_2: null,
        segments_sector_3: null,
        session_key: 44,
        st_speed: null,
      },
    ] as Lap[];

    const lookup = buildLapLookup(laps, sessionStartMs);

    expect(lookup).toEqual([
      { lapNumber: 1, startMs: 0 },
      { lapNumber: 2, startMs: 91_000 },
    ]);
    expect(lapNumberAtMs(lookup, -1)).toBeNull();
    expect(lapNumberAtMs(lookup, 45_000)).toBe(1);
    expect(lapNumberAtMs(lookup, 91_000)).toBe(2);
  });
});
