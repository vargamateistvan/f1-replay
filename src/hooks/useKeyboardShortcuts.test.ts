import { renderHook } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";
import { useKeyboardShortcuts } from "./useKeyboardShortcuts";

const store = {
  t: 10_000,
  speed: 2,
  toggle: vi.fn(),
  setT: vi.fn((t: number) => {
    store.t = t;
  }),
  setSpeed: vi.fn((speed: number) => {
    store.speed = speed;
  }),
};

vi.mock("@/timeline/clock", () => ({
  useTimeline: {
    getState: () => store,
  },
}));

describe("useKeyboardShortcuts", () => {
  afterEach(() => {
    store.t = 10_000;
    store.speed = 2;
    store.toggle.mockClear();
    store.setT.mockClear();
    store.setSpeed.mockClear();
  });

  it("handles core playback and navigation keys", () => {
    const setView = vi.fn();
    const onOpenHelp = vi.fn();
    renderHook(() =>
      useKeyboardShortcuts({
        lapStarts: [15_000, 30_000],
        eventTimes: [12_000, 25_000],
        durationMs: 60_000,
        setView,
        onOpenHelp,
      }),
    );

    window.dispatchEvent(new KeyboardEvent("keydown", { key: " " }));
    expect(store.toggle).toHaveBeenCalled();

    window.dispatchEvent(new KeyboardEvent("keydown", { key: "ArrowRight" }));
    expect(store.setT).toHaveBeenCalledWith(15_000);

    window.dispatchEvent(new KeyboardEvent("keydown", { key: "ArrowUp" }));
    expect(store.setSpeed).toHaveBeenCalledWith(4);

    window.dispatchEvent(new KeyboardEvent("keydown", { key: "1" }));
    expect(setView).toHaveBeenCalledWith("leaderboard");

    window.dispatchEvent(new KeyboardEvent("keydown", { key: "?" }));
    expect(onOpenHelp).toHaveBeenCalled();
  });

  it("ignores shortcuts while modal is open", () => {
    renderHook(() =>
      useKeyboardShortcuts({
        lapStarts: [],
        durationMs: 60_000,
        isModalOpen: true,
      }),
    );

    window.dispatchEvent(new KeyboardEvent("keydown", { key: "ArrowLeft" }));
    expect(store.setT).not.toHaveBeenCalled();
  });
});
