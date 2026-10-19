import { describe, expect, it } from "vitest";
import type { CarData } from "@/api/types";
import monacoJson from "@/data/circuit-geometry/22-2025.json";
import type { CircuitGeometry } from "@/data/circuitGeometryTypes";
import { getCircuitGeoref } from "@/data/circuitGeoref";
import { buildHeatSegments } from "@/components/TrackMap/trackGeometry";
import { buildIndex } from "@/timeline/interpolate";
import {
  buildArcPolyline,
  buildDirectionArrows,
  buildArcLine,
  buildHotspotPoints,
  gradientFromSegments,
  heatColors,
  withAlpha,
  buildSectorMarkers,
  buildTrailPath,
  speedLookup,
  trailFeature,
  trailGradient,
  trailSpeedGradient,
} from "./trackOverlays";
import { speedToColor } from "@/components/TrackMap/trackMapFormat";

const monaco = monacoJson as CircuitGeometry;
const geo = getCircuitGeoref(22, 2025)!;

describe("buildArcPolyline", () => {
  it("carries lng/lat with a 0 → 1 arc, so 2D overlay builders work on it", () => {
    const arc = buildArcPolyline(monaco, geo);
    expect(arc.svgPts).toHaveLength(monaco.x.length);
    expect(arc.normArc[0]).toBe(0);
    expect(arc.normArc.at(-1)).toBe(1);
    expect(arc.svgPts[0]!.sx).toBeGreaterThan(7.4);
    expect(arc.svgPts[0]!.sy).toBeGreaterThan(43.7);

    const samples = [
      { distM: 0, speed: 100 },
      { distM: 3300, speed: 300 },
    ] as unknown as Parameters<typeof buildHeatSegments>[1];
    const heat = buildHeatSegments(arc, samples);
    expect(heat).toHaveLength(monaco.x.length - 1);
    expect(heat[0]!.x1).toBe(arc.svgPts[0]!.sx);
  });
});

describe("track markup", () => {
  it("places S1 / S2 ticks with labels off the track", () => {
    const arc = buildArcPolyline(monaco, geo);
    const { ticks, labels } = buildSectorMarkers(monaco, geo, arc);
    expect(ticks.features.map((f) => f.properties.label)).toEqual(["S1", "S2"]);
    expect(labels.features).toHaveLength(2);
  });

  it("spreads ten race-direction chevrons around the lap", () => {
    const arrows = buildDirectionArrows(monaco, geo).features;
    expect(arrows).toHaveLength(10);
    for (const a of arrows) {
      expect(a.properties.bearing).toBeGreaterThanOrEqual(0);
      expect(a.properties.bearing).toBeLessThan(360);
    }
  });
});

describe("overlay gradients", () => {
  it("adds alpha to hex and hsl colours", () => {
    expect(withAlpha("#33d17a", 0.4)).toBe("rgba(51,209,122,0.400)");
    expect(withAlpha("hsl(120,100%,55%)", 0.9)).toBe("hsla(120,100%,55%,0.900)");
  });

  it("puts one stop per segment at its mid-arc, in order", () => {
    const arc = { svgPts: [], normArc: [0, 0.2, 0.6, 1] } as unknown as Parameters<
      typeof gradientFromSegments
    >[0];
    const g = gradientFromSegments(arc, [
      { color: "#ff0000", opacity: 1 },
      { color: "#00ff00", opacity: 0.5 },
      { color: "#0000ff", opacity: 0.2 },
    ])!;
    expect(g.slice(0, 3)).toEqual(["interpolate", ["linear"], ["line-progress"]]);
    expect(g.slice(3)).toEqual([
      0.1,
      "rgba(255,0,0,1.000)",
      0.4,
      "rgba(0,255,0,0.500)",
      0.8,
      "rgba(0,0,255,0.200)",
    ]);
    expect(gradientFromSegments(arc, [])).toBeNull();
  });

  it("colours speed heat like the 2D map", () => {
    const [fast] = heatColors([{ x1: 0, y1: 0, x2: 1, y2: 1, speed: 300 }]);
    expect(fast).toEqual({ color: "hsl(0,100%,55%)", opacity: 0.9 });
  });

  it("turns the arc into one open line", () => {
    const arc = buildArcPolyline(monaco, geo);
    expect(buildArcLine(arc).geometry.coordinates).toHaveLength(monaco.x.length);
  });
});

