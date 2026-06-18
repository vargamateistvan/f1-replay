import { renderHook, act } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { useEventToasts } from "./useEventToasts";

const events = [
  { id: "low", ms: 1_000, kind: "investigation", payload: {}, priority: "low" },
  { id: "high-1", ms: 1_500, kind: "flag", payload: {}, priority: "high" },
  { id: "high-2", ms: 2_000, kind: "pit", payload: {}, priority: "high" },
] as any[];

describe("useEventToasts", () => {
  beforeEach(() => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date("2026-01-01T00:00:00.000Z"));
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  it("emits only high-priority unseen events and supports dismiss", () => {
    const { result, rerender } = renderHook(
      ({ t }) => useEventToasts(events, t),
      {
        initialProps: { t: 0 },
      },
    );

    rerender({ t: 2_000 });

    expect(result.current.toasts.map((t) => t.event.id)).toEqual([
      "high-1",
      "high-2",
    ]);

    act(() => result.current.dismiss("high-1"));
    expect(result.current.toasts.map((t) => t.event.id)).toEqual(["high-2"]);
  });

  it("clears toasts on large timeline jumps and auto-dismisses stale toasts", () => {
    const { result, rerender } = renderHook(
      ({ t }) => useEventToasts(events, t),
      {
        initialProps: { t: 0 },
      },
    );

    rerender({ t: 2_000 });
    expect(result.current.toasts).toHaveLength(2);

    vi.setSystemTime(new Date("2026-01-01T00:00:09.000Z"));
    rerender({ t: 2_100 });
    expect(result.current.toasts).toHaveLength(0);

    rerender({ t: 20_000 });
    expect(result.current.toasts).toHaveLength(0);
  });
});
