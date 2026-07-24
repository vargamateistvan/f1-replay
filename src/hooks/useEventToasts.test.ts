import { renderHook, act } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { useEventToasts } from "./useEventToasts";
import type { ToastEvent } from "@/timeline/events";

const events: ToastEvent[] = [
  {
    id: "low",
    ms: 1_000,
    kind: "investigation",
    payload: { flag: "YELLOW", message: "Noted", lapNumber: 1 },
    priority: "low",
  },
  {
    id: "high-1",
    ms: 1_500,
    kind: "flag",
    payload: { flag: "YELLOW", message: "Yellow flag", lapNumber: 2 },
    priority: "high",
  },
  {
    id: "high-2",
    ms: 2_000,
    kind: "pit",
    payload: { driverNumber: 1, lapNumber: 3, pitDuration: null },
    priority: "high",
  },
];

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
      ({ t, maxVisible }) => useEventToasts(events, t, maxVisible),
      {
        initialProps: { t: 0, maxVisible: 4 },
      },
    );

    rerender({ t: 2_000, maxVisible: 4 });

    expect(result.current.toasts.map((t) => t.event.id)).toEqual([
      "high-1",
      "high-2",
    ]);

    act(() => result.current.dismiss("high-1"));
    expect(result.current.toasts.map((t) => t.event.id)).toEqual(["high-2"]);
  });

  it("clears toasts on large timeline jumps and auto-dismisses stale toasts", () => {
    const { result, rerender } = renderHook(
      ({ t, maxVisible }) => useEventToasts(events, t, maxVisible),
      {
        initialProps: { t: 0, maxVisible: 4 },
      },
    );

    rerender({ t: 2_000, maxVisible: 4 });
    expect(result.current.toasts).toHaveLength(2);

    vi.setSystemTime(new Date("2026-01-01T00:00:09.000Z"));
    rerender({ t: 2_100, maxVisible: 4 });
    expect(result.current.toasts).toHaveLength(0);

    rerender({ t: 20_000, maxVisible: 4 });
    expect(result.current.toasts).toHaveLength(0);
  });

  it("respects maxVisible capacity", () => {
    const burstEvents: ToastEvent[] = [
      {
        id: "e1",
        ms: 1_000,
        kind: "flag",
        payload: { flag: "YELLOW", message: "m1", lapNumber: 1 },
        priority: "high",
      },
      {
        id: "e2",
        ms: 1_100,
        kind: "flag",
        payload: { flag: "YELLOW", message: "m2", lapNumber: 1 },
        priority: "high",
      },
      {
        id: "e3",
        ms: 1_200,
        kind: "flag",
        payload: { flag: "YELLOW", message: "m3", lapNumber: 1 },
        priority: "high",
      },
    ];

    const { result, rerender } = renderHook(
      ({ t, maxVisible }) => useEventToasts(burstEvents, t, maxVisible),
      {
        initialProps: { t: 0, maxVisible: 2 },
      },
    );

    rerender({ t: 1_500, maxVisible: 2 });
    expect(result.current.toasts).toHaveLength(2);
    expect(result.current.toasts.map((t) => t.event.id)).toEqual(["e1", "e2"]);
  });
});
