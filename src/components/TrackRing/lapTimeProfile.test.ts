import { describe, expect, it } from "vitest";
import {
  buildLapTimeProfile,
  latestFullLap,
  timeAtDistance,
  type TraceSample,
} from "./lapTimeProfile";

const LIMITS = { minMs: 40_000, maxMs: 240_000 };

/**
 * A car lapping in `lapMs`: the first half of the lap (by distance) takes
 * `slowShare` of the time. Samples every 250 ms from `fromMs`.
 */
function trace(lapMs: number, laps: number, slowShare = 0.5, fromMs = 0): TraceSample[] {
  const out: TraceSample[] = [];
  for (let t = fromMs; t <= fromMs + lapMs * laps; t += 250) {
    const tf = ((t - fromMs) % lapMs) / lapMs;
    const f = tf < slowShare ? (tf / slowShare) * 0.5 : 0.5 + ((tf - slowShare) / (1 - slowShare)) * 0.5;
    out.push({ t, f });
  }
  return out;
}

describe("latestFullLap", () => {
  it("finds the last complete lap between two line crossings", () => {
    const lap = latestFullLap(trace(90_000, 2.5, 0.5, 1_000), LIMITS)!;
    expect(lap.durationMs).toBeCloseTo(90_000, -2);
    expect(lap.points[0]).toEqual([0, 0]);
    expect(lap.points[lap.points.length - 1]![0]).toBe(1);
  });

  it("needs two crossings", () => {
    expect(latestFullLap(trace(90_000, 1.5, 0.5, 30_000), LIMITS)).toBeNull();
  });

  it("rejects a lap through the pits and falls back to the previous one", () => {
    const samples = trace(90_000, 3.2, 0.5, 1_000);
    // Pit samples in the last full lap.
    for (const s of samples) if (s.t > 200_000 && s.t < 210_000) s.f = null;
    const lap = latestFullLap(samples, LIMITS)!;
    expect(lap).not.toBeNull();
    // The earlier lap (≈ 91 s → 181 s) is used.
    expect(lap.durationMs).toBeCloseTo(90_000, -2);
  });

  it("rejects laps with a long data gap", () => {
    const samples = trace(90_000, 2.2, 0.5, 1_000).filter((s) => s.t < 120_000 || s.t > 130_000);
    expect(latestFullLap(samples, LIMITS)).toBeNull();
  });

  it("ignores jitter back across the line", () => {
    const samples = trace(90_000, 2.5, 0.5, 1_000);
    const i = samples.findIndex((s) => s.t > 95_000);
    samples.splice(i, 0, { t: samples[i]!.t - 1, f: 0.999 }, { t: samples[i]!.t - 0.5, f: 0.001 });
    expect(latestFullLap(samples, LIMITS)!.durationMs).toBeCloseTo(90_000, -2);
  });
});

describe("buildLapTimeProfile", () => {
  it("maps distance to time so slow stretches take more of the lap", () => {
    // First half of the distance takes 70 % of the time.
    const lap = latestFullLap(trace(100_000, 2.5, 0.7, 1_000), LIMITS)!;
    const p = buildLapTimeProfile([lap])!;
    expect(timeAtDistance(p, 0)).toBe(0);
    expect(timeAtDistance(p, 1)).toBe(1);
    expect(timeAtDistance(p, 0.5)).toBeCloseTo(0.7, 2);
    expect(timeAtDistance(p, 0.25)).toBeCloseTo(0.35, 2);
    expect(p.lapMs).toBeCloseTo(100_000, -2);
  });

  it("averages laps close to the fastest and drops slow ones", () => {
    const a = latestFullLap(trace(90_000, 2.5, 0.6, 1_000), LIMITS)!;
    const b = latestFullLap(trace(92_000, 2.5, 0.4, 1_000), LIMITS)!;
    const slow = latestFullLap(trace(130_000, 2.5, 0.9, 1_000), LIMITS)!;
    const p = buildLapTimeProfile([a, b, slow])!;
    expect(p.laps).toBe(2);
    expect(timeAtDistance(p, 0.5)).toBeCloseTo(0.5, 2);
    expect(p.lapMs).toBeCloseTo(91_000, -2);
  });

  it("is null without laps", () => {
    expect(buildLapTimeProfile([])).toBeNull();
  });
});
