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
    useTimeline.getState().reset();
    useTimeline.getState().setSpeed(1);
    searchParamsState.searchParams = new URLSearchParams();
    searchParamsState.setSearchParams.mockReset();
  });

  afterEach(() => {
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
});
