import React from "react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { renderHook } from "@testing-library/react";
import { useTimeline } from "@/timeline/clock";
import { useTimelineUrlSync } from "./useTimelineUrlSync";

const searchParamsState = {
  searchParams: new URLSearchParams(),
  setSearchParams: vi.fn(),
};

vi.mock("react-router-dom", async () => {
  const actual = await vi.importActual<typeof import("react-router-dom")>(
    "react-router-dom",
  );
  return {
    ...actual,
    useSearchParams: () => [
      searchParamsState.searchParams,
      searchParamsState.setSearchParams,
    ],
  };
});

function wrapper({ children }: { children: React.ReactNode }) {
  return <>{children}</>;
}

describe("useTimelineUrlSync", () => {
  beforeEach(() => {
    window.history.replaceState({}, "", "/?session=1");
    useTimeline.getState().reset();
    useTimeline.getState().setSpeed(1);
    searchParamsState.searchParams = new URLSearchParams();
    searchParamsState.setSearchParams.mockReset();
  });

  afterEach(() => {
    vi.useRealTimers();
    window.history.replaceState({}, "", "/");
  });

  it("restores allowed speed values from URL", () => {
    window.history.replaceState({}, "", "/race?speed=8");

    renderHook(() => useTimelineUrlSync(1, true), { wrapper });

    expect(useTimeline.getState().speed).toBe(8);
  });

  it("ignores unsupported speed values from URL", () => {
    useTimeline.getState().setSpeed(2);
    window.history.replaceState({}, "", "/race?speed=999");

    renderHook(() => useTimelineUrlSync(1, true), { wrapper });

    expect(useTimeline.getState().speed).toBe(2);
  });

  it("ignores zero speed from URL", () => {
    useTimeline.getState().setSpeed(4);
    window.history.replaceState({}, "", "/race?speed=0");

    renderHook(() => useTimelineUrlSync(1, true), { wrapper });

    expect(useTimeline.getState().speed).toBe(4);
  });

  it("ignores negative speed from URL", () => {
    useTimeline.getState().setSpeed(16);
    window.history.replaceState({}, "", "/race?speed=-2");

    renderHook(() => useTimelineUrlSync(1, true), { wrapper });

    expect(useTimeline.getState().speed).toBe(16);
  });

  it("ignores decimal speed from URL", () => {
    useTimeline.getState().setSpeed(1);
    window.history.replaceState({}, "", "/race?speed=1.5");

    renderHook(() => useTimelineUrlSync(1, true), { wrapper });

    expect(useTimeline.getState().speed).toBe(1);
  });

  it("ignores non-numeric speed from URL", () => {
    useTimeline.getState().setSpeed(8);
    window.history.replaceState({}, "", "/race?speed=fast");

    renderHook(() => useTimelineUrlSync(1, true), { wrapper });

    expect(useTimeline.getState().speed).toBe(8);
  });

  it("restores finite non-negative playhead from URL", () => {
    window.history.replaceState({}, "", "/race?t=12");

    renderHook(() => useTimelineUrlSync(1, true), { wrapper });

    expect(useTimeline.getState().t).toBe(12_000);
  });

  it("ignores non-finite playhead values from URL", () => {
    useTimeline.getState().setT(5_000);
    window.history.replaceState({}, "", "/race?t=Infinity");

    renderHook(() => useTimelineUrlSync(1, true), { wrapper });

    expect(useTimeline.getState().t).toBe(5_000);
  });

  it("ignores negative playhead values from URL", () => {
    useTimeline.getState().setT(9_000);
    window.history.replaceState({}, "", "/race?t=-3");

    renderHook(() => useTimelineUrlSync(1, true), { wrapper });

    expect(useTimeline.getState().t).toBe(9_000);
  });

  it("persists playhead changes while playback is running", () => {
    renderHook(() => useTimelineUrlSync(1, true), { wrapper });

    useTimeline.getState().setPlaying(true);
    useTimeline.getState().setT(5_000);

    expect(searchParamsState.setSearchParams).toHaveBeenCalled();
  });

  it("persists the playhead after playback stops", () => {
    renderHook(() => useTimelineUrlSync(1, true), { wrapper });

    useTimeline.getState().setPlaying(true);
    useTimeline.getState().setT(5_000);
    useTimeline.getState().setPlaying(false);
    useTimeline.getState().setT(6_000);

    expect(searchParamsState.setSearchParams).toHaveBeenCalled();
  });

  it("does not let a queued playhead write overwrite a newly selected session", () => {
    vi.useFakeTimers();
    window.history.replaceState({}, "", "/?meeting=1298&session=11398");
    searchParamsState.searchParams = new URLSearchParams(window.location.search);
    searchParamsState.setSearchParams.mockImplementation(
      (updater: (params: URLSearchParams) => URLSearchParams) => {
        updater(searchParamsState.searchParams);
      },
    );
    const { rerender } = renderHook(
      ({ sessionKey }) => useTimelineUrlSync(sessionKey, true),
      { initialProps: { sessionKey: 11398 }, wrapper },
    );
    useTimeline.getState().setT(12_000);
    useTimeline.getState().setT(13_000);
    searchParamsState.setSearchParams.mockClear();

    // The URL changes before the previous store subscription is cleaned up.
    window.history.replaceState({}, "", "/?meeting=1298&session=11397");
    vi.runOnlyPendingTimers();
    expect(new URLSearchParams(window.location.search).get("session")).toBe("11397");
    rerender({ sessionKey: 11397 });

    expect(new URLSearchParams(window.location.search).get("session")).toBe("11397");
    expect(searchParamsState.setSearchParams).not.toHaveBeenCalled();
    expect(useTimeline.getState().t).toBe(0);
  });

  it("preserves current navigation params instead of the subscription's stale params", () => {
    searchParamsState.searchParams = new URLSearchParams(
      "session=1&view=tracker",
    );
    searchParamsState.setSearchParams.mockImplementation(
      (updater: (params: URLSearchParams) => URLSearchParams) => {
        updater(searchParamsState.searchParams);
      },
    );
    renderHook(() => useTimelineUrlSync(1, true), { wrapper });
    window.history.replaceState({}, "", "/?session=1&view=commentary&focus=44");

    useTimeline.getState().setT(5_000);

    const params = new URLSearchParams(window.location.search);
    expect(params.get("view")).toBe("commentary");
    expect(params.get("focus")).toBe("44");
    expect(params.get("t")).toBe("5");
  });
});
