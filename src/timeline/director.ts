/**
 * Auto-director for the 3D map's "TV" camera: picks which car to show and
 * when to cut, like a broadcast director.
 *
 * Shots, by priority: an overtake (cut to it a few seconds before it happens,
 * since historical data lets us look ahead), a pit stop, the front-most
 * battle (< 1 s), and the race leader as the fallback. Cuts are held for a
 * minimum *wall-clock* time so 16× playback doesn't strobe, and a long battle
 * or leader shot rotates to another storyline after a while.
 */
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
import { laneDuration } from "@/utils/pit";
import { buildStepIndex, stepAt, type StepIndex } from "./interpolate";

export type ShotKind = "overtake" | "pit" | "battle" | "leader";

const PRIORITY: Record<ShotKind, number> = {
  overtake: 3,
  pit: 2,
  battle: 1,
  leader: 0,
};

/** A time window (session-relative ms) in which a storyline is on. */
export interface DirectorCue {
  readonly kind: "overtake" | "pit";
  readonly startMs: number;
  readonly endMs: number;
  /** Car the camera follows. */
  readonly driver: number;
  /** Second car in the story (the one being overtaken), if any. */
  readonly other: number | null;
  /** Position at stake, for ranking simultaneous cues (lower = more important). */
  readonly position: number | null;
}

export interface DirectorShot {
  readonly kind: ShotKind;
  readonly driver: number;
  readonly other: number | null;
  readonly position: number | null;
}

export interface DirectorState {
  readonly shot: DirectorShot | null;
  /** Wall-clock ms when the current shot started. */
  readonly cutAtWall: number;
  /** Playhead of the last pick, to detect seeks. */
  readonly lastT: number;
}

export const INITIAL_DIRECTOR_STATE: DirectorState = {
  shot: null,
  cutAtWall: Number.NEGATIVE_INFINITY,
  lastT: Number.NaN,
};

/** Overtake and pit cues, sorted by start. */
export function buildDirectorCues(
  overtakes: readonly Overtake[],
  pits: readonly Pit[],
  sessionStartMs: number,
): DirectorCue[] {
  const cues: DirectorCue[] = [];
  for (const o of overtakes) {
    const rel = new Date(o.date).getTime() - sessionStartMs;
    if (!Number.isFinite(rel)) continue;
    cues.push({
      kind: "overtake",
      startMs: rel - DIRECTOR_OVERTAKE_LEAD_MS,
      endMs: rel + DIRECTOR_OVERTAKE_AFTER_MS,
      driver: o.overtaking_driver_number,
      other: o.overtaken_driver_number,
      position: o.position,
    });
  }
  for (const p of pits) {
    const rel = new Date(p.date).getTime() - sessionStartMs;
    if (!Number.isFinite(rel)) continue;
    const lane = laneDuration(p);
    const laneMs = lane != null && lane > 0 ? lane * 1000 : DIRECTOR_PIT_FALLBACK_LANE_MS;
    cues.push({
      kind: "pit",
      startMs: rel - DIRECTOR_PIT_LEAD_MS,
      endMs: rel + laneMs + DIRECTOR_PIT_AFTER_MS,
      driver: p.driver_number,
      other: null,
      position: null,
    });
  }
  return cues.sort((a, b) => a.startMs - b.startMs);
}

/** Per-driver position step functions. */
export type PositionIndex = ReadonlyMap<number, StepIndex<Position>>;

export function buildPositionIndex(positions: readonly Position[]): PositionIndex {
  const byDriver = new Map<number, Position[]>();
  for (const p of positions) {
    const list = byDriver.get(p.driver_number);
    if (list) list.push(p);
    else byDriver.set(p.driver_number, [p]);
  }
  const index = new Map<number, StepIndex<Position>>();
  for (const [driver, list] of byDriver) index.set(driver, buildStepIndex(list));
  return index;
}

/** Driver → position at `utcMs` (drivers with no position yet are omitted). */
export function positionsAt(index: PositionIndex, utcMs: number): Map<number, number> {
  const out = new Map<number, number>();
  for (const [driver, idx] of index) {
    const p = stepAt(idx, utcMs);
    if (p) out.set(driver, p.position);
  }
  return out;
}

export interface BattlePair {
  /** The car behind; the camera follows it so the car ahead is in shot. */
  readonly chaser: number;
  readonly ahead: number;
  /** Chaser's position. */
  readonly position: number;
}

/**
 * Battles from the set of drivers within range of the car ahead (interval
 * based, see `computeBattlingDrivers`), front-most first.
 */
export function battlePairs(
  positions: ReadonlyMap<number, number>,
  battling: ReadonlySet<number>,
  excluded?: ReadonlySet<number>,
): BattlePair[] {
  const byPosition = new Map<number, number>();
  for (const [driver, pos] of positions) byPosition.set(pos, driver);
  const pairs: BattlePair[] = [];
  for (const chaser of battling) {
    if (excluded?.has(chaser)) continue;
    const pos = positions.get(chaser);
    if (pos == null || pos <= 1) continue;
    const ahead = byPosition.get(pos - 1);
    if (ahead == null || excluded?.has(ahead)) continue;
    pairs.push({ chaser, ahead, position: pos });
  }
  return pairs.sort((a, b) => a.position - b.position);
}

