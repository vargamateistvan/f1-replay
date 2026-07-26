import React from "react";
import { describe, expect, it, beforeEach, afterEach } from "vitest";
import { renderHook } from "@testing-library/react";
import { MemoryRouter } from "react-router-dom";
import { useTimeline } from "@/timeline/clock";
import { useTimelineUrlSync } from "./useTimelineUrlSync";

function wrapper({ children }: { children: React.ReactNode }) {
  return (
    <MemoryRouter
      initialEntries={["/race"]}
      future={{
        v7_startTransition: true,
        v7_relativeSplatPath: true,
      }}
    >
      {children}
    </MemoryRouter>
  );
}

describe("useTimelineUrlSync", () => {
  beforeEach(() => {
    useTimeline.getState().reset();
    useTimeline.getState().setSpeed(1);
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
});
