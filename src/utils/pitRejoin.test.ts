import { describe, expect, it } from "vitest";
import type { Interval } from "@/api/types";
import {
  latestGapsToLeader,
  parsePitLoss,
  pitLossFor,
  projectPitRejoin,
} from "./pitRejoin";

function iv(
  driver_number: number,
  sec: number,
  gap_to_leader: Interval["gap_to_leader"],
): Interval {
  return {
    date: new Date(Date.UTC(2024, 0, 1, 12, 0, sec)).toISOString(),
    driver_number,
    gap_to_leader,
    interval: null,
    meeting_key: 1,
    session_key: 1,
  };
}

describe("parsePitLoss", () => {
  it("parses baked strings into seconds", () => {
    expect(
      parsePitLoss({ normal: "20.98", sc: "13.29", vsc: "15.18" }),
    ).toEqual({ normal: 20.98, sc: 13.29, vsc: 15.18 });
  });

  it("requires a positive normal value", () => {
    expect(parsePitLoss(undefined)).toBeNull();
    expect(parsePitLoss({ sc: "13" })).toBeNull();
    expect(parsePitLoss({ normal: "abc" })).toBeNull();
    expect(parsePitLoss({ normal: "21", sc: "" })).toEqual({
      normal: 21,
      sc: null,
      vsc: null,
    });
  });
});

describe("pitLossFor", () => {
  const loss = { normal: 21, sc: 13, vsc: 15 };

  it("uses the cheapest stop for the current neutralisation", () => {
    expect(pitLossFor(loss, null)).toEqual({
      seconds: 21,
      condition: "normal",
    });
    expect(pitLossFor(loss, { vsc: true })).toEqual({
      seconds: 15,
      condition: "vsc",
    });
    expect(pitLossFor(loss, { safetyCar: true, vsc: true })).toEqual({
      seconds: 13,
      condition: "sc",
    });
  });

  it("falls back to the green-flag loss when a neutralised value is missing", () => {
    expect(
      pitLossFor({ normal: 21, sc: null, vsc: null }, { safetyCar: true }),
    ).toEqual({ seconds: 21, condition: "normal" });
  });
});

describe("latestGapsToLeader", () => {
  it("keeps each driver's latest gap before the cutoff", () => {
    const cutoff = Date.UTC(2024, 0, 1, 12, 0, 10);
    const gaps = latestGapsToLeader(
      [
        iv(1, 1, null),
        iv(4, 1, "+3.100"),
        iv(4, 9, 3.4),
        iv(4, 11, 99), // after cutoff
        iv(16, 5, "+1 LAP"),
      ],
      cutoff,
    );
    expect(gaps).toEqual(
      new Map([
        [1, 0],
        [4, 3.4],
      ]),
    );
  });
});

describe("projectPitRejoin", () => {
  const gaps = new Map([
    [1, 0],
    [4, 2.5],
    [16, 12],
    [44, 22],
    [63, 30],
  ]);

  it("ranks the driver after adding the pit loss", () => {
    // Car 4: 2.5 + 21 = 23.5 → behind 44 (22), ahead of 63 (30).
    expect(projectPitRejoin(gaps, 4, 21)).toEqual({
      position: 4,
      ahead: { driverNumber: 44, gapS: 1.5 },
      behind: { driverNumber: 63, gapS: 6.5 },
    });
  });

  it("keeps the lead when the margin covers the stop", () => {
    const big = new Map([
      [1, 0],
      [4, 25],
    ]);
    expect(projectPitRejoin(big, 1, 21)).toEqual({
      position: 1,
      ahead: null,
      behind: { driverNumber: 4, gapS: 4 },
    });
  });

  it("drops to last with no car behind", () => {
    expect(projectPitRejoin(gaps, 63, 21)?.position).toBe(5);
    expect(projectPitRejoin(gaps, 63, 21)?.behind).toBeNull();
  });

  it("gives ties to the car already on track", () => {
    expect(projectPitRejoin(gaps, 4, 9.5)?.ahead).toEqual({
      driverNumber: 16,
      gapS: 0,
    });
  });

  it("ignores excluded (retired) cars", () => {
    expect(projectPitRejoin(gaps, 4, 21, new Set([44]))?.position).toBe(3);
  });

  it("returns null without a gap or when the order is ambiguous", () => {
    expect(projectPitRejoin(gaps, 99, 21)).toBeNull();
    expect(
      projectPitRejoin(
        new Map([
          [1, 0],
          [4, 0],
          [16, 1],
        ]),
        16,
        21,
      ),
    ).toBeNull();
  });
});
