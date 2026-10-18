/**
 * Back-pressure for the car GeoJSON source. A `setData` takes two worker
 * round trips (parse, then tile reload) before it's on screen; sending on a
 * timer queued updates behind each other, so cars drew late and in bursts
 * while the camera — aimed at the last *sent* instant — moved every frame.
 *
 * Instead: send only when the previous update is on screen (or timed out),
 * and aim the camera at the instant that is actually shown.
 */
import { MAP3D_CAR_SYNC_TIMEOUT_MS } from "@/constants";

export interface CarSync {
  inFlight: boolean;
  /** Playhead of the update in flight. */
  sentT: number;
  /** Wall clock (performance.now) when it was sent. */
  sentAt: number;
  /** Playhead of the cars on screen (NaN until the first update lands). */
  shownT: number;
}

export function createCarSync(): CarSync {
  return { inFlight: false, sentT: Number.NaN, sentAt: 0, shownT: Number.NaN };
}

/**
 * Whether a new update may go out. A stuck update (no tile event, e.g. every
 * car is off screen) is given up on after the timeout and counted as shown.
 */
export function canSendCars(sync: CarSync, now: number): boolean {
  if (!sync.inFlight) return true;
  if (now - sync.sentAt < MAP3D_CAR_SYNC_TIMEOUT_MS) return false;
  sync.inFlight = false;
  sync.shownT = sync.sentT;
  return true;
}

export function markCarsSent(sync: CarSync, t: number, now: number): void {
  sync.inFlight = true;
  sync.sentT = t;
  sync.sentAt = now;
}

/** The update in flight is on screen; returns its latency (ms), or null if none was pending. */
export function markCarsShown(sync: CarSync, now: number): number | null {
  if (!sync.inFlight) return null;
  sync.inFlight = false;
  sync.shownT = sync.sentT;
  return now - sync.sentAt;
}

/** Instant the camera should aim at: what's on screen, else the playhead. */
export function cameraTime(sync: CarSync, playhead: number): number {
  return Number.isNaN(sync.shownT) ? playhead : sync.shownT;
}
