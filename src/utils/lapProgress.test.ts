import { describe, expect, it } from "vitest";
import {
  buildArcPath,
  forwardSpan,
  layoutRingLabels,
  projectOntoPath,
  ringArcPath,
  ringPoint,
  wrapFraction,
} from "./lapProgress";

// 100 × 100 square, clockwise in SVG space, 4 sides of 100 → length 400.
const square = buildArcPath(
  [
    { sx: 0, sy: 0 },
    { sx: 100, sy: 0 },
    { sx: 100, sy: 100 },
    { sx: 0, sy: 100 },
  ],
  true,
);

// Densely sampled square (5 units apart) for the windowed search.
function denseSquare() {
  const pts: { sx: number; sy: number }[] = [];
  for (let i = 0; i < 20; i++) pts.push({ sx: i * 5, sy: 0 });
  for (let i = 0; i < 20; i++) pts.push({ sx: 100, sy: i * 5 });
  for (let i = 0; i < 20; i++) pts.push({ sx: 100 - i * 5, sy: 100 });
  for (let i = 0; i < 20; i++) pts.push({ sx: 0, sy: 100 - i * 5 });
  return buildArcPath(pts, true);
}

describe("buildArcPath", () => {
  it("includes the closing segment of a closed lap", () => {
    expect(square.length).toBe(400);
    expect(Array.from(square.arc)).toEqual([0, 0.25, 0.5, 0.75]);
  });

  it("an open path ends at fraction 1", () => {
    const line = buildArcPath(
      [
        { sx: 0, sy: 0 },
        { sx: 30, sy: 0 },
        { sx: 30, sy: 10 },
      ],
      false,
    );
    expect(line.length).toBe(40);
    expect(line.arc[2]).toBe(1);
  });
});

describe("projectOntoPath", () => {
  it("projects onto segments, not just vertices", () => {
    const p = projectOntoPath(square, 50, -3)!;
    expect(p.fraction).toBeCloseTo(0.125);
    expect(p.dist).toBeCloseTo(3);
  });

  it("covers the closing segment back to the start line", () => {
    const p = projectOntoPath(square, 0, 50)!;
    expect(p.fraction).toBeCloseTo(0.875);
  });

  it("wraps the very end of the lap to 0", () => {
    const p = projectOntoPath(square, 0, 0)!;
    expect(p.fraction).toBeCloseTo(0);
  });

  it("clamps to the ends of an open path", () => {
    const line = buildArcPath(
      [
        { sx: 0, sy: 0 },
        { sx: 10, sy: 0 },
      ],
      false,
    );
    expect(projectOntoPath(line, -5, 0)!.fraction).toBe(0);
    expect(projectOntoPath(line, 50, 0)!.fraction).toBe(1);
  });

  it("uses the hint window and falls back to a full scan when it's too far", () => {
    const path = denseSquare();
    const near = projectOntoPath(path, 12, 1)!;
    // Windowed around the right segment: same answer as the full scan.
    expect(projectOntoPath(path, 12, 1, near.segment, 4, 5)).toEqual(near);
    // Hint on the far side of the lap (a seek): the window misses, full scan wins.
    const afterSeek = projectOntoPath(path, 12, 1, 45, 4, 5)!;
    expect(afterSeek.fraction).toBeCloseTo(near.fraction);
  });

  it("keeps a car on its own stretch where the hint window allows", () => {
    const path = denseSquare();
    // (50, 50) is equidistant from all sides; the hint decides.
    const p = projectOntoPath(path, 50, 50, 30, 4)!;
    expect(p.fraction).toBeGreaterThan(0.25);
    expect(p.fraction).toBeLessThan(0.5);
  });

  it("returns null for a path with no segments", () => {
    expect(projectOntoPath(buildArcPath([{ sx: 0, sy: 0 }], true), 0, 0)).toBeNull();
  });
});

