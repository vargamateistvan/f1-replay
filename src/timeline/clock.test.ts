import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { startClock, stopClock, useTimeline } from "./clock";

type FrameCallback = (time: number) => void;
let frames: FrameCallback[] = [];
let now = 0;

function runFrames(count: number, frameMs = 16) {
  for (let i = 0; i < count; i++) {
    now += frameMs;
    const pending = frames;
    frames = [];
    for (const cb of pending) cb(now);
  }
}

function expectWithinOneFrame(actual: number, expected: number, speed: number) {
  expect(actual).toBeGreaterThanOrEqual(expected - 16 * speed);
  expect(actual).toBeLessThanOrEqual(expected);
}

beforeEach(() => {
  frames = [];
  now = 0;
  vi.stubGlobal("requestAnimationFrame", (cb: FrameCallback) => {
    frames.push(cb);
    return frames.length;
  });
  vi.stubGlobal("cancelAnimationFrame", () => {});
  useTimeline.setState({ t: 0, playing: false, speed: 1 });
  useTimeline.getState().setRealTimeWindow(null);
  startClock();
  runFrames(2);
});

afterEach(() => {
  stopClock();
  vi.unstubAllGlobals();
});

describe("playback clock", () => {
  it("advances in real time at 1x", () => {
    useTimeline.setState({ playing: true });
    runFrames(60);
    // The store is written every other frame, so it may trail by one frame.
    expectWithinOneFrame(useTimeline.getState().t, 60 * 16, 1);
  });

  it("advances at the selected speed", () => {
    useTimeline.setState({ playing: true, speed: 4 });
    runFrames(60);
    expectWithinOneFrame(useTimeline.getState().t, 4 * 60 * 16, 4);
  });

  it("continues from a seek made during playback", () => {
    useTimeline.setState({ playing: true });
    runFrames(10);
    useTimeline.getState().setT(50_000);
    runFrames(10);
    expect(useTimeline.getState().t).toBeGreaterThanOrEqual(50_000);
    expect(useTimeline.getState().t).toBeLessThan(50_000 + 11 * 16);
  });
});

describe("real-time window", () => {
  const WINDOW = { startMs: 10_000, endMs: 16_000 };

  beforeEach(() => {
    useTimeline.getState().setRealTimeWindow(WINDOW);
  });

  it("drops to 1x on entering the window and restores the speed at its end", () => {
    useTimeline.setState({ t: 9_000, playing: true, speed: 16 });
    runFrames(10);
    expect(useTimeline.getState().speed).toBe(1);
    // Stops exactly at the window start rather than overshooting into it.
    expect(useTimeline.getState().t).toBeLessThan(WINDOW.startMs + 10 * 16);

    runFrames(Math.ceil((WINDOW.endMs - WINDOW.startMs) / 16) + 2);
    expect(useTimeline.getState().speed).toBe(16);
    expect(useTimeline.getState().t).toBeGreaterThanOrEqual(WINDOW.endMs);
  });

  it("keeps a speed the user picks inside the window", () => {
    useTimeline.setState({ t: 9_900, playing: true, speed: 8 });
    runFrames(5);
    expect(useTimeline.getState().speed).toBe(1);
    useTimeline.getState().setSpeed(2);
    runFrames(500);
    expect(useTimeline.getState().speed).toBe(2);
  });

  it("slows down when playback starts exactly at the window start", () => {
    useTimeline.setState({ t: WINDOW.startMs, playing: true, speed: 16 });
    runFrames(5);
    expect(useTimeline.getState().speed).toBe(1);
  });

  it("does not slow down at 1x or when seeking into the window", () => {
    useTimeline.setState({ t: 12_000, playing: true, speed: 16 });
    runFrames(5);
    expect(useTimeline.getState().speed).toBe(16);
  });
});
