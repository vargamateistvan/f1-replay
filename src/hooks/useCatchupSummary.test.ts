import { renderHook, act } from "@testing-library/react";
import { describe, expect, it } from "vitest";
import { useCatchupSummary } from "./useCatchupSummary";

const events = [
  { id: "a", ms: 10_000, kind: "flag", payload: {}, priority: "high" },
  { id: "b", ms: 65_000, kind: "pit", payload: {}, priority: "high" },
  { id: "c", ms: 80_000, kind: "radio", payload: {}, priority: "high" },
] as any[];

describe("useCatchupSummary", () => {
  it("creates a summary after a large jump and allows dismiss", () => {
    const { result, rerender } = renderHook(
      ({ t }) => useCatchupSummary(events, t),
      {
        initialProps: { t: 0 },
      },
    );

    rerender({ t: 90_000 });

    expect(result.current.summary).toEqual({
      fromMs: 0,
      toMs: 90_000,
      events: [events[0], events[1], events[2]],
    });

    act(() => result.current.dismiss());
    expect(result.current.summary).toBeNull();
  });

  it("does not create a summary for small scrubs", () => {
    const { result, rerender } = renderHook(
      ({ t }) => useCatchupSummary(events, t),
      {
        initialProps: { t: 0 },
      },
    );

    rerender({ t: 20_000 });
    expect(result.current.summary).toBeNull();
  });
});
