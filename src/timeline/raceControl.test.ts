import { describe, expect, it } from "vitest";
import type { RaceControl } from "@/api/types";
import {
  buildIncidentWindows,
  clusterRaceControlMarkers,
  deriveTrackFlagState,
  hasAnyMarshalYellow,
  isActiveTrackFlag,
  projectToTimingSectors,
  resolveFlagForMarshalPost,
  timingSectorForMarshalPost,
  normalizeRaceControl,
} from "./raceControl";

const START = new Date("2024-01-01T00:00:00Z").getTime();
const iso = (sec: number) => new Date(START + sec * 1000).toISOString();

function rc(partial: Partial<RaceControl>): RaceControl {
  return {
    category: "Flag",
    date: iso(0),
    driver_number: null,
    flag: null,
    lap_number: null,
    meeting_key: 1,
    message: "",
    qualifying_phase: null,
    scope: "Track",
    sector: null,
    session_key: 1,
    ...partial,
  };
}

describe("buildIncidentWindows safety control phases", () => {
  it("opens and closes a safety-car window from message phrases", () => {
    const events = normalizeRaceControl(
      [
        rc({ date: iso(10), message: "SAFETY CAR DEPLOYED", lap_number: 12 }),
        rc({
          date: iso(55),
          message: "SAFETY CAR IN THIS LAP",
          lap_number: 15,
        }),
      ],
      START,
    );

    expect(buildIncidentWindows(events)).toEqual([
      {
        id: "safety_car-10000",
        kind: "safety_car",
        label: "Safety Car",
        startMs: 10_000,
        endMs: 55_000,
        startLap: 12,
      },
    ]);
  });

  it("handles VSC alias flags and VSC ending message", () => {
    const events = normalizeRaceControl(
      [
        rc({
          date: iso(20),
          flag: "VIRTUAL_SAFETY_CAR",
          message: "VIRTUAL SAFETY CAR DEPLOYED",
          lap_number: 8,
        }),
        rc({ date: iso(36), message: "VSC ENDING", lap_number: 9 }),
      ],
      START,
    );

    expect(buildIncidentWindows(events)).toEqual([
      {
        id: "vsc-20000",
        kind: "vsc",
        label: "Virtual SC",
        startMs: 20_000,
        endMs: 36_000,
        startLap: 8,
      },
    ]);
  });

  it("does not start a safety-car window or track flag on SAFETY CAR LIGHTS ON message", () => {
    const events = normalizeRaceControl(
      [
        rc({ date: iso(5), message: "SAFETY CAR LIGHTS ON", lap_number: 10 }),
        rc({ date: iso(10), message: "SAFETY CAR DEPLOYED", lap_number: 10 }),
        rc({ date: iso(30), message: "SAFETY CAR IN THIS LAP", lap_number: 12 }),
      ],
      START,
    );

    expect(buildIncidentWindows(events)).toEqual([
      {
        id: "safety_car-10000",
        kind: "safety_car",
        label: "Safety Car",
        startMs: 10_000,
        endMs: 30_000,
        startLap: 10,
      },
    ]);

    const stateAt5s = deriveTrackFlagState(
      [rc({ date: iso(5), message: "SAFETY CAR LIGHTS ON" })],
      START,
      START + 5_000,
    );
    expect(stateAt5s).toBeNull();
  });

  it("does not end safety-car window on sector clear with marshal sector numbers", () => {
    const events = normalizeRaceControl(
      [
        rc({ date: iso(10), message: "SAFETY CAR DEPLOYED", lap_number: 5 }),
        rc({
          date: iso(14),
          flag: "CLEAR",
          scope: "Sector",
          sector: 19,
          message: "CLEAR IN TRACK SECTOR 19",
        }),
        rc({ date: iso(30), message: "SAFETY CAR IN THIS LAP", lap_number: 7 }),
      ],
      START,
    );

    expect(buildIncidentWindows(events)).toEqual([
      {
        id: "safety_car-10000",
        kind: "safety_car",
        label: "Safety Car",
        startMs: 10_000,
        endMs: 30_000,
        startLap: 5,
      },
    ]);
  });
});

