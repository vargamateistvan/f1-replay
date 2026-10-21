import { describe, expect, it } from "vitest";
import {
  isResultHidden,
  splitAtFirstHidden,
  withWatched,
  type SpoilerState,
} from "./spoilers";

const session = (key: number, end: string) => ({
  session_key: key,
  date_start: end,
  date_end: end,
});

const state = (over: Partial<SpoilerState> = {}): SpoilerState => ({
  enabled: true,
  knownBeforeMs: Date.parse("2026-10-01T00:00:00Z"),
  watched: {},
  ...over,
});

describe("isResultHidden", () => {
  it("never hides anything with the mode off", () => {
    expect(
      isResultHidden(session(1, "2026-10-10T00:00:00Z"), state({ enabled: false })),
    ).toBe(false);
  });

  it("hides sessions that ended after the known-before point", () => {
    expect(isResultHidden(session(1, "2026-10-10T00:00:00Z"), state())).toBe(true);
    expect(isResultHidden(session(2, "2026-09-20T00:00:00Z"), state())).toBe(false);
  });

  it("shows a watched session", () => {
    expect(
      isResultHidden(
        session(1, "2026-10-10T00:00:00Z"),
        state({ watched: { 1: Date.now() } }),
      ),
    ).toBe(false);
  });

  it("falls back to date_start and hides an unparsable date", () => {
    expect(
      isResultHidden({ session_key: 1, date_start: "2026-10-10T00:00:00Z" }, state()),
    ).toBe(true);
    expect(isResultHidden({ session_key: 1, date_start: "nope" }, state())).toBe(true);
  });
});

describe("splitAtFirstHidden", () => {
  it("hides everything after the first hidden round", () => {
    // Round 13 unseen, round 14 watched: 14 stays hidden so 13 can't be inferred.
    const rounds = [12, 13, 14];
    expect(splitAtFirstHidden(rounds, (r) => r === 13)).toEqual({
      visible: [12],
      hidden: [13, 14],
    });
  });

  it("keeps everything when nothing is hidden", () => {
    expect(splitAtFirstHidden([1, 2], () => false)).toEqual({
      visible: [1, 2],
      hidden: [],
    });
  });
});

describe("withWatched", () => {
  it("adds the session", () => {
    expect(withWatched({}, 7, 100, 5)).toEqual({ 7: 100 });
  });

  it("drops the oldest entries over the cap", () => {
    expect(withWatched({ 1: 10, 2: 30, 3: 20 }, 4, 40, 2)).toEqual({ 2: 30, 4: 40 });
  });
});
