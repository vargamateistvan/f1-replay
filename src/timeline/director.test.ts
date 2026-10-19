import { describe, expect, it } from "vitest";
import type { Overtake, Pit, Position } from "@/api/types";
import {
  DIRECTOR_MAX_SHOT_MS,
  DIRECTOR_MIN_SHOT_MS,
  DIRECTOR_OVERTAKE_AFTER_MS,
  DIRECTOR_OVERTAKE_LEAD_MS,
  DIRECTOR_PIT_AFTER_MS,
  DIRECTOR_PIT_FALLBACK_LANE_MS,
  DIRECTOR_PIT_LEAD_MS,
} from "@/constants";
import {
  INITIAL_DIRECTOR_STATE,
  battleGaps,
  battlePairs,
  buildDirectorCues,
  buildPositionIndex,
  cameraForShot,
  candidateShots,
  pickShot,
  positionsAt,
  shotCaption,
  type DirectorContext,
  type DirectorCue,
  type DirectorState,
} from "./director";

const START = new Date("2024-01-01T00:00:00Z").getTime();
const iso = (sec: number) => new Date(START + sec * 1000).toISOString();

const overtake = (sec: number, by: number, on: number, position: number | null): Overtake => ({
  date: iso(sec),
  overtaking_driver_number: by,
  overtaken_driver_number: on,
  position,
  meeting_key: 1,
  session_key: 1,
});

const pit = (sec: number, driver: number, lane: number | null): Pit => ({
  date: iso(sec),
  driver_number: driver,
  lap_number: 10,
  meeting_key: 1,
  stop_duration: null,
  lane_duration: lane,
  pit_duration: null,
  session_key: 1,
});

const pos = (sec: number, driver: number, position: number): Position => ({
  date: iso(sec),
  driver_number: driver,
  position,
  meeting_key: 1,
  session_key: 1,
});

const ctx = (t: number, partial: Partial<DirectorContext> = {}): DirectorContext => ({
  t,
  battles: [],
  leader: 1,
  ...partial,
});

describe("buildDirectorCues", () => {
  it("anticipates overtakes and spans the pit lane, sorted by start", () => {
    const cues = buildDirectorCues(
      [overtake(100, 4, 16, 3)],
      [pit(50, 44, 21.5), pit(200, 63, null)],
      START,
    );
    expect(cues.map((c) => c.kind)).toEqual(["pit", "overtake", "pit"]);
    expect(cues[0]).toMatchObject({
      driver: 44,
      startMs: 50_000 - DIRECTOR_PIT_LEAD_MS,
      endMs: 50_000 + 21_500 + DIRECTOR_PIT_AFTER_MS,
    });
    expect(cues[1]).toMatchObject({
      driver: 4,
      other: 16,
      position: 3,
      startMs: 100_000 - DIRECTOR_OVERTAKE_LEAD_MS,
      endMs: 100_000 + DIRECTOR_OVERTAKE_AFTER_MS,
    });
    expect(cues[2]!.endMs).toBe(200_000 + DIRECTOR_PIT_FALLBACK_LANE_MS + DIRECTOR_PIT_AFTER_MS);
  });
});

describe("positions and battles", () => {
  const index = buildPositionIndex([
    pos(0, 1, 1),
    pos(0, 4, 2),
    pos(0, 16, 3),
    pos(0, 44, 4),
    pos(60, 16, 2),
    pos(60, 4, 3),
  ]);

  it("steps positions to the playhead", () => {
    expect(positionsAt(index, START + 30_000).get(16)).toBe(3);
    expect(positionsAt(index, START + 61_000).get(16)).toBe(2);
    expect(positionsAt(index, START - 1).size).toBe(0);
  });

  it("pairs each chaser with the car ahead, front-most first", () => {
    const positions = positionsAt(index, START + 30_000);
    expect(battlePairs(positions, new Set([44, 4, 1]))).toEqual([
      { chaser: 4, ahead: 1, position: 2 },
      { chaser: 44, ahead: 16, position: 4 },
    ]);
  });

  it("drops battles involving retired cars", () => {
    const positions = positionsAt(index, START + 30_000);
    expect(battlePairs(positions, new Set([4, 44]), new Set([16]))).toEqual([
      { chaser: 4, ahead: 1, position: 2 },
    ]);
  });
});

describe("candidateShots", () => {
  const cues: DirectorCue[] = [
    { kind: "pit", startMs: 0, endMs: 30_000, driver: 44, other: null, position: null },
    { kind: "overtake", startMs: 5_000, endMs: 20_000, driver: 16, other: 4, position: 8 },
    { kind: "overtake", startMs: 6_000, endMs: 20_000, driver: 81, other: 63, position: 2 },
  ];

  it("ranks overtakes > pits > battles > leader, front-most first", () => {
    const shots = candidateShots(
      cues,
      ctx(10_000, { battles: [{ chaser: 11, ahead: 1, position: 2 }] }),
    );
    expect(shots.map((s) => [s.kind, s.driver])).toEqual([
      ["overtake", 81],
      ["overtake", 16],
      ["pit", 44],
      ["battle", 11],
      ["leader", 1],
    ]);
  });

  it("skips cues outside their window and retired drivers", () => {
    const shots = candidateShots(cues, ctx(25_000, { excluded: new Set([44]) }));
    expect(shots.map((s) => s.kind)).toEqual(["leader"]);
  });
});

