import { describe, expect, it } from "vitest";
import type { TelemetrySample } from "@/hooks/useCarDataForLap";
import type { CornerZone } from "@/utils/corners";
import {
  alignLap,
  analyzeCornerZone,
  buildLapSegments,
  cornerZoneLabel,
  distanceAtTime,
  segmentDeltas,
  summarizeSegmentDeltas,
  timeBetween,
  valueAtDistance,
  withLapStart,
} from "./cornerAnalysis";

interface Profile {
  speed: (d: number) => number;
  brake?: (d: number) => number;
  throttle?: (d: number) => number;
}

/** Builds a lap sampled every `step` metres, integrating time from speed. */
function makeLap(
  { speed, brake = () => 0, throttle = () => 100 }: Profile,
  length = 1000,
  step = 10,
): TelemetrySample[] {
  const out: TelemetrySample[] = [];
  let timeS = 0;
  for (let d = 0; d <= length; d += step) {
    if (d > 0) {
      const avgMs = ((speed(d - step) + speed(d)) / 2) / 3.6;
      timeS += step / avgMs;
    }
    out.push({
      distM: d,
      timeS,
      speed: speed(d),
      throttle: throttle(d),
      brake: brake(d),
      rpm: 0,
      gear: 0,
      drs: 0,
    });
  }
  return out;
}

// Straight at 300 km/h, braking 400→500 m down to 100 km/h, accelerating out to 600 m.
function cornerSpeed(minSpeed: number) {
  return (d: number) => {
    if (d < 400 || d > 600) return 300;
    if (d <= 500) return 300 - ((300 - minSpeed) * (d - 400)) / 100;
    return minSpeed + ((300 - minSpeed) * (d - 500)) / 100;
  };
}

const zone: CornerZone = {
  key: "corner-zone-3",
  labels: ["3"],
  apexes: [500],
  startDistance: 400,
  endDistance: 600,
  speedClass: "low",
  minSpeed: 100,
};

describe("valueAtDistance", () => {
  const lap = makeLap({ speed: () => 180 }, 100, 50);

  it("interpolates between samples", () => {
    expect(valueAtDistance(lap, 25, (s) => s.distM)).toBeCloseTo(25);
  });

  it("clamps outside the sampled range", () => {
    expect(valueAtDistance(lap, -10, (s) => s.distM)).toBe(0);
    expect(valueAtDistance(lap, 500, (s) => s.distM)).toBe(100);
  });

  it("returns null without samples", () => {
    expect(valueAtDistance([], 10, (s) => s.distM)).toBeNull();
  });
});

describe("timeBetween", () => {
  it("measures elapsed time over a distance range", () => {
    // 180 km/h = 50 m/s → 100 m takes 2 s.
    const lap = makeLap({ speed: () => 180 }, 200, 10);
    expect(timeBetween(lap, 50, 150)).toBeCloseTo(2);
  });
});

describe("cornerZoneLabel", () => {
  it("labels single and merged zones", () => {
    expect(cornerZoneLabel({ labels: ["1"] })).toBe("T1");
    expect(cornerZoneLabel({ labels: ["4", "5", "6A"] })).toBe("T4–6A");
  });
});

