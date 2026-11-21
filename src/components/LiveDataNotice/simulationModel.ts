export interface SimPoint {
  x: number;
  y: number;
}

export interface Polyline {
  points: SimPoint[];
  /** Distance from the first point to each point (closed lines include the closing segment). */
  cumulative: number[];
  length: number;
  closed: boolean;
}

export interface PolylinePosition extends SimPoint {
  /** Heading in degrees, 0 = +x. */
  angle: number;
}

export function buildPolyline(points: SimPoint[], closed: boolean): Polyline | null {
  if (points.length < 2) return null;
  const all = closed ? [...points, points[0]!] : points;
  const cumulative = [0];
  for (let i = 1; i < all.length; i++) {
    cumulative.push(cumulative[i - 1]! + Math.hypot(all[i]!.x - all[i - 1]!.x, all[i]!.y - all[i - 1]!.y));
  }
  const length = cumulative[cumulative.length - 1]!;
  if (!(length > 0)) return null;
  return { points: all, cumulative, length, closed };
}

const wrap = (value: number) => ((value % 1) + 1) % 1;

/** Point at a fraction of the line; closed lines wrap, open lines clamp. */
export function pointAt(line: Polyline, fraction: number): PolylinePosition {
  const f = line.closed ? wrap(fraction) : Math.min(1, Math.max(0, fraction));
  const target = f * line.length;
  let lo = 0;
  let hi = line.cumulative.length - 1;
  while (hi - lo > 1) {
    const mid = (lo + hi) >> 1;
    if (line.cumulative[mid]! <= target) lo = mid;
    else hi = mid;
  }
  const a = line.points[lo]!;
  const b = line.points[hi]!;
  const span = line.cumulative[hi]! - line.cumulative[lo]! || 1;
  const t = (target - line.cumulative[lo]!) / span;
  return {
    x: a.x + (b.x - a.x) * t,
    y: a.y + (b.y - a.y) * t,
    angle: (Math.atan2(b.y - a.y, b.x - a.x) * 180) / Math.PI,
  };
}

/** Closest fraction of the line to a point, and the distance to it. */
export function nearestFraction(line: Polyline, p: SimPoint): { fraction: number; distance: number } {
  let best = { fraction: 0, distance: Infinity };
  for (let i = 1; i < line.points.length; i++) {
    const a = line.points[i - 1]!;
    const b = line.points[i]!;
    const dx = b.x - a.x;
    const dy = b.y - a.y;
    const len2 = dx * dx + dy * dy;
    const t = len2 ? Math.min(1, Math.max(0, ((p.x - a.x) * dx + (p.y - a.y) * dy) / len2)) : 0;
    const distance = Math.hypot(a.x + dx * t - p.x, a.y + dy * t - p.y);
    if (distance < best.distance) {
      const along = line.cumulative[i - 1]! + (line.cumulative[i]! - line.cumulative[i - 1]!) * t;
      best = { fraction: along / line.length, distance };
    }
  }
  return best;
}

export type SimPhase = "green" | "deploying" | "safety-car" | "returning" | "yellow" | "red";
export type SimIncident = "safety-car" | "yellow" | "red";

export interface SimConfig {
  /** Racing lap time of each car, seconds. */
  carLapSeconds: number[];
  /** Pace cars use to catch the queue while the safety car is out. */
  catchLapSeconds: number;
  safetyCarLapSeconds: number;
  /** Track fractions where the pit lane rejoins / leaves the circuit. */
  pitExitFraction: number;
  pitEntryFraction: number;
  /** Time the safety car spends driving each half of the pit lane (0 = no pit lane). */
  pitSeconds: number;
  /** Queue spacing as a fraction of the lap. */
  queueGap: number;
  /** Lowest speed of a car held up in the queue, relative to the safety car. */
  minQueueSpeed: number;
  firstDelaySeconds: readonly [number, number];
  intervalSeconds: readonly [number, number];
  /** Whole laps behind the safety car before it heads for the pit entry. */
  safetyCarLaps: readonly [number, number];
  /** Relative likelihood of each incident. */
  incidentWeights: Record<SimIncident, number>;
  yellowSeconds: readonly [number, number];
  /** Length of the yellow-flag zone as a fraction of the lap. */
  yellowZoneLength: readonly [number, number];
  /** Pace through the yellow zone, relative to racing pace. */
  yellowSpeed: number;
  redSeconds: readonly [number, number];
  /** Time to brake to a stop under red, and to get back up to pace after it. */
  paceChangeSeconds: number;
}

export interface YellowZone {
  /** Track fraction where the zone starts. */
  start: number;
  length: number;
}

export interface SimState {
  time: number;
  phase: SimPhase;
  /** Cumulative laps covered by each car (fraction part = track position). */
  cars: number[];
  nextIncidentAt: number;
  /** End time of a yellow or red flag. */
  phaseEnd: number;
  yellowZone: YellowZone | null;
  /** Field pace, 0 (stopped under red) to 1. */
  paceFactor: number;
  /** Cumulative laps of the safety car on track. */
  safetyCar: number;
  safetyCarEnd: number;
  /** 0–1 progress along the current half of the pit lane. */
  pitProgress: number;
}

const between = ([min, max]: readonly [number, number], rng: () => number) =>
  min + (max - min) * rng();

