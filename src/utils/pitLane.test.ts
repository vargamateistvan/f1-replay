import { describe, expect, it } from "vitest";
import { distanceToLoop, extractPitLane, type TracePoint } from "./pitLane";

// A 1000 × 1000 square track; the pit lane runs 200 units inside its bottom edge.
const xs = [0, 1000, 1000, 0];
const ys = [0, 0, 1000, 1000];

describe("distanceToLoop", () => {
  it("measures to the nearest edge, including the closing one", () => {
    expect(distanceToLoop(xs, ys, 500, 200)).toBe(200);
    expect(distanceToLoop(xs, ys, 30, 500)).toBe(30);
    expect(distanceToLoop(xs, ys, 1000, 1000)).toBe(0);
  });
});

describe("extractPitLane", () => {
  const sample = (t: number, x: number, y: number): TracePoint => ({ t: t * 1000, x, y });

  it("keeps the longest off-track run, padded to meet the track", () => {
    const trace = [
      sample(0, 100, 0),
      sample(1, 200, 0),
      sample(2, 300, 100), // off by 100: entry
      ...Array.from({ length: 15 }, (_, i) => sample(3 + i, 320 + i * 20, 200)),
      sample(18, 700, 100),
      sample(19, 800, 0), // back on track
      sample(20, 900, 0),
    ];
    const lane = extractPitLane(trace, xs, ys)!;
    expect(lane[0]).toEqual(sample(1, 200, 0));
    expect(lane[lane.length - 1]).toEqual(sample(19, 800, 0));
  });

  it("ignores a brief excursion and an all-on-track trace", () => {
    const blip = [sample(0, 100, 0), sample(1, 200, 80), sample(2, 300, 0)];
    expect(extractPitLane(blip, xs, ys)).toBeNull();
    expect(extractPitLane([sample(0, 100, 0), sample(30, 900, 0)], xs, ys)).toBeNull();
  });

  it("sorts samples by time first", () => {
    const trace = [
      ...Array.from({ length: 12 }, (_, i) => sample(12 - i, 300 + i * 20, 200)),
      sample(0, 200, 0),
      sample(13, 800, 0),
    ];
    const lane = extractPitLane(trace, xs, ys)!;
    expect(lane.map((p) => p.t)).toEqual([...lane.map((p) => p.t)].sort((a, b) => a - b));
  });
});
