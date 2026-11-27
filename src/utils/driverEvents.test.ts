import { describe, expect, it } from "vitest";
import type { Lap, Overtake, Pit, RaceControl, TeamRadio } from "@/api/types";
import { buildDriverEvents, extractInvolvedDriverNumbers } from "./driverEvents";
import type { PitBattle } from "./undercut";

const sessionStartMs = Date.parse("2024-01-01T00:00:00Z");
const date = (seconds: number) => new Date(sessionStartMs + seconds * 1000).toISOString();
const base = {
  driverNumber: 1,
  raceControl: [] as RaceControl[],
  pits: [] as Pit[],
  overtakes: [] as Overtake[],
  radios: [] as TeamRadio[],
  laps: [] as Lap[],
  sessionStartMs,
  sessionTimeMs: 300_000,
};
const pit: Pit = {
  date: date(60), driver_number: 1, lap_number: 10, meeting_key: 1,
  session_key: 1, stop_duration: 2.4, lane_duration: 22, pit_duration: null,
};
const radio: TeamRadio = {
  date: date(90), driver_number: 1, meeting_key: 1, session_key: 1,
  recording_url: "https://example.com/radio.mp3",
};
const pass: Overtake = {
  date: date(80), overtaking_driver_number: 16, overtaken_driver_number: 1,
  position: 2, meeting_key: 1, session_key: 1,
};
const rc = (message: string, seconds = 100): RaceControl => ({
  message, date: date(seconds), driver_number: null, category: "Other",
  flag: null, lap_number: 2, meeting_key: 1, session_key: 1,
  scope: null, sector: null, qualifying_phase: null,
});
const lap = (driver: number, number: number, start: number, duration: number): Lap => ({
  date_start: date(start), driver_number: driver, lap_number: number,
  lap_duration: duration, is_pit_out_lap: false, meeting_key: 1, session_key: 1,
  duration_sector_1: null, duration_sector_2: null, duration_sector_3: null,
  segments_sector_1: null, segments_sector_2: null, segments_sector_3: null,
  i1_speed: null, i2_speed: null, st_speed: null,
});

describe("driver event history", () => {
  it("merges only the driver's elapsed events in reverse chronological order", () => {
    const events = buildDriverEvents({
      ...base,
      pits: [pit, { ...pit, driver_number: 16 }, { ...pit, date: date(400) }],
      radios: [radio, { ...radio, driver_number: 16 }],
      overtakes: [pass, { ...pass, overtaken_driver_number: 55 }],
      raceControl: [
        rc("CARS 1 (VER) AND 16 (LEC) INCIDENT NOTED"),
        rc("CAR 16 (LEC) 5 SECOND TIME PENALTY AT TURN 1"),
        rc("TRACK CLEAR"),
        rc("CAR 1 UNDER INVESTIGATION", 400),
        { ...rc("LAP TIME DELETED", 110), driver_number: 1 },
      ],
    });
    expect(events.map((event) => [event.kind, event.ms])).toEqual([
      ["race_control", 110_000], ["race_control", 100_000],
      ["radio", 90_000], ["overtake", 80_000], ["pit", 60_000],
    ]);
  });

  it("shows personal improvements and session records only after lap completion", () => {
    const events = buildDriverEvents({
      ...base,
      laps: [
        lap(16, 1, 0, 60), lap(1, 1, 0, 65),
        lap(1, 2, 65, 66), lap(1, 3, 131, 59),
        lap(1, 4, 190, 58), lap(1, 5, 248, 57),
      ],
    });
    expect(events.filter((event) => event.kind === "lap")
      .map((event) => [event.entry.lap_number, event.fastest])).toEqual([
      [4, true], [3, true], [1, false],
    ]);
  });

  it("excludes deleted times, out-laps, invalid and future data", () => {
    const events = buildDriverEvents({
      ...base,
      laps: [
        lap(1, 1, 0, 65), lap(1, 2, 65, 64),
        { ...lap(1, 3, 129, 63), is_pit_out_lap: true },
        { ...lap(1, 4, 192, 62), date_start: "invalid" },
      ],
      raceControl: [rc("CAR 1 (VER) TIME 1:04.000 DELETED - TRACK LIMITS", 150)],
      pits: [{ ...pit, date: "invalid" }],
    });
    expect(events.filter((event) => event.kind === "lap").map((event) => event.entry.lap_number))
      .toEqual([1]);
    expect(events.some((event) => event.kind === "pit")).toBe(false);
    const earlier = buildDriverEvents({
      ...base, sessionTimeMs: 140_000,
      laps: [lap(1, 1, 0, 65), lap(1, 2, 65, 64)],
      raceControl: [rc("CAR 1 (VER) TIME 1:04.000 DELETED - TRACK LIMITS", 150)],
    });
    expect(earlier.filter((event) => event.kind === "lap")).toHaveLength(2);
  });

  it("includes battles initiated by the rival without duplicating own pit rows", () => {
    const battle: PitBattle = {
      id: "battle", kind: "undercut", attacker: 16, defender: 1, firstStopper: 16,
      firstStopLap: 10, firstStopMs: 60_000, attackerDeficitS: 1,
      rivalStopLap: null, status: "pending", attackerAheadAfter: null,
      attackerGainS: null, resolvedMs: null, neutralised: false,
    };
    expect(buildDriverEvents({ ...base, pitBattles: [battle] })
      .map((event) => event.kind)).toEqual(["pit_battle"]);
    expect(buildDriverEvents({ ...base, pitBattles: [{ ...battle, firstStopper: 1 }], pits: [pit] })
      .map((event) => event.kind)).toEqual(["pit"]);
  });

  it("counts a lap in progress at the chequered flag but excludes cool-down laps", () => {
    const events = buildDriverEvents({
      ...base, lapStartCutoffMs: 120_000,
      laps: [lap(1, 1, 0, 65), lap(1, 2, 65, 64), lap(1, 3, 129, 63)],
    });
    expect(events.filter((event) => event.kind === "lap").map((event) => event.entry.lap_number))
      .toEqual([2, 1]);
  });

  it("reads explicit car lists without mistaking penalty, turn or lap numbers for drivers", () => {
    expect(extractInvolvedDriverNumbers("CARS 1 (VER), 16 (LEC) AND 55 (SAI) - TURN 4"))
      .toEqual([1, 16, 55]);
    expect(extractInvolvedDriverNumbers("CAR 16 (LEC) 5 SECOND PENALTY AT TURN 1 LAP 4"))
      .toEqual([16]);
  });
});
