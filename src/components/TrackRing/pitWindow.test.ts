import { describe, expect, it } from "vitest";
import { cleanRejoinGaps, inPitRejoin } from "./pitWindow";

const pitLoss = { normal: 21, sc: 13, vsc: 15 };

describe("inPitRejoin", () => {
  // Leader 10, A (5 s) at 15 % of the lap, B (15 s) at 5 %; lap 100 s.
  const gaps = new Map([
    [10, 0],
    [1, 3],
    [20, 5],
    [30, 15],
  ]);
  const timeFractions = new Map([
    [10, 0.2],
    [20, 0.15],
    [30, 0.05],
  ]);

  it("moves the pit entry on at field speed and subtracts the pit loss", () => {
    const rejoin = inPitRejoin({
      driver: 1,
      entry: { t: 10_000, fraction: 0.2 },
      entryTf: 0.2,
      t: 20_000,
      lapMs: 100_000,
      pitLoss,
      track: null,
      timeFractions,
      gaps,
    })!;
    // Stayed out: 0.2 + 10 s → 0.3; minus 21 s → 0.09, i.e. 11 s to the leader.
    expect(rejoin.carTf).toBeCloseTo(0.3);
    expect(rejoin.behindTf).toBeCloseTo(0.09);
    expect(rejoin.lossS).toBe(21);
    expect(rejoin.condition).toBe("normal");
    expect(rejoin.projection.position).toBe(3);
    expect(rejoin.projection.ahead?.driverNumber).toBe(20);
    expect(rejoin.projection.ahead?.gapS).toBeCloseTo(6);
    expect(rejoin.projection.behind?.driverNumber).toBe(30);
    expect(rejoin.projection.behind?.gapS).toBeCloseTo(4);
  });

  it("uses the safety-car pit loss when the SC is out", () => {
    const rejoin = inPitRejoin({
      driver: 1,
      entry: { t: 10_000, fraction: 0.2 },
      entryTf: 0.2,
      t: 20_000,
      lapMs: 100_000,
      pitLoss,
      track: { safetyCar: true },
      timeFractions,
      gaps,
    })!;
    expect(rejoin.lossS).toBe(13);
    expect(rejoin.condition).toBe("sc");
  });

  it("is null without a gap for the driver", () => {
    expect(
      inPitRejoin({
        driver: 99,
        entry: { t: 0, fraction: 0 },
        entryTf: 0,
        t: 0,
        lapMs: 100_000,
        pitLoss,
        track: null,
        timeFractions,
        gaps,
      }),
    ).toBeNull();
  });
});

describe("cleanRejoinGaps", () => {
  it("drops stale 0 s gaps on cars that don't lead", () => {
    const gaps = new Map([
      [1, 0],
      [16, 0],
      [44, 4],
    ]);
    expect([...cleanRejoinGaps(gaps, 1)!]).toEqual([
      [1, 0],
      [44, 4],
    ]);
    expect(cleanRejoinGaps(gaps, null)).toBe(gaps);
    expect(cleanRejoinGaps(null, 1)).toBeNull();
  });
});