describe("analyzeCornerZone", () => {
  it("extracts speeds, braking point and full-throttle point", () => {
    const lap = makeLap({
      speed: cornerSpeed(100),
      brake: (d) => (d >= 380 && d <= 480 ? 100 : 0),
      throttle: (d) => (d >= 380 && d < 540 ? 0 : 100),
    });

    const metrics = analyzeCornerZone(zone, lap)!;
    expect(metrics.entrySpeed).toBe(300);
    expect(metrics.minSpeed).toBe(100);
    expect(metrics.minSpeedDist).toBe(500);
    expect(metrics.exitSpeed).toBe(300);
    expect(metrics.brakeDist).toBe(380);
    expect(metrics.brakeBeforeApexM).toBe(120);
    expect(metrics.fullThrottleDist).toBe(540);
    expect(metrics.fullThrottleAfterApexM).toBe(40);
    expect(metrics.isFlat).toBe(false);
    expect(metrics.zoneTimeS).toBeCloseTo(timeBetween(lap, 400, 600)!);
  });

  it("measures brake/throttle points against a shared apex when given", () => {
    const lap = makeLap({
      speed: cornerSpeed(100),
      brake: (d) => (d >= 380 && d <= 480 ? 100 : 0),
      throttle: (d) => (d >= 380 && d < 540 ? 0 : 100),
    });
    const metrics = analyzeCornerZone(zone, lap, 520)!;
    expect(metrics.brakeBeforeApexM).toBe(140);
    expect(metrics.fullThrottleAfterApexM).toBe(20);
  });

  it("uses the final braking run before the apex, ignoring earlier taps", () => {
    const lap = makeLap({
      speed: cornerSpeed(100),
      brake: (d) => ((d >= 250 && d <= 260) || (d >= 420 && d <= 490) ? 100 : 0),
      throttle: (d) => (d >= 400 && d < 520 ? 0 : 100),
    });
    expect(analyzeCornerZone(zone, lap)!.brakeDist).toBe(420);
  });

  it("bridges short brake-signal dropouts within one braking phase", () => {
    // Real Monza T1 trace (2024 Q, NOR): brake reads 0 at 898–908 m, then is
    // re-applied for the chicane flick.
    const trace: [number, number, number][] = [
      [722, 345, 0], [745, 344, 0], [774, 319, 100], [801, 283, 100],
      [823, 219, 100], [839, 180, 100], [857, 139, 100], [864, 123, 100],
      [875, 106, 100], [880, 103, 100], [884, 98, 100], [890, 94, 100],
      [898, 89, 0], [908, 83, 0], [915, 86, 100], [923, 81, 100],
      [930, 75, 0], [935, 73, 0], [941, 74, 0], [959, 90, 0], [1000, 150, 0],
    ];
    let timeS = 0;
    const samples: TelemetrySample[] = trace.map(([distM, speed, brake], i) => {
      if (i > 0) {
        const [pd, ps] = trace[i - 1]!;
        timeS += (distM - pd) / (((ps + speed) / 2) / 3.6);
      }
      return { distM, timeS, speed, brake, throttle: brake ? 0 : 50, rpm: 0, gear: 0, drs: 0 };
    });
    const t1: CornerZone = { ...zone, apexes: [935], startDistance: 774, endDistance: 1000 };

    const metrics = analyzeCornerZone(t1, samples)!;
    expect(metrics.brakeDist).toBe(774);
    expect(metrics.brakeBeforeApexM).toBe(161);
  });

  it("flags a flat-out corner with no braking", () => {
    const lap = makeLap({ speed: cornerSpeed(260) });
    const metrics = analyzeCornerZone(zone, lap)!;
    expect(metrics.brakeDist).toBeNull();
    expect(metrics.brakeBeforeApexM).toBeNull();
    expect(metrics.isFlat).toBe(true);
  });

  it("returns null with insufficient telemetry", () => {
    expect(analyzeCornerZone(zone, [])).toBeNull();
  });
});

describe("distanceAtTime / withLapStart / alignLap", () => {
  // 180 km/h = 50 m/s; first sample arrives 0.2 s after the timing line.
  const lap: TelemetrySample[] = makeLap({ speed: () => 180 }, 1000, 50).map(
    (s) => ({ ...s, timeS: s.timeS + 0.2 }),
  );

  it("interpolates distance by time", () => {
    expect(distanceAtTime(lap, 1.2)).toBeCloseTo(50);
    expect(distanceAtTime(lap, 0)).toBe(0);
  });

  it("extrapolates the lap start back to the timing line", () => {
    const anchored = withLapStart(lap);
    expect(anchored).toHaveLength(lap.length + 1);
    expect(anchored[0]!.timeS).toBe(0);
    expect(anchored[0]!.distM).toBeCloseTo(-10);
  });

  it("anchors the finish at the official lap time", () => {
    const aligned = alignLap(lap, { lapS: 10.2 })!;
    expect(aligned.startDistance).toBeCloseTo(-10);
    expect(aligned.finishDistance).toBeCloseTo(500);
  });

  it("rescales another lap onto the target's start and finish", () => {
    // Same lap, but its integrated distance reads 2 % long.
    const stretched = lap.map((s) => ({ ...s, distM: s.distM * 1.02 }));
    const target = alignLap(lap, { lapS: 10.2 })!;
    const aligned = alignLap(stretched, { lapS: 10.2 }, target)!;
    expect(aligned.startDistance).toBe(target.startDistance);
    expect(aligned.finishDistance).toBe(target.finishDistance);
    expect(distanceAtTime(aligned.samples, 5.2)).toBeCloseTo(250, 0);
    // Equal official lap times → zero delta over the whole lap.
    expect(
      timeBetween(aligned.samples, target.startDistance, target.finishDistance)!,
    ).toBeCloseTo(10.2);
  });

  it("uses sector lines as extra anchors to correct non-uniform drift", () => {
    // Integrated distance reads 4 % long in the first half only.
    const drifting = lap.map((s) => ({
      ...s,
      distM: s.distM <= 250 ? s.distM * 1.04 : s.distM + 10,
    }));
    const timing = { lapS: 10.2, sectorsS: [3.2, 3] };
    const target = alignLap(lap, timing)!;
    expect(target.anchors).toHaveLength(4);

    const aligned = alignLap(drifting, timing, target)!;
    // 0.2 s + 2.5 s → 125 m on the true axis.
    expect(distanceAtTime(aligned.samples, 2.7)).toBeCloseTo(125, 0);

    // Start/finish only cannot fix drift confined to one part of the lap.
    const coarse = alignLap(drifting, { lapS: 10.2 }, alignLap(lap, { lapS: 10.2 })!)!;
    expect(Math.abs(distanceAtTime(coarse.samples, 2.7)! - 125)).toBeGreaterThan(
      Math.abs(distanceAtTime(aligned.samples, 2.7)! - 125),
    );
  });

  it("returns null with too little telemetry", () => {
    expect(alignLap([], { lapS: 80 })).toBeNull();
  });
});

