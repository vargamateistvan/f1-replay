import { renderHook, act } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";
import { useCoarseTime } from "./useCoarseTime";

let nowMs = 0;
let subscriber: ((s: { t: number }) => void) | null = null;
const unsubscribe = vi.fn();

vi.mock("@/timeline/clock", () => ({
  useTimeline: {
    getState: () => ({ t: 100 }),
    subscribe: (cb: (s: { t: number }) => void) => {
      subscriber = cb;
      return unsubscribe;
    },
  },
}));

describe("useCoarseTime", () => {
  afterEach(() => {
    vi.restoreAllMocks();
    unsubscribe.mockClear();
    subscriber = null;
  });

  it("throttles timeline updates to the configured interval and unsubscribes", () => {
    vi.spyOn(Date, "now").mockImplementation(() => nowMs);
    const { result, unmount } = renderHook(() => useCoarseTime(100));

    expect(result.current).toBe(100);

    nowMs = 200;
    act(() => subscriber?.({ t: 200 }));
    expect(result.current).toBe(200);

    nowMs = 250;
    act(() => subscriber?.({ t: 300 }));
    expect(result.current).toBe(200);

    nowMs = 350;
    act(() => subscriber?.({ t: 400 }));
    expect(result.current).toBe(400);

    unmount();
    expect(unsubscribe).toHaveBeenCalled();
  });
});
