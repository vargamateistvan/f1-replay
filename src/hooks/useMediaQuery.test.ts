import { renderHook, act } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { useMediaQuery } from "./useMediaQuery";

describe("useMediaQuery", () => {
  const original = window.matchMedia;

  beforeEach(() => {
    let matches = false;
    const listeners = new Set<(e: MediaQueryListEvent) => void>();

    vi.stubGlobal(
      "matchMedia",
      vi.fn().mockImplementation((query: string) => ({
        media: query,
        get matches() {
          return matches;
        },
        onchange: null,
        addEventListener: (_: string, cb: (e: MediaQueryListEvent) => void) => {
          listeners.add(cb);
        },
        removeEventListener: (
          _: string,
          cb: (e: MediaQueryListEvent) => void,
        ) => {
          listeners.delete(cb);
        },
        addListener: () => undefined,
        removeListener: () => undefined,
        dispatchEvent: () => false,
        __set(next: boolean) {
          matches = next;
          const evt = { matches: next, media: query } as MediaQueryListEvent;
          listeners.forEach((cb) => cb(evt));
        },
      })),
    );
  });

  afterEach(() => {
    window.matchMedia = original;
  });

  it("tracks media query changes", () => {
    const { result } = renderHook(() => useMediaQuery("(max-width: 768px)"));
    expect(result.current).toBe(false);

    const mq = window.matchMedia("(max-width: 768px)") as MediaQueryList & {
      __set: (next: boolean) => void;
    };
    act(() => mq.__set(true));
    expect(result.current).toBe(true);
  });
});
