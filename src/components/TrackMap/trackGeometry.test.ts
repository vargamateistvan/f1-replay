import { describe, expect, it } from "vitest";
import type { CarData } from "@/api/types";
import type { TelemetrySample } from "@/hooks/useCarDataForLap";
import {
  buildBrakingHotspots,
  buildHeatSegments,
  buildMarshalHeatmapSegments,
  buildTrackGeometry,
  carDataAt,
  computeSpeedStats,
  nearestSvgPointIndex,
} from "./trackGeometry";

const squareOutline = {
  points: [
    { x: 0, y: 0 },
    { x: 100, y: 0 },
    { x: 100, y: 100 },
    { x: 0, y: 100 },
  ],
  bounds: { minX: 0, minY: 0, maxX: 100, maxY: 100, width: 100, height: 100 },
};

function sample(distM: number, speed: number, brake = 0): TelemetrySample {
  return {
    distM,
    timeS: distM / 50,
    speed,
    throttle: 100,
    brake,
    rpm: 10_000,
    gear: 7,
    drs: 0,
  };
}

describe("buildTrackGeometry", () => {
  it("builds a closed spline path and a normalized arc-length table", () => {
    const geom = buildTrackGeometry(squareOutline);
    expect(geom.pathData.startsWith("M")).toBe(true);
    expect(geom.pathData.endsWith(" Z")).toBe(true);
    // One cubic segment per outline point (closed loop).
    expect(geom.pathData.match(/ C/g)).toHaveLength(4);
    expect(geom.svgPts).toHaveLength(4);
    expect(geom.normArc[0]).toBe(0);
    expect(geom.normArc.at(-1)).toBe(1);
    for (let i = 1; i < geom.normArc.length; i++) {
      expect(geom.normArc[i]!).toBeGreaterThan(geom.normArc[i - 1]!);
    }
  });
});

describe("nearestSvgPointIndex", () => {
  it("returns the index of the closest point", () => {
    const pts = [
      { sx: 0, sy: 0 },
      { sx: 10, sy: 0 },
      { sx: 10, sy: 10 },
    ];
    expect(nearestSvgPointIndex(pts, 9, 1)).toBe(1);
    expect(nearestSvgPointIndex(pts, 11, 12)).toBe(2);
  });
});

describe("telemetry overlays", () => {
  const geom = buildTrackGeometry(squareOutline);

  it("returns nothing without geometry or samples", () => {
    expect(buildHeatSegments(null, [sample(0, 100)])).toEqual([]);
    expect(buildHeatSegments(geom, [])).toEqual([]);
    expect(buildHeatSegments(geom, null)).toEqual([]);
    expect(buildBrakingHotspots(geom, undefined)).toEqual([]);
  });

  it("colours one segment per outline edge using the sample at its midpoint", () => {
    const samples = [sample(0, 80), sample(500, 200), sample(1000, 300)];
    const segments = buildHeatSegments(geom, samples);
    expect(segments).toHaveLength(geom.svgPts.length - 1);
    // Middle edge sits near half distance → the 200 km/h sample.
    expect(segments[1]!.speed).toBe(200);
  });

  it("keeps one hotspot per hard-braking zone at its peak brake pressure", () => {
    const samples = [
      sample(0, 300),
      sample(100, 280, 80),
      sample(150, 200, 95),
      sample(200, 120),
      sample(600, 290, 75),
      sample(700, 150),
      // Slow-speed braking is ignored.
      sample(800, 60, 100),
      sample(1000, 200),
    ];
    const hotspots = buildBrakingHotspots(geom, samples);
    expect(hotspots).toHaveLength(2);
    expect(hotspots[0]!.key).toBe("brake-hotspot-0-150");
    expect(hotspots[0]!.radius).toBeGreaterThan(hotspots[1]!.radius);
  });

  it("summarizes lap speed", () => {
    expect(computeSpeedStats([])).toBeNull();
    expect(
      computeSpeedStats([sample(0, 100), sample(1, 200), sample(2, 300)]),
    ).toEqual({ min: 100, avg: 200, max: 300 });
  });
});

describe("buildMarshalHeatmapSegments", () => {
  it("tiles the lap with one ordered segment per marshal post", () => {
    const geom = buildTrackGeometry(squareOutline);
    const posts = [1, 2, 3].map((number, i) => ({
      number,
      trackPosition: squareOutline.points[i]!,
    }));
    const segments = buildMarshalHeatmapSegments(geom, posts);
    expect(segments).toHaveLength(3);
    expect(segments.map((s) => s.i)).toEqual([0, 1, 2]);
    for (let i = 1; i < segments.length; i++) {
      expect(segments[i]!.arcStart).toBeGreaterThanOrEqual(
        segments[i - 1]!.arcStart,
      );
    }
    expect(segments.every((s) => s.len > 0)).toBe(true);
    expect(segments.map((s) => s.sector).sort()).toEqual([1, 2, 3]);
  });

  it("returns nothing without marshal posts", () => {
    const geom = buildTrackGeometry(squareOutline);
    expect(buildMarshalHeatmapSegments(geom, [])).toEqual([]);
    expect(buildMarshalHeatmapSegments(null, undefined)).toEqual([]);
  });
});

describe("carDataAt", () => {
  const row = (iso: string, speed: number) =>
    ({ date: iso, speed }) as unknown as CarData;
  const rows = [
    row("2024-01-01T00:00:00.000Z", 100),
    row("2024-01-01T00:00:01.000Z", 200),
    row("2024-01-01T00:00:02.000Z", 300),
  ];

  it("returns the first row at or after the playhead", () => {
    const target = Date.parse("2024-01-01T00:00:00.500Z");
    expect(carDataAt(rows, target)?.speed).toBe(200);
  });

  it("returns null when the nearest row is 30 s or more away", () => {
    const target = Date.parse("2024-01-01T00:01:00.000Z");
    expect(carDataAt(rows, target)).toBeNull();
    expect(carDataAt([], target)).toBeNull();
  });
});
