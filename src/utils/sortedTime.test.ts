import { describe, expect, it } from "vitest";
import {
  lastAtOrBefore,
  upperBoundByValue,
  windowBoundsByValue,
} from "./sortedTime";

describe("sortedTime", () => {
  const rows = [
    { ms: 10, value: "a" },
    { ms: 20, value: "b" },
    { ms: 20, value: "c" },
    { ms: 35, value: "d" },
  ];

  it("finds the upper bound for sorted numeric values", () => {
    expect(upperBoundByValue(rows, 5, (row) => row.ms)).toBe(0);
    expect(upperBoundByValue(rows, 20, (row) => row.ms)).toBe(3);
    expect(upperBoundByValue(rows, 99, (row) => row.ms)).toBe(4);
  });

  it("returns the last row at or before the cutoff", () => {
    expect(lastAtOrBefore(rows, 9, (row) => row.ms)).toBeUndefined();
    expect(lastAtOrBefore(rows, 20, (row) => row.ms)?.value).toBe("c");
    expect(lastAtOrBefore(rows, 34, (row) => row.ms)?.value).toBe("c");
  });

  it("returns slice bounds for a sorted window", () => {
    expect(windowBoundsByValue(rows, 9, 20, (row) => row.ms)).toEqual({
      startIndex: 0,
      endIndex: 3,
    });
    expect(windowBoundsByValue(rows, 20, 34, (row) => row.ms)).toEqual({
      startIndex: 3,
      endIndex: 3,
    });
  });
});
