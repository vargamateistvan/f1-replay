import { describe, expect, it } from "vitest";
import monaco from "@/data/circuit-geometry/22-2025.json";
import georef from "@/data/circuit-georef.json";
import {
  applySimilarity,
  type CircuitGeoref,
  enuToLngLat,
  f1ToLngLat,
  fitClosedLoops,
  fitSimilarity,
  lngLatToEnu,
  type Point2,
  resampleClosed,
} from "./georef";

// An irregular closed loop (no rotational symmetry) so alignment is unique.
function testLoop(): Point2[] {
  const pts: Point2[] = [];
  for (let i = 0; i < 180; i++) {
    const a = (i / 180) * 2 * Math.PI;
    const r = 1000 + 300 * Math.sin(3 * a) + 120 * Math.cos(5 * a + 0.7);
    pts.push({ x: r * Math.cos(a) * 1.6, y: r * Math.sin(a) });
  }
  return pts;
}

describe("lngLatToEnu / enuToLngLat", () => {
  it("round-trips within a millimetre", () => {
    const p = lngLatToEnu(7.42, 43.73, 7.431, 43.741);
    const [lng, lat] = enuToLngLat(7.42, 43.73, p.x, p.y);
    expect(lng).toBeCloseTo(7.431, 8);
    expect(lat).toBeCloseTo(43.741, 8);
  });

  it("measures about 111 km per degree of latitude", () => {
    expect(lngLatToEnu(0, 0, 0, 1).y).toBeCloseTo(111_319, -1);
  });
});

describe("fitSimilarity", () => {
  it("recovers a known transform exactly", () => {
    const truth = { scale: 0.1, rotation: 0.3, tx: 50, ty: -20 };
    const src = testLoop();
    const dst = src.map((p) => applySimilarity(truth, p));
    const fit = fitSimilarity(src, dst);
    expect(fit.scale).toBeCloseTo(0.1, 9);
    expect(fit.rotation).toBeCloseTo(0.3, 9);
    expect(fit.tx).toBeCloseTo(50, 6);
    expect(fit.ty).toBeCloseTo(-20, 6);
    // Closed-form residual cancels catastrophically near zero; µm is plenty.
    expect(fit.rms).toBeLessThan(1e-3);
  });

  it("rejects mismatched point sets", () => {
    expect(() => fitSimilarity([{ x: 0, y: 0 }], [])).toThrow();
  });
});

describe("resampleClosed", () => {
  it("drops a duplicated closing point and spaces samples evenly", () => {
    const square = [
      { x: 0, y: 0 },
      { x: 10, y: 0 },
      { x: 10, y: 10 },
      { x: 0, y: 10 },
      { x: 0, y: 0 },
    ];
    const out = resampleClosed(square, 8);
    expect(out).toHaveLength(8);
    expect(out[1]).toEqual({ x: 5, y: 0 });
    expect(out[4]).toEqual({ x: 10, y: 10 });
  });
});

describe("fitClosedLoops", () => {
  it("aligns loops with a different start, direction and handedness", () => {
    const truth = { scale: 0.1, rotation: -0.04, tx: 300, ty: 120 };
    const src = testLoop();
    // Reference trace: mirrored, reversed, starting a third of the way round.
    const dst = src
      .map((p) => applySimilarity(truth, { x: p.x, y: -p.y }))
      .reverse();
    const rotated = [...dst.slice(60), ...dst.slice(0, 60)];

    const fit = fitClosedLoops(src, rotated);
    expect(fit.flipY).toBe(true);
    expect(fit.scale).toBeCloseTo(0.1, 3);
    expect(fit.rotation).toBeCloseTo(-0.04, 3);
    expect(fit.rmsNearest).toBeLessThan(1);
  });
});

describe("baked circuit-georef.json", () => {
  const circuits = georef.circuits as Record<string, CircuitGeoref>;

  it("covers every baked circuit geometry file", () => {
    const baked = Object.keys(
      import.meta.glob("@/data/circuit-geometry/*.json"),
    ).map((p) => p.match(/(\d+-\d+)\.json$/)![1]);
    expect(Object.keys(circuits).sort()).toEqual(baked.sort());
  });

  it("places Monaco's start of the centerline in Monte Carlo", () => {
    const geo = circuits["22-2025"]!;
    const [lng, lat] = f1ToLngLat(geo, monaco.x[0]!, monaco.y[0]!);
    expect(lng).toBeGreaterThan(7.41);
    expect(lng).toBeLessThan(7.44);
    expect(lat).toBeGreaterThan(43.73);
    expect(lat).toBeLessThan(43.75);
  });
});
