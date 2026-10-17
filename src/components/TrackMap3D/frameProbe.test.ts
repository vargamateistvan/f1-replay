import { describe, expect, it, vi } from "vitest";
import { createFrameProbe, map3dDebugEnabled } from "./frameProbe";

describe("createFrameProbe", () => {
  it("reports average and worst work time once per window", () => {
    let clock = 0;
    const report = vi.fn();
    const record = createFrameProbe(1000, report, () => clock);
    clock = 400;
    record(2);
    clock = 800;
    record(6);
    expect(report).not.toHaveBeenCalled();
    clock = 1000;
    record(4);
    expect(report).toHaveBeenCalledWith({ frames: 3, avgMs: 4, maxMs: 6 });
    clock = 1500;
    record(1);
    expect(report).toHaveBeenCalledTimes(1);
  });
});

describe("map3dDebugEnabled", () => {
  it("reads ?debug=map3d", () => {
    expect(map3dDebugEnabled("?debug=map3d&t=5")).toBe(true);
    expect(map3dDebugEnabled("?t=5")).toBe(false);
  });
});