describe("clusterRaceControlMarkers", () => {
  it("jumps to the earliest event in the cluster even when a later event is more severe", () => {
    const clustered = clusterRaceControlMarkers(
      [
        { id: "a", ms: 10_000, severity: "warning", label: "Yellow Flag" },
        {
          id: "b",
          ms: 15_000,
          severity: "critical",
          label: "Safety Car",
        },
      ],
      20_000,
    );

    expect(clustered).toEqual([
      {
        id: "b",
        // Jump target must be the earliest event's ms (10_000), not the
        // higher-severity representative's ms (15_000) — otherwise clicking
        // the marker would skip past the actual start of the incident.
        ms: 10_000,
        severity: "critical",
        label: "Safety Car (+1 more)",
      },
    ]);
  });
});

describe("deriveTrackFlagState", () => {
  it("tracks independent sector and global flags", () => {
    const state = deriveTrackFlagState(
      [
        rc({ date: iso(10), flag: "YELLOW", scope: "Sector", sector: 2 }),
        rc({ date: iso(12), flag: "YELLOW", scope: "Sector", sector: 3 }),
        rc({ date: iso(20), flag: "SAFETY_CAR", scope: "Track" }),
      ],
      START,
      START + 30_000,
    );

    expect(state).toEqual({
      globalFlag: "SAFETY_CAR",
      marshalFlags: { 2: "YELLOW", 3: "YELLOW" },
      maxMarshalSector: 3,
      updatedAtMs: START + 20_000,
    });
  });

  it("clears only scoped sector on green", () => {
    const state = deriveTrackFlagState(
      [
        rc({ date: iso(9), flag: "SAFETY_CAR", scope: "Track" }),
        rc({ date: iso(10), flag: "YELLOW", scope: "Sector", sector: 2 }),
        rc({ date: iso(18), flag: "GREEN", scope: "Sector", sector: 2 }),
      ],
      START,
      START + 30_000,
    );

    expect(state).toEqual({
      globalFlag: "SAFETY_CAR",
      marshalFlags: {},
      maxMarshalSector: 2,
      updatedAtMs: START + 18_000,
    });
  });

  it("clears the whole track on a track-scoped green flag", () => {
    const state = deriveTrackFlagState(
      [
        rc({ date: iso(6), flag: "YELLOW", scope: "Sector", sector: 1 }),
        rc({ date: iso(7), flag: "YELLOW", scope: "Sector", sector: 3 }),
        rc({ date: iso(8), flag: "YELLOW", scope: "Track" }),
        rc({ date: iso(12), flag: "GREEN", scope: "Track" }),
      ],
      START,
      START + 30_000,
    );

    expect(state).toBeNull();
  });

  it("keeps red flag active when a later safety-car event is received", () => {
    const state = deriveTrackFlagState(
      [
        rc({ date: iso(8), flag: "RED", scope: "Track" }),
        rc({ date: iso(12), flag: "SAFETY_CAR", scope: "Track" }),
      ],
      START,
      START + 30_000,
    );

    expect(state?.globalFlag).toBe("RED");
  });

  it("keeps the safety car shown until the track is actually cleared", () => {
    // "IN THIS LAP" is advance notice: the safety car still leads the field for
    // most of a lap after it, so the track must not go green yet.
    const pending = deriveTrackFlagState(
      [
        rc({ date: iso(8), flag: "SAFETY_CAR", scope: "Track" }),
        rc({ date: iso(12), message: "SAFETY CAR IN THIS LAP" }),
      ],
      START,
      START + 30_000,
    );

    expect(pending?.globalFlag).toBe("SAFETY_CAR");

    const cleared = deriveTrackFlagState(
      [
        rc({ date: iso(8), flag: "SAFETY_CAR", scope: "Track" }),
        rc({ date: iso(12), message: "SAFETY CAR IN THIS LAP" }),
        rc({
          date: iso(80),
          flag: "CLEAR",
          scope: "Track",
          message: "TRACK CLEAR",
        }),
      ],
      START,
      START + 90_000,
    );

    expect(cleared).toBeNull();
  });

  it("clears stale yellow state from sector clear message without a flag value", () => {
    const state = deriveTrackFlagState(
      [
        rc({ date: iso(8), flag: "YELLOW", scope: "Sector", sector: 2 }),
        rc({
          date: iso(12),
          scope: "Sector",
          sector: 2,
          message: "CLEAR IN TRACK SECTOR 2",
        }),
      ],
      START,
      START + 30_000,
    );

    expect(state).toBeNull();
  });

  it("does not clear the safety car on a lights-out notice alone", () => {
    const state = deriveTrackFlagState(
      [
        rc({ date: iso(8), flag: "SAFETY_CAR", scope: "Track" }),
        rc({ date: iso(12), message: "SAFETY CAR LIGHTS OUT" }),
      ],
      START,
      START + 30_000,
    );

    expect(state?.globalFlag).toBe("SAFETY_CAR");
  });

  it("clears only the sector on a sector-scoped green flag", () => {
    const state = deriveTrackFlagState(
      [
        rc({
          date: iso(10),
          message: "SAFETY CAR DEPLOYED",
          flag: "SAFETY_CAR",
          scope: "Track",
        }),
        rc({ date: iso(15), flag: "YELLOW", scope: "Sector", sector: 2 }),
        rc({
          date: iso(30),
          message: "GREEN FLAG",
          flag: "GREEN",
          scope: "Sector",
          sector: 1,
        }),
      ],
      START,
      START + 40_000,
    );

    expect(state).toEqual({
      globalFlag: "SAFETY_CAR",
      marshalFlags: { 2: "YELLOW" },
      maxMarshalSector: 2,
      updatedAtMs: START + 30_000,
    });
  });

  it("ignores yellow-flag infringement penalties as track-yellow state", () => {
    const state = deriveTrackFlagState(
      [
        rc({
          date: iso(10),
          message:
            "FIA STEWARDS: DRIVE THROUGH PENALTY FOR CAR 41 (LIN) - YELLOW FLAG INFRINGEMENT (15:04:49)",
        }),
      ],
      START,
      START + 30_000,
    );

    expect(state).toBeNull();
  });

  it("captures RED flag as globalFlag", () => {
    const state = deriveTrackFlagState(
      [
        rc({ date: iso(10), flag: "YELLOW", scope: "Sector", sector: 1 }),
        rc({ date: iso(20), flag: "RED", scope: "Track", message: "RED FLAG" }),
      ],
      START,
      START + 30_000,
    );

    expect(state?.globalFlag).toBe("RED");
  });

  it("keeps RED global flag when same-timestamp sector CLEAR arrives for sector 17/19", () => {
    const state = deriveTrackFlagState(
      [
        rc({
          date: iso(10),
          flag: "YELLOW",
          scope: "Sector",
          sector: 19,
          message: "YELLOW IN TRACK SECTOR 19",
        }),
        rc({ date: iso(20), flag: "RED", scope: "Track", message: "RED FLAG" }),
        rc({
          date: iso(20),
          flag: "CLEAR",
          scope: "Sector",
          sector: 17,
          message: "CLEAR IN TRACK SECTOR 17",
        }),
        rc({
          date: iso(20),
          flag: "CLEAR",
          scope: "Sector",
          sector: 19,
          message: "CLEAR IN TRACK SECTOR 19",
        }),
      ],
      START,
      START + 30_000,
    );

    expect(state?.globalFlag).toBe("RED");
  });

  it("treats a track-scoped yellow as a whole-track flag even when a sector is set", () => {
    const state = deriveTrackFlagState(
      [
        rc({
          date: iso(10),
          flag: "YELLOW",
          scope: "Track",
          sector: 1,
          message: "YELLOW IN TRACK SECTOR 1",
        }),
        rc({
          date: iso(10),
          flag: "YELLOW",
          scope: "Track",
          sector: 2,
          message: "YELLOW IN TRACK SECTOR 2",
        }),
      ],
      START,
      START + 30_000,
    );

    expect(state).toEqual({
      globalFlag: "YELLOW",
      marshalFlags: {},
      maxMarshalSector: 2,
      updatedAtMs: START + 10_000,
    });
  });

  it("clears the whole track on a track-scoped clear even when a sector is set", () => {
    const state = deriveTrackFlagState(
      [
        rc({ date: iso(10), flag: "YELLOW", scope: "Sector", sector: 19 }),
        rc({ date: iso(12), flag: "YELLOW", scope: "Sector", sector: 17 }),
        rc({ date: iso(20), flag: "YELLOW", scope: "Track", message: "YELLOW FLAG" }),
        rc({
          date: iso(22),
          flag: "CLEAR",
          scope: "Track",
          sector: 19,
          message: "CLEAR IN TRACK SECTOR 19",
        }),
      ],
      START,
      START + 30_000,
    );

    expect(state).toBeNull();
  });

  it("sorts unsorted entries by date before processing", () => {
    const state = deriveTrackFlagState(
      [
        rc({ date: iso(20), flag: "RED", scope: "Track", message: "RED FLAG" }),
        rc({ date: iso(10), flag: "GREEN", scope: "Track" }),
      ],
      START,
      START + 30_000,
    );

    // After sorting: GREEN at 10s, RED at 20s — result should be RED
    expect(state?.globalFlag).toBe("RED");
  });

  it("tracks raw marshal sector flags (e.g. 17/19) independently", () => {
    const state = deriveTrackFlagState(
      [
        rc({ date: iso(10), flag: "YELLOW", scope: "Sector", sector: 19 }),
        rc({ date: iso(11), flag: "YELLOW", scope: "Sector", sector: 17 }),
        rc({ date: iso(20), flag: "CLEAR", scope: "Sector", sector: 17 }),
      ],
      START,
      START + 30_000,
    );

    expect(state?.globalFlag).toBeNull();
    expect(state?.marshalFlags[19]).toBe("YELLOW");
    expect(state?.marshalFlags[17]).toBeUndefined();
  });

  it("applies global red over marshal sector flags", () => {
    const state = deriveTrackFlagState(
      [
        rc({ date: iso(10), flag: "YELLOW", scope: "Sector", sector: 19 }),
        rc({ date: iso(12), flag: "RED", scope: "Track", message: "RED FLAG" }),
      ],
      START,
      START + 30_000,
    );

    expect(state?.globalFlag).toBe("RED");
    expect(state?.marshalFlags[19]).toBe("YELLOW");
  });

  it("normalizes missing flag values from message text", () => {
    const events = normalizeRaceControl(
      [
        rc({
          date: iso(14),
          flag: null,
          scope: "Sector",
          sector: 2,
          message: "YELLOW FLAG IN SECTOR 2",
        }),
      ],
      START,
    );

    expect(events).toHaveLength(1);
    expect(events[0]?.flag).toBe("YELLOW");
    expect(events[0]?.kind).toBe("flag");
    expect(events[0]?.title).toBe("Yellow Flag");
  });
});

