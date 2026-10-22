import { describe, expect, it } from "vitest";
import type { Interval, Lap, Pit } from "@/api/types";
import { buildDriverTimeIndex } from "@/utils/driverTimeIndex";
import { detectPitBattles, formatBattleGain, pitBattleHeadline } from "./undercut";

const index = (rows: Interval[]) => buildDriverTimeIndex(rows, (r) => Date.parse(r.date));

const START = Date.parse("2026-05-01T13:00:00Z");
const LAP_MS = 90_000;
const iso = (ms: number) => new Date(START + ms).toISOString();

/** Every car's lap `n` runs from (n - 1) × 90 s to n × 90 s. */
function lapsFor(driverNumber: number, count: number): Lap[] {
  return Array.from(
    { length: count },
    (_, i) =>
      ({
        date_start: iso(i * LAP_MS),
        driver_number: driverNumber,
        lap_duration: LAP_MS / 1000,
        lap_number: i + 1,
        is_pit_out_lap: false,
      }) as Lap,
  );
}

/** Stop at the end of `lapNumber` (pit row dated mid in-lap). */
function pit(driverNumber: number, lapNumber: number): Pit {
  return {
    date: iso((lapNumber - 0.5) * LAP_MS),
    driver_number: driverNumber,
    lap_number: lapNumber,
    meeting_key: 1,
    session_key: 1,
    stop_duration: 2.4,
    lane_duration: 21,
    pit_duration: null,
  };
}

function gap(driverNumber: number, ms: number, gapToLeader: number): Interval {
  return {
    date: iso(ms),
    driver_number: driverNumber,
    gap_to_leader: gapToLeader,
    interval: null,
    meeting_key: 1,
    session_key: 1,
  };
}

const laps = [...lapsFor(1, 30), ...lapsFor(4, 30), ...lapsFor(16, 30)];
const ALL = 60 * 60_000;

// Car 16 runs 1.5 s behind car 4 before the stops; car 1 leads far ahead.
const beforeGaps = [gap(1, 9 * LAP_MS, 0), gap(4, 9 * LAP_MS, 10), gap(16, 9 * LAP_MS, 11.5)];

function battles(
  pits: Pit[],
  afterGaps: Interval[],
  cutoffMs = ALL,
  neutralised: { startMs: number; endMs: number | null }[] = [],
) {
  return detectPitBattles({
    pits,
    laps,
    intervals: index([...beforeGaps, ...afterGaps]),
    neutralised,
    sessionStartMs: START,
    cutoffMs,
  });
}

