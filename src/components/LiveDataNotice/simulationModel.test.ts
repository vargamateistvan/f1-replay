import { describe, expect, it } from "vitest";
import {
  buildPolyline,
  inYellowZone,
  createSimulation,
  nearestFraction,
  pointAt,
  stepSimulation,
  type SimConfig,
  type SimPhase,
} from "./simulationModel";

const square = buildPolyline([{ x: 0, y: 0 }, { x: 100, y: 0 }, { x: 100, y: 100 }, { x: 0, y: 100 }], true)!;

const config: SimConfig = {
  carLapSeconds: [30, 40, 35, 45],
  catchLapSeconds: 30,
  safetyCarLapSeconds: 50,
  pitExitFraction: 0.05,
  pitEntryFraction: 0.95,
  pitSeconds: 2,
  queueGap: 0.02,
  minQueueSpeed: 0.6,
  firstDelaySeconds: [10, 10],
  intervalSeconds: [60, 60],
  safetyCarLaps: [2, 2],
  incidentWeights: { "safety-car": 1, yellow: 1, red: 1 },
  yellowSeconds: [10, 10],
  yellowZoneLength: [0.2, 0.2],
  yellowSpeed: 0.5,
  redSeconds: [8, 8],
  paceChangeSeconds: 2,
};

/** Random source that rolls `incident` for the incident pick, then 0 for everything else. */
const rolls = (incident: number) => {
  let calls = 0;
  // createSimulation uses the first roll, the incident pick the second.
  return () => (++calls === 2 ? incident : 0);
};

const wrap = (v: number) => ((v % 1) + 1) % 1;

describe("polyline helpers", () => {
  it("walks a closed outline by distance and wraps", () => {
    expect(square.length).toBe(400);
    expect(pointAt(square, 0.125)).toMatchObject({ x: 50, y: 0, angle: 0 });
    expect(pointAt(square, 1.625)).toMatchObject({ x: 50, y: 100, angle: 180 });
    expect(nearestFraction(square, { x: 103, y: 50 })).toEqual({ fraction: 0.375, distance: 3 });
  });
});

describe("safety car simulation", () => {
  it("deploys from the pit, bunches the field behind it, then returns to the pits", () => {
    const state = createSimulation(config, () => 0);
    const phases: SimPhase[] = [];
    let queued = false;
    for (let i = 0; i < 4000; i++) {
      const before = [...state.cars];
      stepSimulation(state, config, 0.1, () => 0);
      if (phases.at(-1) !== state.phase) phases.push(state.phase);
      state.cars.forEach((pos, index) => expect(pos).toBeGreaterThanOrEqual(before[index]!));
      if (state.phase === "safety-car") {
        // No car ever passes the safety car.
        for (const pos of state.cars) expect(wrap(state.safetyCar - pos)).toBeLessThan(0.999);
        const behind = state.cars.map((pos) => wrap(state.safetyCar - pos)).sort((a, b) => a - b);
        if (behind.at(-1)! < 0.02 * state.cars.length + 0.01) queued = true;
      }
      if (phases.length >= 5) break;
    }
    expect(phases).toEqual(["green", "deploying", "safety-car", "returning", "green"]);
    expect(queued).toBe(true);
    expect(state.nextIncidentAt).toBeCloseTo(state.time + 60, 5);
  });

  it("joins at the pit exit and leaves at the pit entry after the configured laps", () => {
    const state = createSimulation({ ...config, pitSeconds: 0 }, () => 0);
    while (state.phase !== "safety-car") stepSimulation(state, { ...config, pitSeconds: 0 }, 0.1, () => 0);
    expect(state.safetyCar).toBe(0.05);
    expect(state.safetyCarEnd).toBeCloseTo(0.05 + 2 + 0.9);
  });

  it("slows cars through a local yellow zone without overtaking, then clears", () => {
    const rng = rolls(0.5);
    const state = createSimulation(config, rng);
    while (state.phase === "green") stepSimulation(state, config, 0.1, rng);
    expect(state.phase).toBe("yellow");
    expect(state.yellowZone).toEqual({ start: 0, length: 0.2 });
    const end = state.phaseEnd;
    while (state.phase === "yellow") {
      const before = [...state.cars];
      stepSimulation(state, config, 0.1, rng);
      if (state.phase !== "yellow") break;
      state.cars.forEach((pos, index) => {
        const racing = 0.1 / config.carLapSeconds[index]!;
        const step = pos - before[index]!;
        expect(step).toBeLessThanOrEqual(racing + 1e-12);
        if (inYellowZone(state.yellowZone, before[index]!)) {
          expect(step).toBeLessThanOrEqual(racing * config.yellowSpeed + 1e-12);
        }
      });
    }
    expect(state.time).toBeGreaterThanOrEqual(end);
    expect(state.phase).toBe("green");
    expect(state.yellowZone).toBeNull();
  });

  it("stops the field under a red flag and restarts it afterwards", () => {
    const rng = rolls(0.9);
    const state = createSimulation(config, rng);
    while (state.phase === "green") stepSimulation(state, config, 0.1, rng);
    expect(state.phase).toBe("red");
    for (let i = 0; i < 30; i++) stepSimulation(state, config, 0.1, rng);
    const stopped = [...state.cars];
    stepSimulation(state, config, 0.1, rng);
    expect(state.paceFactor).toBe(0);
    expect(state.cars).toEqual(stopped);
    while (state.phase === "red") stepSimulation(state, config, 0.1, rng);
    for (let i = 0; i < 30; i++) stepSimulation(state, config, 0.1, rng);
    expect(state.paceFactor).toBe(1);
    expect(state.cars.every((pos, index) => pos > stopped[index]!)).toBe(true);
  });
});
