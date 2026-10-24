import { describe, expect, it } from "vitest";
import type { Lap, RaceControl } from "@/api/types";
import { deletedLapKeys, lapKey, parseLapDeletions } from "./lapDeletions";

const BASE = Date.parse("2026-10-23T18:00:00.000Z");
const iso = (sec: number) => new Date(BASE + sec * 1000).toISOString();

const rc = (sec: number, message: string) =>
  ({ date: iso(sec), message }) as RaceControl;

const lap = (
  driver_number: number,
  lap_number: number,
  startSec: number,
  lap_duration: number | null,
) =>
  ({
    driver_number,
    lap_number,
    date_start: iso(startSec),
    lap_duration,
  }) as Lap;

describe("parseLapDeletions", () => {
  it("parses deletions and reinstatements, sorted by time", () => {
    const events = parseLapDeletions([
      rc(300, "CAR 27 (HUL) TIME 8:42.988 WILL BE REINSTATED"),
      rc(
        100,
        "CAR 3 (VER) TIME 1:35.860 DELETED - TRACK LIMITS AT TURN 19 LAP 15 13:07:21",
      ),
      rc(200, "CAR 6 (HAD) LAP DELETED - TRACK LIMITS AT TURN 20 (NEXT LAP PIT)"),
      rc(250, "TRACK LIMITS - CAR 3 (VER) TURN 19 LAP 15"),
    ]);
    expect(events).toEqual([
      { ms: BASE + 100_000, driverNumber: 3, lapTime: 95.86, kind: "deleted" },
      {
        ms: BASE + 300_000,
        driverNumber: 27,
        lapTime: 522.988,
        kind: "reinstated",
      },
    ]);
  });
});

describe("deletedLapKeys", () => {
  const laps = [lap(3, 14, 0, 95.86), lap(3, 15, 96, 101.2), lap(16, 14, 0, 96.052)];

  it("matches the lap by driver and time, not the message's lap number", () => {
    const events = parseLapDeletions([
      rc(120, "CAR 3 (VER) TIME 1:35.860 DELETED - TRACK LIMITS AT TURN 19 LAP 15 13:07:21"),
    ]);
    expect([...deletedLapKeys(events, laps)]).toEqual([
      lapKey({ driver_number: 3, lap_number: 14 }),
    ]);
  });

  it("restores a reinstated lap", () => {
    const events = parseLapDeletions([
      rc(120, "CAR 3 (VER) TIME 1:35.860 DELETED - TRACK LIMITS AT TURN 19 LAP 15"),
      rc(400, "CAR 3 (VER) TIME 1:35.860 WILL BE REINSTATED"),
    ]);
    expect(deletedLapKeys(events, laps).size).toBe(0);
  });

  it("ignores a deletion that matches no lap", () => {
    const events = parseLapDeletions([
      rc(120, "CAR 3 (VER) TIME 1:30.000 DELETED - TRACK LIMITS AT TURN 1"),
    ]);
    expect(deletedLapKeys(events, laps).size).toBe(0);
  });
});
