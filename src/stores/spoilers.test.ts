import { beforeEach, describe, expect, it } from "vitest";
import { SPOILER_RECENT_WINDOW_MS } from "@/constants";
import { useSpoilers } from "./spoilers";

beforeEach(() => {
  useSpoilers.setState({ enabled: false, knownBeforeMs: 0, watched: {} });
});

describe("useSpoilers", () => {
  it("treats the recent window as unseen when turned on", () => {
    useSpoilers.getState().setEnabled(true, 1_000_000_000_000);
    expect(useSpoilers.getState().enabled).toBe(true);
    expect(useSpoilers.getState().knownBeforeMs).toBe(
      1_000_000_000_000 - SPOILER_RECENT_WINDOW_MS,
    );
  });

  it("keeps the known-before point when turned off", () => {
    useSpoilers.getState().setEnabled(true, 1_000_000_000_000);
    const known = useSpoilers.getState().knownBeforeMs;
    useSpoilers.getState().setEnabled(false);
    expect(useSpoilers.getState().knownBeforeMs).toBe(known);
  });

  it("marks a session watched once", () => {
    useSpoilers.getState().markWatched(9, 100);
    useSpoilers.getState().markWatched(9, 200);
    expect(useSpoilers.getState().watched).toEqual({ 9: 100 });
  });

  it("reveals everything finished so far", () => {
    useSpoilers.getState().revealAll(5_000);
    expect(useSpoilers.getState().knownBeforeMs).toBe(5_000);
  });
});