describe("buildLapSegments", () => {
  const zones: CornerZone[] = [
    { ...zone, key: "z2", labels: ["2"], startDistance: 600, endDistance: 700 },
    { ...zone, key: "z1", labels: ["1"], startDistance: 200, endDistance: 300 },
  ];

  it("tiles the lap with straights and corners in track order", () => {
    const segments = buildLapSegments(zones, 1000);
    expect(segments.map((s) => [s.kind, s.label, s.startDistance, s.endDistance])).toEqual([
      ["straight", "Start → T1", 0, 200],
      ["corner", "T1", 200, 300],
      ["straight", "T1 → T2", 300, 600],
      ["corner", "T2", 600, 700],
      ["straight", "T2 → Finish", 700, 1000],
    ]);
  });

  it("clamps overlapping zones so segments never overlap", () => {
    const overlapping: CornerZone[] = [
      { ...zone, key: "a", labels: ["1"], startDistance: 100, endDistance: 300 },
      { ...zone, key: "b", labels: ["2"], startDistance: 250, endDistance: 400 },
    ];
    const segments = buildLapSegments(overlapping, 500);
    for (let i = 1; i < segments.length; i++) {
      expect(segments[i]!.startDistance).toBe(segments[i - 1]!.endDistance);
    }
    expect(segments[segments.length - 1]!.endDistance).toBe(500);
  });

  it("starts the first straight at the given lap start distance", () => {
    const segments = buildLapSegments(zones, 1000, -15);
    expect(segments[0]).toMatchObject({ label: "Start → T1", startDistance: -15 });
  });

  it("returns no segments for an invalid lap length", () => {
    expect(buildLapSegments(zones, 0)).toEqual([]);
  });
});

describe("segmentDeltas / summarizeSegmentDeltas", () => {
  const ref = makeLap({ speed: cornerSpeed(100) });
  // Carries more speed through the corner → gains time there.
  const faster = makeLap({ speed: cornerSpeed(130) });
  const segments = buildLapSegments([zone], 1000);

  it("attributes the gain to the corner and sums to the lap delta", () => {
    const deltas = segmentDeltas(segments, ref, faster);
    const cornerIdx = segments.findIndex((s) => s.kind === "corner");
    expect(deltas[cornerIdx]).toBeLessThan(0);

    const lapDelta = timeBetween(faster, 0, 1000)! - timeBetween(ref, 0, 1000)!;
    const summary = summarizeSegmentDeltas(segments, deltas);
    expect(summary.total).toBeCloseTo(lapDelta, 9);
    expect(summary.corners).toBeCloseTo(deltas[cornerIdx]!, 9);
    expect(summary.straights).toBeCloseTo(0, 9);
    expect(summary.biggestGainIndex).toBe(cornerIdx);
    expect(summary.biggestLossIndex).toBeNull();
  });

  it("is null for segments without telemetry", () => {
    expect(segmentDeltas(segments, ref, [])).toEqual(segments.map(() => null));
  });
});
