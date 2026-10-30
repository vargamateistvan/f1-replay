import { describe, expect, it } from "vitest";
import { minisectorClass } from "./sectorColors";

describe("minisectorClass", () => {
  it("follows OpenF1's segment codes", () => {
    expect(minisectorClass(2051)).toBe("bg-purple");
    expect(minisectorClass(2049)).toBe("bg-green");
    expect(minisectorClass(2048)).toBe("bg-yellow");
    expect(minisectorClass(2064)).toBe("bg-blue");
    expect(minisectorClass(0)).toBe("bg-panel");
    expect(minisectorClass(2050)).toBe("bg-faint");
  });
});