describe("fractions", () => {
  it("wraps into [0, 1)", () => {
    expect(wrapFraction(1.25)).toBeCloseTo(0.25);
    expect(wrapFraction(-0.25)).toBeCloseTo(0.75);
    expect(wrapFraction(1)).toBe(0);
  });

  it("measures the forward span across the start/finish line", () => {
    expect(forwardSpan(0.95, 0.05)).toBeCloseTo(0.1);
    expect(forwardSpan(0.2, 0.3)).toBeCloseTo(0.1);
  });
});

describe("ringPoint / ringArcPath", () => {
  it("starts at 12 o'clock and runs clockwise", () => {
    const top = ringPoint(0, 0, 10, 0);
    expect(top.x).toBeCloseTo(0);
    expect(top.y).toBeCloseTo(-10);
    const right = ringPoint(0, 0, 10, 0.25);
    expect(right.x).toBeCloseTo(10);
    expect(right.y).toBeCloseTo(0);
  });

  it("uses the large-arc flag past half a lap", () => {
    expect(ringArcPath(0, 0, 10, 0, 0.25)).toContain(" 0 0 1 ");
    expect(ringArcPath(0, 0, 10, 0, 0.75)).toContain(" 0 1 1 ");
  });

  it("draws the short way across the start/finish line", () => {
    expect(ringArcPath(0, 0, 10, 0.9, 0.1)).toContain(" 0 0 1 ");
  });

  it("draws a full lap as two half arcs and nothing for an empty span", () => {
    expect(ringArcPath(0, 0, 10, 0, 1).match(/A/g)).toHaveLength(2);
    expect(ringArcPath(0, 0, 10, 0.3, 0.3)).toBe("");
  });
});

describe("layoutRingLabels", () => {
  const gapBetween = (a: number, b: number) => {
    const d = Math.abs(a - b);
    return Math.min(d, 1 - d);
  };

  it("leaves well-spaced labels where they are", () => {
    const out = layoutRingLabels(
      [
        { id: 1, fraction: 0.1 },
        { id: 2, fraction: 0.5 },
      ],
      0.03,
    );
    expect(out.get(1)).toBeCloseTo(0.1);
    expect(out.get(2)).toBeCloseTo(0.5);
  });

  it("pushes a cluster apart symmetrically", () => {
    const out = layoutRingLabels(
      [
        { id: 1, fraction: 0.5 },
        { id: 2, fraction: 0.5 },
        { id: 3, fraction: 0.5 },
      ],
      0.03,
    );
    const ps = [1, 2, 3].map((id) => out.get(id)!).sort((a, b) => a - b);
    expect(ps[1]! - ps[0]!).toBeGreaterThanOrEqual(0.03 - 1e-6);
    expect(ps[2]! - ps[1]!).toBeGreaterThanOrEqual(0.03 - 1e-6);
    expect((ps[0]! + ps[2]!) / 2).toBeCloseTo(0.5);
  });

  it("spreads labels across 12 o'clock", () => {
    const out = layoutRingLabels(
      [
        { id: 1, fraction: 0.995 },
        { id: 2, fraction: 0.005 },
      ],
      0.04,
    );
    expect(gapBetween(out.get(1)!, out.get(2)!)).toBeGreaterThanOrEqual(0.04 - 1e-6);
    // Still either side of the line, in order.
    expect(out.get(1)!).toBeGreaterThan(0.9);
    expect(out.get(2)!).toBeLessThan(0.1);
  });

  it("shrinks the gap when the lap can't fit every label", () => {
    const items = Array.from({ length: 50 }, (_, i) => ({ id: i, fraction: 0.5 }));
    const out = layoutRingLabels(items, 0.05);
    const ps = [...out.values()].sort((a, b) => a - b);
    for (let i = 1; i < ps.length; i++) {
      expect(ps[i]! - ps[i - 1]!).toBeGreaterThan(0.015);
    }
  });

  it("handles empty and single inputs", () => {
    expect(layoutRingLabels([], 0.03).size).toBe(0);
    expect(layoutRingLabels([{ id: 7, fraction: 1.2 }], 0.03).get(7)).toBeCloseTo(0.2);
  });
});