describe("flag scope routing", () => {
  it("never lets a waved blue flag become track state", () => {
    // Blue flags are scope "Driver" and are shown to one car. Treating them as
    // track-wide painted the whole map and hid every real sector yellow; a race
    // can carry hundreds of them.
    const state = deriveTrackFlagState(
      [
        rc({
          date: iso(10),
          flag: "YELLOW",
          scope: "Sector",
          sector: 22,
          message: "YELLOW IN TRACK SECTOR 22",
        }),
        rc({
          date: iso(20),
          flag: "BLUE",
          scope: "Driver",
          driver_number: 14,
          message: "WAVED BLUE FLAG FOR CAR 14 (ALO) TIMED AT 15:42:56",
        }),
      ],
      START,
      START + 30_000,
    );

    expect(state?.globalFlag).toBeNull();
    expect(state?.marshalFlags[22]).toBe("YELLOW");
  });

  it("never lets a black-and-white flag displace a safety car", () => {
    const state = deriveTrackFlagState(
      [
        rc({ date: iso(10), flag: "SAFETY_CAR", scope: "Track" }),
        rc({
          date: iso(20),
          flag: "BLACK AND WHITE",
          scope: "Driver",
          driver_number: 44,
          message: "BLACK AND WHITE FLAG FOR CAR 44 (HAM) - TRACK LIMITS",
        }),
      ],
      START,
      START + 30_000,
    );

    expect(state?.globalFlag).toBe("SAFETY_CAR");
  });

  it("retains marshal post numbers well above the three timing sectors", () => {
    // OpenF1's `sector` is a marshal post; circuits run 15-23 of them. Keeping
    // only 1/2/3 discarded almost every yellow flag.
    const state = deriveTrackFlagState(
      [
        rc({
          date: iso(10),
          flag: "YELLOW",
          scope: "Sector",
          sector: 23,
          message: "YELLOW IN TRACK SECTOR 23",
        }),
        rc({
          date: iso(11),
          flag: "DOUBLE YELLOW",
          scope: "Sector",
          sector: 10,
          message: "DOUBLE YELLOW IN TRACK SECTOR 10",
        }),
      ],
      START,
      START + 30_000,
    );

    expect(state?.marshalFlags).toEqual({
      10: "DOUBLE_YELLOW",
      23: "YELLOW",
    });
    expect(state?.maxMarshalSector).toBe(23);
  });

  it("reports the highest marshal post in the feed even beyond the cutoff", () => {
    // The projection denominator must not shift as the playhead advances.
    const state = deriveTrackFlagState(
      [
        rc({ date: iso(10), flag: "YELLOW", scope: "Sector", sector: 2 }),
        rc({ date: iso(900), flag: "YELLOW", scope: "Sector", sector: 21 }),
      ],
      START,
      START + 30_000,
    );

    expect(state?.maxMarshalSector).toBe(21);
    expect(state?.marshalFlags).toEqual({ 2: "YELLOW" });
  });

  it("does not let a pit-exit green clear a red flag", () => {
    const state = deriveTrackFlagState(
      [
        rc({ date: iso(10), flag: "RED", scope: "Track", message: "RED FLAG" }),
        rc({
          date: iso(20),
          flag: "GREEN",
          scope: "Track",
          message: "GREEN LIGHT - PIT EXIT OPEN",
        }),
      ],
      START,
      START + 30_000,
    );

    expect(state?.globalFlag).toBe("RED");
  });

  it("does not read a chequered flag as a red flag", () => {
    // "CHEQUERED FLAG" contains the substring "RED FLAG".
    const state = deriveTrackFlagState(
      [rc({ date: iso(10), flag: null, scope: "Track", message: "CHEQUERED FLAG" })],
      START,
      START + 30_000,
    );

    expect(state?.globalFlag).toBe("CHEQUERED");
  });
});

