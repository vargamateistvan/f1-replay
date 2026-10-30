import { StrictMode, createElement } from "react";
import { act, renderHook } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { trackEvent } from "@/lib/analytics";
import { useReplayStartup } from "./useReplayStartup";

vi.mock("@/lib/analytics", () => ({ trackEvent: vi.fn() }));

const initial = {
  sessionKey: 123,
  sessionReady: true,
  timingReady: false,
  coreSettled: false,
  needsLocation: true,
  locationSettled: false,
  locationReady: false,
  live: false,
};

describe("useReplayStartup", () => {
  beforeEach(() => vi.clearAllMocks());

  it("waits for core requests and the visible GPS window before releasing feeds", () => {
    const { result, rerender } = renderHook(useReplayStartup, { initialProps: initial });
    expect(result.current).toBe(false);
    rerender({ ...initial, coreSettled: true });
    expect(result.current).toBe(false);
    rerender({ ...initial, coreSettled: true, locationSettled: true });
    expect(result.current).toBe(true);
  });

  it("does not wait for GPS on timing-only mobile or commentary views", () => {
    const { result } = renderHook(() => useReplayStartup({
      ...initial, coreSettled: true, needsLocation: false,
    }));
    expect(result.current).toBe(true);
  });

  it("releases feeds after GPS failure or empty success without reporting readiness", () => {
    const { result } = renderHook(() => useReplayStartup({
      ...initial, coreSettled: true, locationSettled: true, timingReady: true,
    }));
    expect(result.current).toBe(true);
    expect(trackEvent).not.toHaveBeenCalledWith("replay_data_ready", expect.anything());
    expect(trackEvent).not.toHaveBeenCalledWith("replay_location_ready", expect.anything());
  });

  it("keeps feeds enabled during seeks, view changes and retries", () => {
    const { result, rerender } = renderHook(useReplayStartup, { initialProps: {
      ...initial, coreSettled: true, locationSettled: true,
    } });
    expect(result.current).toBe(true);
    rerender({ ...initial, coreSettled: false, locationSettled: false });
    expect(result.current).toBe(true);
  });

  it("stages each new session independently, including switching back", () => {
    const { result, rerender } = renderHook(useReplayStartup, { initialProps: {
      ...initial, coreSettled: true, locationSettled: true,
    } });
    rerender({ ...initial, sessionKey: 456 });
    expect(result.current).toBe(false);
    rerender(initial);
    expect(result.current).toBe(false);
    expect(vi.mocked(trackEvent).mock.calls.filter(
      ([name]) => name === "replay_load_started",
    )).toHaveLength(3);
  });

  it("does not release feeds before a session is selected", () => {
    const { result } = renderHook(() => useReplayStartup({
      ...initial, sessionKey: null, coreSettled: true, needsLocation: false,
    }));
    expect(result.current).toBe(false);
    expect(trackEvent).not.toHaveBeenCalled();
  });

  it("emits each milestone once even with StrictMode effect replay", () => {
    const { rerender } = renderHook(useReplayStartup, {
      initialProps: initial,
      wrapper: ({ children }) => createElement(StrictMode, null, children),
    });
    const ready = {
      ...initial, coreSettled: true, timingReady: true,
      locationSettled: true, locationReady: true,
    };
    rerender(ready);
    rerender({ ...ready, live: true });
    expect(vi.mocked(trackEvent).mock.calls.map(([name]) => name)).toEqual([
      "replay_load_started", "replay_session_ready", "replay_timing_ready",
      "replay_location_ready", "replay_data_ready",
    ]);
  });

  it("includes discovery time on a fresh landing and resets time on session switches", () => {
    const now = vi.spyOn(performance, "now").mockReturnValue(100);
    try {
      const { rerender } = renderHook(useReplayStartup, { initialProps: {
        ...initial, sessionKey: null as number | null, sessionReady: false,
      } });
      now.mockReturnValue(1100);
      act(() => rerender({ ...initial, sessionReady: true }));
      expect(trackEvent).toHaveBeenCalledWith("replay_session_ready", expect.objectContaining({
        session_key: 123, elapsed_ms: 1000,
      }));
      now.mockReturnValue(2100);
      rerender({ ...initial, sessionKey: 456, sessionReady: true });
      expect(trackEvent).toHaveBeenCalledWith("replay_session_ready", expect.objectContaining({
        session_key: 456, elapsed_ms: 0,
      }));
    } finally {
      now.mockRestore();
    }
  });
});