describe("detectPitBattles", () => {
  // 16 stops on lap 10, 4 answers on lap 11; measured after 4's out-lap (end of lap 12).
  const pits = [pit(16, 10), pit(4, 11)];

  it("scores a successful undercut by position and seconds", () => {
    const result = battles(pits, [gap(4, 12 * LAP_MS, 31), gap(16, 12 * LAP_MS, 30.2)]);
    expect(result).toEqual([
      expect.objectContaining({
        kind: "undercut",
        attacker: 16,
        defender: 4,
        firstStopLap: 10,
        rivalStopLap: 11,
        status: "resolved",
        attackerAheadAfter: true,
        attackerGainS: expect.closeTo(2.3, 6),
        resolvedMs: 12 * LAP_MS,
        neutralised: false,
      }),
    ]);
  });

  it("scores a failed undercut", () => {
    const [battle] = battles(pits, [gap(4, 12 * LAP_MS, 30), gap(16, 12 * LAP_MS, 30.5)]);
    expect(battle).toMatchObject({ attackerAheadAfter: false, attackerGainS: expect.closeTo(1, 6) });
  });

  it("scores the car that stayed out as an overcut attempt when the leader stops first", () => {
    const [battle] = battles([pit(4, 10), pit(16, 11)], [
      gap(4, 12 * LAP_MS, 30.5),
      gap(16, 12 * LAP_MS, 30),
    ]);
    expect(battle).toMatchObject({
      kind: "overcut",
      attacker: 16,
      defender: 4,
      attackerAheadAfter: true,
      attackerGainS: expect.closeTo(2, 6),
    });
  });

  it("is pending while the rival stays out, without revealing whether they stop", () => {
    // Playhead early in lap 11: 16 has stopped, 4 hasn't yet.
    const pending = battles(pits, [], 10.2 * LAP_MS);
    expect(pending).toEqual([
      expect.objectContaining({
        kind: "undercut",
        attacker: 16,
        defender: 4,
        status: "pending",
        rivalStopLap: null,
        attackerAheadAfter: null,
        attackerGainS: null,
      }),
    ]);
    // Same playhead, rival never stops: identical result (no spoiler).
    expect(battles([pit(16, 10)], [], 10.2 * LAP_MS)).toEqual(pending);
  });

  it("stays pending through the rival's out-lap", () => {
    const [battle] = battles(pits, [gap(4, 12 * LAP_MS, 31), gap(16, 12 * LAP_MS, 30.2)], 11.5 * LAP_MS);
    expect(battle).toMatchObject({ status: "pending", rivalStopLap: 11 });
  });

  it("drops the battle once the rival stays out too long", () => {
    expect(battles([pit(16, 10), pit(4, 20)], [])).toEqual([]);
    expect(battles([pit(16, 10)], [], 25 * LAP_MS)).toEqual([]);
  });

  it("ignores cars too far apart and cars stopping on the same lap", () => {
    expect(
      detectPitBattles({
        pits,
        laps,
        intervals: index([gap(4, 9 * LAP_MS, 10), gap(16, 9 * LAP_MS, 20)]),
        neutralised: [],
        sessionStartMs: START,
        cutoffMs: ALL,
      }),
    ).toEqual([]);
    expect(battles([pit(16, 10), pit(4, 10)], [])).toEqual([]);
  });

  it("pairs a stop only with the cars directly ahead and behind", () => {
    // 4 → 16 → 44 nose to tail; 44 stops first and can only be fighting 16.
    const result = detectPitBattles({
      pits: [pit(44, 10), pit(4, 11), pit(16, 11)],
      laps: [...laps, ...lapsFor(44, 30)],
      intervals: index([...beforeGaps, gap(44, 9 * LAP_MS, 12.5)]),
      neutralised: [],
      sessionStartMs: START,
      cutoffMs: 10.2 * LAP_MS,
    });
    expect(result.map((b) => [b.attacker, b.defender])).toEqual([[44, 16]]);
  });

  it("ignores stops before the field has settled", () => {
    const early = (stopLap: number) =>
      battles(
        [pit(16, stopLap), pit(4, stopLap + 1)],
        [gap(4, (stopLap - 1) * LAP_MS, 10), gap(16, (stopLap - 1) * LAP_MS, 11.5)],
      );
    expect(early(4)).toEqual([]);
    expect(early(5)).toHaveLength(1);
  });

  it("flags battles a Safety Car / VSC interfered with", () => {
    const [battle] = battles(
      pits,
      [gap(4, 12 * LAP_MS, 31), gap(16, 12 * LAP_MS, 30.2)],
      ALL,
      [{ startMs: 11 * LAP_MS, endMs: 11.5 * LAP_MS }],
    );
    expect(battle!.neutralised).toBe(true);
  });
});

describe("pit battle labels", () => {
  it("headlines the position outcome", () => {
    expect(pitBattleHeadline({ kind: "undercut", attackerAheadAfter: true })).toBe("Undercut worked");
    expect(pitBattleHeadline({ kind: "overcut", attackerAheadAfter: false })).toBe("Overcut failed");
    expect(pitBattleHeadline({ kind: "undercut", attackerAheadAfter: null })).toBe("Undercut on");
  });

  it("formats the seconds gained", () => {
    expect(formatBattleGain(2.34)).toBe("+2.3 s");
    expect(formatBattleGain(-0.76)).toBe("−0.8 s");
    expect(formatBattleGain(0.01)).toBe("±0.0 s");
  });
});