describe("timing sector projection", () => {
  it("splits marshal posts into thirds of the lap", () => {
    expect(timingSectorForMarshalPost(1, 23)).toBe(1);
    expect(timingSectorForMarshalPost(7, 23)).toBe(1);
    expect(timingSectorForMarshalPost(8, 23)).toBe(2);
    expect(timingSectorForMarshalPost(15, 23)).toBe(2);
    expect(timingSectorForMarshalPost(16, 23)).toBe(3);
    expect(timingSectorForMarshalPost(23, 23)).toBe(3);
  });

  it("clamps out-of-range posts and tolerates a zero total", () => {
    expect(timingSectorForMarshalPost(99, 23)).toBe(3);
    expect(timingSectorForMarshalPost(0, 23)).toBe(1);
    expect(timingSectorForMarshalPost(5, 0)).toBe(1);
  });

  it("projects each marshal post onto its timing sector", () => {
    const state = deriveTrackFlagState(
      [
        rc({ date: iso(10), flag: "YELLOW", scope: "Sector", sector: 2 }),
        rc({ date: iso(11), flag: "YELLOW", scope: "Sector", sector: 10 }),
        rc({ date: iso(12), flag: "DOUBLE YELLOW", scope: "Sector", sector: 22 }),
      ],
      START,
      START + 30_000,
    );

    expect(projectToTimingSectors(state, 23)).toEqual({
      1: "YELLOW",
      2: "YELLOW",
      3: "DOUBLE_YELLOW",
    });
  });

  it("keeps the more severe flag when two posts share a timing sector", () => {
    const state = deriveTrackFlagState(
      [
        rc({ date: iso(10), flag: "YELLOW", scope: "Sector", sector: 1 }),
        rc({ date: iso(11), flag: "DOUBLE YELLOW", scope: "Sector", sector: 2 }),
      ],
      START,
      START + 30_000,
    );

    expect(projectToTimingSectors(state, 12)[1]).toBe("DOUBLE_YELLOW");
  });

  it("spreads an active track-wide flag over all three sectors", () => {
    const state = deriveTrackFlagState(
      [
        rc({ date: iso(10), flag: "YELLOW", scope: "Sector", sector: 2 }),
        rc({ date: iso(20), flag: "RED", scope: "Track", message: "RED FLAG" }),
      ],
      START,
      START + 30_000,
    );

    expect(projectToTimingSectors(state, 23)).toEqual({
      1: "RED",
      2: "RED",
      3: "RED",
    });
  });

  it("uses the feed's own post count when the caller passes none", () => {
    const state = deriveTrackFlagState(
      [rc({ date: iso(10), flag: "YELLOW", scope: "Sector", sector: 22 })],
      START,
      START + 30_000,
    );

    expect(projectToTimingSectors(state, 0)[3]).toBe("YELLOW");
  });

  it("returns empty sectors for a null state", () => {
    expect(projectToTimingSectors(null, 23)).toEqual({
      1: null,
      2: null,
      3: null,
    });
  });
});

