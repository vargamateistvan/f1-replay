import { describe, expect, it } from "vitest";
import {
  buildDriverTimeIndex,
  countPerDriverAt,
  latestPerDriverAt,
} from "./driverTimeIndex";

interface Rec {
  driver_number: number;
  t: number;
  v: string;
}

const rec = (driver_number: number, t: number, v: string): Rec => ({
  driver_number,
  t,
  v,
});

describe("buildDriverTimeIndex", () => {
  it("groups by driver and sorts by time", () => {
    const index = buildDriverTimeIndex(
      [rec(1, 30, "c"), rec(2, 10, "x"), rec(1, 10, "a"), rec(1, 20, "b")],
      (r) => r.t,
    );
    expect(index.get(1)?.items.map((r) => r.v)).toEqual(["a", "b", "c"]);
    expect(index.get(1)?.ms).toEqual([10, 20, 30]);
    expect(index.get(2)?.items.map((r) => r.v)).toEqual(["x"]);
  });

  it("keeps input order for equal timestamps", () => {
    const index = buildDriverTimeIndex(
      [rec(1, 10, "first"), rec(1, 10, "second")],
      (r) => r.t,
    );
    expect(index.get(1)?.items.map((r) => r.v)).toEqual(["first", "second"]);
  });

  it("drops records with invalid timestamps", () => {
    const index = buildDriverTimeIndex(
      [rec(1, Number.NaN, "bad"), rec(1, 5, "ok")],
      (r) => r.t,
    );
    expect(index.get(1)?.items.map((r) => r.v)).toEqual(["ok"]);
  });
});

describe("latestPerDriverAt", () => {
  const index = buildDriverTimeIndex(
    [rec(1, 10, "a"), rec(1, 20, "b"), rec(1, 20, "b2"), rec(2, 25, "x")],
    (r) => r.t,
  );

  it("returns the last record at or before the cutoff", () => {
    const at = latestPerDriverAt(index, 20);
    expect(at.get(1)?.v).toBe("b2");
    expect(at.has(2)).toBe(false);
  });

  it("omits drivers with no record yet", () => {
    expect(latestPerDriverAt(index, 5).size).toBe(0);
  });

  it("matches a linear scan over unsorted input", () => {
    const records = [rec(3, 50, "late"), rec(3, 5, "early"), rec(3, 30, "mid")];
    const at = latestPerDriverAt(
      buildDriverTimeIndex(records, (r) => r.t),
      40,
    );
    expect(at.get(3)?.v).toBe("mid");
  });
});

describe("countPerDriverAt", () => {
  it("counts records at or before the cutoff", () => {
    const index = buildDriverTimeIndex(
      [rec(1, 10, "a"), rec(1, 20, "b"), rec(2, 30, "x")],
      (r) => r.t,
    );
    const counts = countPerDriverAt(index, 20);
    expect(counts.get(1)).toBe(2);
    expect(counts.has(2)).toBe(false);
  });
});