export function createSimulation(config: SimConfig, rng: () => number = Math.random): SimState {
  const count = config.carLapSeconds.length;
  return {
    time: 0,
    phase: "green",
    cars: Array.from({ length: count }, (_, index) => index / count),
    nextIncidentAt: between(config.firstDelaySeconds, rng),
    phaseEnd: 0,
    yellowZone: null,
    paceFactor: 1,
    safetyCar: 0,
    safetyCarEnd: 0,
    pitProgress: 0,
  };
}

function advanceQueue(state: SimState, config: SimConfig, dt: number) {
  const scSpeed = 1 / config.safetyCarLapSeconds;
  const order = state.cars
    .map((pos, index) => ({ index, behind: wrap(state.safetyCar - pos) }))
    .sort((a, b) => a.behind - b.behind);
  let ahead = state.safetyCar;
  for (const { index } of order) {
    const pos = state.cars[index]!;
    const free = Math.max(1 / config.carLapSeconds[index]!, 1 / config.catchLapSeconds) * dt;
    const room = wrap(ahead - pos) - config.queueGap;
    const step = Math.min(free, Math.max(room, scSpeed * config.minQueueSpeed * dt));
    state.cars[index] = pos + step;
    ahead = state.cars[index]!;
  }
}

export function inYellowZone(zone: YellowZone | null, pos: number): boolean {
  return zone != null && wrap(pos - zone.start) < zone.length;
}

function pickIncident(config: SimConfig, rng: () => number): SimIncident {
  const order: SimIncident[] = ["safety-car", "yellow", "red"];
  const total = order.reduce((sum, kind) => sum + Math.max(0, config.incidentWeights[kind]), 0);
  let roll = rng() * total;
  for (const kind of order) {
    roll -= Math.max(0, config.incidentWeights[kind]);
    if (roll < 0) return kind;
  }
  return "safety-car";
}

// No overtaking under yellow or red: each car keeps queueGap to the car ahead.
function followSteps(state: SimState, config: SimConfig, desired: number[]): number[] {
  return state.cars.map((pos, index) => {
    let gap = Infinity;
    state.cars.forEach((other, j) => {
      const d = wrap(other - pos);
      if (j !== index && d > 0 && d < gap) gap = d;
    });
    return Math.min(desired[index]!, Math.max(0, gap - config.queueGap));
  });
}

function endIncident(state: SimState, config: SimConfig, rng: () => number) {
  state.phase = "green";
  state.yellowZone = null;
  state.nextIncidentAt = state.time + between(config.intervalSeconds, rng);
}

/** Advance the simulation by dt seconds (mutates and returns the state). */
export function stepSimulation(
  state: SimState,
  config: SimConfig,
  dt: number,
  rng: () => number = Math.random,
): SimState {
  state.time += dt;
  const pitStep = config.pitSeconds > 0 ? dt / config.pitSeconds : 1;
  if (state.phase === "safety-car") {
    state.safetyCar += dt / config.safetyCarLapSeconds;
    advanceQueue(state, config, dt);
    if (state.safetyCar >= state.safetyCarEnd) {
      state.phase = "returning";
      state.pitProgress = 0;
    }
    return state;
  }
  const paceStep = config.paceChangeSeconds > 0 ? dt / config.paceChangeSeconds : 1;
  state.paceFactor = state.phase === "red"
    ? Math.max(0, state.paceFactor - paceStep)
    : Math.min(1, state.paceFactor + paceStep);
  const desired = state.cars.map((pos, index) =>
    dt / config.carLapSeconds[index]! * state.paceFactor *
      (state.phase === "yellow" && inYellowZone(state.yellowZone, pos) ? config.yellowSpeed : 1),
  );
  const steps = state.phase === "yellow" || state.phase === "red"
    ? followSteps(state, config, desired)
    : desired;
  state.cars = state.cars.map((pos, index) => pos + steps[index]!);
  if (state.phase === "green" && state.time >= state.nextIncidentAt) {
    const incident = pickIncident(config, rng);
    if (incident === "safety-car") {
      state.phase = "deploying";
      state.pitProgress = 0;
    } else if (incident === "yellow") {
      state.phase = "yellow";
      state.yellowZone = { start: rng(), length: between(config.yellowZoneLength, rng) };
      state.phaseEnd = state.time + between(config.yellowSeconds, rng);
    } else {
      state.phase = "red";
      state.phaseEnd = state.time + between(config.redSeconds, rng);
    }
  } else if ((state.phase === "yellow" || state.phase === "red") && state.time >= state.phaseEnd) {
    endIncident(state, config, rng);
  } else if (state.phase === "deploying") {
    state.pitProgress = Math.min(1, state.pitProgress + pitStep);
    if (state.pitProgress >= 1) {
      state.phase = "safety-car";
      state.safetyCar = config.pitExitFraction;
      const laps = Math.round(between(config.safetyCarLaps, rng));
      state.safetyCarEnd = config.pitExitFraction + laps +
        wrap(config.pitEntryFraction - config.pitExitFraction);
    }
  } else if (state.phase === "returning") {
    state.pitProgress = Math.min(1, state.pitProgress + pitStep);
    if (state.pitProgress >= 1) endIncident(state, config, rng);
  }
  return state;
}