describe("flag resolution for painting", () => {
  it("treats only track-condition flags as paintable", () => {
    expect(isActiveTrackFlag("YELLOW")).toBe(true);
    expect(isActiveTrackFlag("RED")).toBe(true);
    expect(isActiveTrackFlag("VIRTUAL_SC")).toBe(true);
    expect(isActiveTrackFlag("CHEQUERED")).toBe(false);
    expect(isActiveTrackFlag("BLUE")).toBe(false);
    expect(isActiveTrackFlag("GREEN")).toBe(false);
    expect(isActiveTrackFlag(null)).toBe(false);
  });

  it("lets an inactive global flag fall through to the post's own flag", () => {
    const state = deriveTrackFlagState(
      [
        rc({ date: iso(10), flag: "CHEQUERED", scope: "Track", message: "CHEQUERED FLAG" }),
        rc({
          date: iso(20),
          flag: "YELLOW",
          scope: "Sector",
          sector: 17,
          message: "YELLOW IN TRACK SECTOR 17",
        }),
      ],
      START,
      START + 30_000,
    );

    expect(resolveFlagForMarshalPost(state, 17)).toBe("YELLOW");
    expect(resolveFlagForMarshalPost(state, 18)).toBeNull();
  });

  it("lets an active global flag win over every post", () => {
    const state = deriveTrackFlagState(
      [
        rc({ date: iso(10), flag: "YELLOW", scope: "Sector", sector: 17 }),
        rc({ date: iso(20), flag: "RED", scope: "Track", message: "RED FLAG" }),
      ],
      START,
      START + 30_000,
    );

    expect(resolveFlagForMarshalPost(state, 17)).toBe("RED");
    expect(resolveFlagForMarshalPost(state, 4)).toBe("RED");
    expect(resolveFlagForMarshalPost(null, 4)).toBeNull();
  });

  it("detects a yellow at any marshal post", () => {
    const yellow = deriveTrackFlagState(
      [rc({ date: iso(10), flag: "DOUBLE YELLOW", scope: "Sector", sector: 23 })],
      START,
      START + 30_000,
    );
    const red = deriveTrackFlagState(
      [rc({ date: iso(10), flag: "RED", scope: "Track", message: "RED FLAG" })],
      START,
      START + 30_000,
    );

    expect(hasAnyMarshalYellow(yellow)).toBe(true);
    expect(hasAnyMarshalYellow(red)).toBe(false);
    expect(hasAnyMarshalYellow(null)).toBe(false);
  });
});