/** A battle with the chaser's interval to the car ahead (s). */
export interface BattleGap {
  readonly chaser: number;
  readonly ahead: number;
  readonly gap: number;
}

/** Battles labelled with their interval; pairs without one are dropped. */
export function battleGaps(
  pairs: readonly BattlePair[],
  intervalSeconds: ReadonlyMap<number, number>,
): BattleGap[] {
  const out: BattleGap[] = [];
  for (const { chaser, ahead } of pairs) {
    const gap = intervalSeconds.get(chaser);
    if (gap !== undefined) out.push({ chaser, ahead, gap });
  }
  return out;
}

export interface DirectorContext {
  /** Session-relative playhead (ms). */
  readonly t: number;
  /** Battles at `t`, front-most first. */
  readonly battles: readonly BattlePair[];
  readonly leader: number | null;
  /** Drivers never to cut to (retired). */
  readonly excluded?: ReadonlySet<number>;
}

/** Every shot available at `t`, best first. */
export function candidateShots(
  cues: readonly DirectorCue[],
  ctx: DirectorContext,
): DirectorShot[] {
  const shots: DirectorShot[] = [];
  for (const cue of cues) {
    if (cue.startMs > ctx.t) break;
    if (cue.endMs < ctx.t || ctx.excluded?.has(cue.driver)) continue;
    shots.push({ kind: cue.kind, driver: cue.driver, other: cue.other, position: cue.position });
  }
  for (const b of ctx.battles) {
    shots.push({ kind: "battle", driver: b.chaser, other: b.ahead, position: b.position });
  }
  if (ctx.leader != null && !ctx.excluded?.has(ctx.leader)) {
    shots.push({ kind: "leader", driver: ctx.leader, other: null, position: 1 });
  }
  return shots.sort(
    (a, b) =>
      PRIORITY[b.kind] - PRIORITY[a.kind] ||
      (a.position ?? Infinity) - (b.position ?? Infinity),
  );
}

export function sameShot(a: DirectorShot | null, b: DirectorShot | null): boolean {
  if (!a || !b) return a === b;
  return a.kind === b.kind && a.driver === b.driver && a.other === b.other;
}

/** A playhead jump this far (or any rewind) re-picks without hysteresis. */
const SEEK_FORWARD_MS = 60_000;
const SEEK_BACK_MS = 1_000;

/**
 * Next director state. Pure: `wallNow` is the caller's wall clock, so shot
 * lengths are measured in real time regardless of playback speed.
 */
export function pickShot(
  cues: readonly DirectorCue[],
  ctx: DirectorContext,
  state: DirectorState,
  wallNow: number,
): DirectorState {
  const candidates = candidateShots(cues, ctx);
  const best = candidates[0] ?? null;
  const cut = (shot: DirectorShot | null): DirectorState =>
    sameShot(shot, state.shot)
      ? { ...state, lastT: ctx.t }
      : { shot, cutAtWall: wallNow, lastT: ctx.t };

  const seeked =
    Number.isNaN(state.lastT) ||
    ctx.t < state.lastT - SEEK_BACK_MS ||
    ctx.t > state.lastT + SEEK_FORWARD_MS;
  const current = state.shot;
  if (seeked || !current) return cut(best);

  // A retired car is never worth holding on.
  if (ctx.excluded?.has(current.driver)) return cut(best);

  const held = wallNow - state.cutAtWall;
  if (held < DIRECTOR_MIN_SHOT_MS) return { ...state, lastT: ctx.t };

  const stillOn = candidates.find((c) => sameShot(c, current));
  if (!stillOn) return cut(best);
  if (best && PRIORITY[best.kind] > PRIORITY[current.kind]) return cut(best);

  // Long battle / leader shots rotate to another storyline when one exists.
  if (held >= DIRECTOR_MAX_SHOT_MS && (current.kind === "battle" || current.kind === "leader")) {
    const other = candidates.find((c) => c.driver !== current.driver);
    if (other) return cut(other);
  }
  return { ...state, lastT: ctx.t };
}

/** Camera style per shot: chase for wheel-to-wheel, follow for the rest. */
export function cameraForShot(kind: ShotKind): "chase" | "follow" {
  return kind === "overtake" || kind === "battle" ? "chase" : "follow";
}

/** Everything the TV camera needs, prepared once per session. */
export interface DirectorData {
  readonly cues: readonly DirectorCue[];
  readonly positions: PositionIndex;
  /** Drivers within battle range of the car ahead at the playhead. */
  readonly battling: ReadonlySet<number>;
}

/** On-screen caption for a shot, e.g. "NOR chasing PIA for P2". */
export function shotCaption(shot: DirectorShot, acronym: (driver: number) => string): string {
  const a = acronym(shot.driver);
  const b = shot.other != null ? acronym(shot.other) : null;
  switch (shot.kind) {
    case "overtake":
      return `${a} attacking ${b ?? "car ahead"}${shot.position != null ? ` for P${shot.position}` : ""}`;
    case "pit":
      return `${a} in the pits`;
    case "battle":
      return `${a} chasing ${b ?? "car ahead"} for P${(shot.position ?? 2) - 1}`;
    case "leader":
      return `Leader · ${a}`;
  }
}
