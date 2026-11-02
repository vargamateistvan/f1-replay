import { describe, expect, it } from "vitest";
import { spreadLabels } from "@/utils/chartLabels";

describe("spreadLabels", () => {
  it("returns an empty map for no labels", () => {
    expect(spreadLabels([], 10, 0, 100).size).toBe(0);
  });

  it("leaves well-separated labels where they are", () => {
    const out = spreadLabels(
      [
        { id: 1, y: 10 },
        { id: 2, y: 50 },
      ],
      10,
      0,
      100,
    );
    expect(out.get(1)).toBe(10);
    expect(out.get(2)).toBe(50);
  });

  it("spreads overlapping labels around their mean, keeping order", () => {
    const out = spreadLabels(
      [
        { id: 2, y: 51 },
        { id: 1, y: 50 },
        { id: 3, y: 52 },
      ],
      10,
      0,
      100,
    );
    expect(out.get(1)).toBeCloseTo(41);
    expect(out.get(2)).toBeCloseTo(51);
    expect(out.get(3)).toBeCloseTo(61);
  });

  it("keeps labels inside the range", () => {
    const out = spreadLabels(
      [
        { id: 1, y: 0 },
        { id: 2, y: 0 },
        { id: 3, y: 100 },
      ],
      10,
      0,
      100,
    );
    expect(out.get(1)).toBe(0);
    expect(out.get(2)).toBe(10);
    expect(out.get(3)).toBe(100);
  });

  it("shrinks the gap when the range is too short", () => {
    const out = spreadLabels(
      [1, 2, 3, 4, 5].map((id) => ({ id, y: 5 })),
      10,
      0,
      20,
    );
    expect([...out.values()].sort((a, b) => a - b)).toEqual([0, 5, 10, 15, 20]);
  });
});
