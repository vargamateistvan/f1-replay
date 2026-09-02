import { afterEach, describe, expect, it, vi } from "vitest";

const { animateMock, staggerMock } = vi.hoisted(() => ({
  animateMock: vi.fn(() => ({ revert: vi.fn() })),
  staggerMock: vi.fn((value: number) => value),
}));

vi.mock("animejs", () => ({
  animate: animateMock,
  stagger: staggerMock,
}));

import {
  animateMotion,
  barRevealMotion,
  fadeUpMotion,
  MOTION,
  motionEnabled,
  modalBackdropMotion,
  modalPanelMotion,
  prefersReducedMotion,
  pulseMotion,
  pressMotion,
  routeEnterMotion,
  tabSwapMotion,
  stagger,
  staggerFadeUpMotion,
} from "./motion";

describe("motion", () => {
  const originalMatchMedia = window.matchMedia;

  afterEach(() => {
    window.matchMedia = originalMatchMedia;
    vi.clearAllMocks();
  });

  it("exposes stable motion presets", () => {
    expect(MOTION.duration.medium).toBe(360);
    expect(MOTION.duration.route).toBe(480);
    expect(fadeUpMotion()).toMatchObject({
      opacity: [0, 1],
      translateY: [22, 0],
    });
    expect(staggerFadeUpMotion()).toMatchObject({
      opacity: [0, 1],
      translateY: [18, 0],
    });
    expect(pulseMotion()).toMatchObject({
      opacity: [0.45, 1],
      scale: [0.86, 1],
    });
    expect(pressMotion()).toMatchObject({
      scale: [1, 0.96, 1],
    });
    expect(barRevealMotion()).toMatchObject({
      opacity: [0, 1],
      scaleX: [0.96, 1],
    });
    expect(routeEnterMotion()).toMatchObject({
      opacity: [0, 1],
      translateY: [22, 0],
    });
    expect(modalBackdropMotion()).toMatchObject({
      opacity: [0, 1],
    });
    expect(modalPanelMotion()).toMatchObject({
      opacity: [0, 1],
      translateY: [26, 0],
      scale: [0.96, 1],
    });
    expect(tabSwapMotion()).toMatchObject({
      opacity: [0, 1],
      translateY: [22, 0],
      scale: [0.98, 1],
    });
  });

  it("detects reduced motion", () => {
    vi.stubGlobal(
      "matchMedia",
      vi.fn().mockImplementation(() => ({
        matches: true,
        media: "(prefers-reduced-motion: reduce)",
        onchange: null,
        addEventListener: () => undefined,
        removeEventListener: () => undefined,
        addListener: () => undefined,
        removeListener: () => undefined,
        dispatchEvent: () => false,
      })),
    );

    expect(prefersReducedMotion()).toBe(true);
    expect(motionEnabled()).toBe(false);
  });

  it("passes through anime.js when motion is enabled", () => {
    vi.stubGlobal(
      "matchMedia",
      vi.fn().mockImplementation(() => ({
        matches: false,
        media: "(prefers-reduced-motion: reduce)",
        onchange: null,
        addEventListener: () => undefined,
        removeEventListener: () => undefined,
        addListener: () => undefined,
        removeListener: () => undefined,
        dispatchEvent: () => false,
      })),
    );

    const animation = animateMotion([], barRevealMotion());

    expect(animation).toEqual(expect.objectContaining({ revert: expect.any(Function) }));
    expect(animateMock).toHaveBeenCalledTimes(1);
    expect(staggerMock).toHaveBeenCalled();
    expect(stagger(12)).toBe(12);
  });
});