describe("pickShot", () => {
  const overtakeCue: DirectorCue = {
    kind: "overtake",
    startMs: 20_000,
    endMs: 30_000,
    driver: 16,
    other: 4,
    position: 3,
  };
  const battle = { chaser: 44, ahead: 63, position: 5 };

  const run = (
    steps: Array<[t: number, wall: number, partial?: Partial<DirectorContext>]>,
    cues: DirectorCue[] = [overtakeCue],
  ): DirectorState => {
    let state = INITIAL_DIRECTOR_STATE;
    for (const [t, wall, partial] of steps) state = pickShot(cues, ctx(t, partial), state, wall);
    return state;
  };

  it("starts on the best shot", () => {
    expect(run([[0, 0]]).shot).toMatchObject({ kind: "leader", driver: 1 });
  });

  it("holds a shot for the minimum time before cutting", () => {
    const state = run([
      [0, 0, { battles: [battle] }],
      [21_000, DIRECTOR_MIN_SHOT_MS - 1, { battles: [battle] }],
    ]);
    expect(state.shot).toMatchObject({ kind: "battle", driver: 44 });
  });

  it("cuts to a higher-priority story once the minimum has passed", () => {
    const state = run([
      [0, 0, { battles: [battle] }],
      [21_000, DIRECTOR_MIN_SHOT_MS, { battles: [battle] }],
    ]);
    expect(state.shot).toMatchObject({ kind: "overtake", driver: 16, other: 4 });
    expect(state.cutAtWall).toBe(DIRECTOR_MIN_SHOT_MS);
  });

  it("cuts away when the story ends", () => {
    const state = run([
      [0, 0, { battles: [battle] }],
      [1_000, DIRECTOR_MIN_SHOT_MS + 1, { battles: [] }],
    ]);
    expect(state.shot).toMatchObject({ kind: "leader", driver: 1 });
  });

  it("rotates away from a long battle to another storyline", () => {
    const other = { chaser: 22, ahead: 3, position: 9 };
    const state = run(
      [
        [0, 0, { battles: [battle, other] }],
        [1_000, DIRECTOR_MAX_SHOT_MS, { battles: [battle, other] }],
      ],
      [],
    );
    expect(state.shot).toMatchObject({ kind: "battle", driver: 22 });
  });

  it("keeps a long shot when there's nothing else to show", () => {
    const state = run(
      [
        [0, 0, { battles: [battle], leader: null }],
        [1_000, DIRECTOR_MAX_SHOT_MS, { battles: [battle], leader: null }],
      ],
      [],
    );
    expect(state.shot).toMatchObject({ kind: "battle", driver: 44 });
    expect(state.cutAtWall).toBe(0);
  });

  it("re-picks immediately after a seek", () => {
    const state = run([
      [0, 0, { battles: [battle] }],
      [25_000 + 120_000, 10, { battles: [battle] }],
      [25_000, 20, { battles: [battle] }],
    ]);
    expect(state.shot).toMatchObject({ kind: "overtake", driver: 16 });
  });

  it("drops a car that retires mid-shot", () => {
    const state = run([
      [0, 0, { battles: [battle] }],
      [500, 100, { battles: [], excluded: new Set([44]) }],
    ]);
    expect(state.shot).toMatchObject({ kind: "leader" });
  });
});

describe("cameraForShot", () => {
  it("chases wheel-to-wheel action and follows the rest", () => {
    expect(cameraForShot("overtake")).toBe("chase");
    expect(cameraForShot("battle")).toBe("chase");
    expect(cameraForShot("pit")).toBe("follow");
    expect(cameraForShot("leader")).toBe("follow");
  });
});

describe("shotCaption", () => {
  const acr = (n: number) => ({ 4: "NOR", 81: "PIA", 44: "HAM" })[n] ?? String(n);
  it("describes each kind of shot", () => {
    expect(shotCaption({ kind: "overtake", driver: 4, other: 81, position: 1 }, acr)).toBe(
      "NOR attacking PIA for P1",
    );
    expect(shotCaption({ kind: "battle", driver: 4, other: 81, position: 2 }, acr)).toBe(
      "NOR chasing PIA for P1",
    );
    expect(shotCaption({ kind: "pit", driver: 44, other: null, position: null }, acr)).toBe(
      "HAM in the pits",
    );
    expect(shotCaption({ kind: "leader", driver: 81, other: null, position: 1 }, acr)).toBe(
      "Leader · PIA",
    );
  });
});

describe("battleGaps", () => {
  it("labels each battle with the chaser's interval, dropping unknown ones", () => {
    expect(
      battleGaps(
        [
          { chaser: 4, ahead: 1, position: 2 },
          { chaser: 16, ahead: 44, position: 5 },
        ],
        new Map([[4, 0.42]]),
      ),
    ).toEqual([{ chaser: 4, ahead: 1, gap: 0.42 }]);
  });
});
