import { create } from "zustand";
import { MAX_FRAME_STEP_MS } from "@/constants";

export interface RealTimeWindow {
  startMs: number;
  endMs: number;
}

export interface TimelineStore {
  // Session-relative time in milliseconds from session start
  t: number;
  playing: boolean;
  speed: number; // playback multiplier: 1, 2, 4, 8, 16
  sessionStartMs: number | null; // UTC ms of session start
  /**
   * Session-relative window that always plays at 1x (the race start lights).
   * Crossing into it at a higher speed drops to 1x until `endMs`, then the
   * previous speed resumes.
   */
  realTimeWindow: RealTimeWindow | null;

  setT: (t: number) => void;
  setPlaying: (playing: boolean) => void;
  setSpeed: (speed: number) => void;
  setSessionStart: (ms: number) => void;
  setRealTimeWindow: (window: RealTimeWindow | null) => void;
  toggle: () => void;
  reset: () => void;
}

// Speed to resume once playback leaves the real-time window.
let speedToRestore: number | null = null;

export const useTimeline = create<TimelineStore>((set) => ({
  t: 0,
  playing: false,
  speed: 1,
  sessionStartMs: null,
  realTimeWindow: null,

  setT: (t) => set({ t }),
  setPlaying: (playing) => set({ playing }),
  setSpeed: (speed) => set({ speed }),
  setSessionStart: (ms) => set({ sessionStartMs: ms }),
  setRealTimeWindow: (realTimeWindow) => {
    speedToRestore = null;
    set({ realTimeWindow });
  },
  toggle: () => set((s) => ({ playing: !s.playing })),
  reset: () => set({ t: 0, playing: false }),
}));

// RAF-based clock, called once from App
let rafId: number | null = null;
let lastTs: number | null = null;
let frameCount: number = 0;
// Private ref to track 60 fps time; Zustand updates are batched to every 2 frames (~30 Hz).
// Components needing 60 fps access (e.g., TrackMap) should call getCurrentT() within their
// own RAF loop and read this value directly.
let currentT: number = 0;
// Last `t` this clock wrote to the store. Any other value there means someone
// seeked, so the clock resyncs from the store instead of its own running total.
let lastWrittenT: number | null = null;
export function getCurrentT(): number {
  return currentT;
}

export function startClock() {
  if (rafId !== null) return;

  function tick(now: number) {
    const store = useTimeline.getState();
    if (store.playing && lastTs !== null) {
      if (store.t !== lastWrittenT) currentT = store.t;
      // A manual speed change while slowed down cancels the automatic restore.
      if (speedToRestore !== null && store.speed !== 1) speedToRestore = null;

      // Clamp the real elapsed time before scaling by speed. A backgrounded tab
      // throttles RAF, so on refocus `now - lastTs` can be many seconds — without
      // this clamp the playhead would jump forward and skip a whole location chunk.
      const realDelta = Math.min(now - lastTs, MAX_FRAME_STEP_MS);
      let speed = store.speed;
      let nextT = currentT + realDelta * speed;
      let mustWrite = false;

      const realTime = store.realTimeWindow;
      if (
        realTime &&
        speed > 1 &&
        currentT <= realTime.startMs &&
        nextT >= realTime.startMs
      ) {
        nextT = realTime.startMs;
        speedToRestore = speed;
        speed = 1;
        mustWrite = true;
      } else if (
        speedToRestore !== null &&
        (!realTime || nextT >= realTime.endMs)
      ) {
        speed = speedToRestore;
        speedToRestore = null;
        mustWrite = true;
      }

      currentT = nextT;
      // Batch Zustand updates to every other frame (~30 Hz instead of 60 Hz).
      // This significantly reduces subscription overhead for all connected components.
      if (mustWrite || frameCount % 2 === 0) {
        useTimeline.setState(
          speed === store.speed ? { t: currentT } : { t: currentT, speed },
        );
        lastWrittenT = currentT;
      }
      frameCount++;
    }
    lastTs = now;
    rafId = requestAnimationFrame(tick);
  }

  rafId = requestAnimationFrame((now) => {
    lastTs = now;
    frameCount = 0;
    rafId = requestAnimationFrame(tick);
  });
}

export function stopClock() {
  if (rafId !== null) {
    cancelAnimationFrame(rafId);
    rafId = null;
    lastTs = null;
    frameCount = 0;
    currentT = 0;
    lastWrittenT = null;
    speedToRestore = null;
  }
}