describe("buildHotspotPoints", () => {
  it("keeps hotspot radius in SVG units for the layer to scale", () => {
    const pts = buildHotspotPoints([{ key: "a", x: 7.42, y: 43.73, radius: 6, opacity: 0.3 }]);
    expect(pts.features[0]!.properties).toEqual({ radius: 6, opacity: 0.3 });
    expect(pts.features[0]!.geometry.coordinates).toEqual([7.42, 43.73]);
  });
});

describe("buildTrailPath / trailGradient", () => {
  const idx = buildIndex([
    { t: 0, x: monaco.x[0]!, y: monaco.y[0]! },
    { t: 10_000, x: monaco.x[20]!, y: monaco.y[20]! },
  ]);

  it("samples the last window oldest → newest, ending at the car", () => {
    const path = buildTrailPath(idx, 10_000, geo, 8_000, 2_000)!;
    const coords = trailFeature(path).geometry.coordinates;
    // 2, 4, 6, 8, 10 s, plus the current position.
    expect(coords).toHaveLength(6);
    expect(coords.at(-1)).toEqual(coords.at(-2));
    expect(path.times).toEqual([2_000, 4_000, 6_000, 8_000, 10_000, 10_000]);
  });

  it("is null before there is any history", () => {
    expect(buildTrailPath(idx, -5_000, geo, 8_000, 200)).toBeNull();
    expect(buildTrailPath(buildIndex([{ t: 0, x: 1, y: 1 }]), 0, geo, 8_000, 200)).toBeNull();
  });

  it("fades the team colour in from transparent", () => {
    expect(trailGradient("#E80020")).toEqual([
      "interpolate",
      ["linear"],
      ["line-progress"],
      0,
      "rgba(232,0,32,0)",
      1,
      "rgba(232,0,32,0.9)",
    ]);
  });
});

describe("speed-coloured trail", () => {
  const START = Date.UTC(2025, 4, 25, 13, 0, 0);
  const row = (ms: number, speed: number) =>
    ({ date: new Date(START + ms).toISOString(), speed }) as CarData;

  describe("speedLookup", () => {
    const speedAt = speedLookup([row(1_000, 100), row(1_250, 200), row(5_000, 300)], START, 1_000);

    it("interpolates between samples", () => {
      expect(speedAt(1_000)).toBe(100);
      expect(speedAt(1_125)).toBeCloseTo(150);
    });

    it("has no speed across a gap longer than the limit, or outside the window", () => {
      expect(speedAt(3_000)).toBeNull();
      expect(speedAt(-500)).toBeNull();
      expect(speedAt(6_500)).toBeNull();
    });

    it("holds the end samples just past the window edge", () => {
      expect(speedAt(500)).toBe(100);
      expect(speedAt(5_500)).toBe(300);
    });

    it("has nothing without data", () => {
      expect(speedLookup([], START, 1_000)(0)).toBeNull();
    });
  });

  describe("trailSpeedGradient", () => {
    // Even time steps, but the car covers twice the distance in the second half.
    const path = {
      coords: [
        [7.42, 43.73],
        [7.421, 43.73],
        [7.423, 43.73],
      ] as [number, number][],
      times: [0, 1_000, 2_000],
    };

    it("places speed stops by distance and fades in from the tail", () => {
      const speeds = new Map([
        [0, 80],
        [1_000, 160],
        [2_000, 300],
      ]);
      const g = trailSpeedGradient(path, (t) => speeds.get(t) ?? null, "#E80020") as unknown[];
      expect(g.slice(0, 3)).toEqual(["interpolate", ["linear"], ["line-progress"]]);
      const stops = g.slice(3);
      expect(stops[0]).toBe(0);
      expect(stops[2]).toBeCloseTo(1 / 3);
      expect(stops[4]).toBe(1);
      expect(stops[1]).toMatch(/,0\.000\)$/); // transparent tail
      expect(stops[5]).toBe(speedToColor(300).replace(/^hsl\((.+)\)$/, "hsla($1,0.900)"));
    });

    it("uses the team colour where there is no car data", () => {
      const g = trailSpeedGradient(path, () => null, "#E80020") as unknown[];
      expect(g.at(-1)).toBe("rgba(232,0,32,0.900)");
    });

    it("falls back to the plain team trail for a stationary car", () => {
      const parked = { coords: [[7.42, 43.73], [7.42, 43.73]] as [number, number][], times: [0, 1] };
      expect(trailSpeedGradient(parked, () => 100, "#E80020")).toEqual(trailGradient("#E80020"));
    });
  });
});
