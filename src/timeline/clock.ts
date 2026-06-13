import { create } from 'zustand'
import { MAX_FRAME_STEP_MS } from '@/constants'

export interface TimelineStore {
  // Session-relative time in milliseconds from session start
  t: number
  playing: boolean
  speed: number // playback multiplier: 1, 2, 4, 8, 16
  sessionStartMs: number | null // UTC ms of session start

  setT: (t: number) => void
  setPlaying: (playing: boolean) => void
  setSpeed: (speed: number) => void
  setSessionStart: (ms: number) => void
  toggle: () => void
  reset: () => void
}

export const useTimeline = create<TimelineStore>((set) => ({
  t: 0,
  playing: false,
  speed: 1,
  sessionStartMs: null,

  setT: (t) => set({ t }),
  setPlaying: (playing) => set({ playing }),
  setSpeed: (speed) => set({ speed }),
  setSessionStart: (ms) => set({ sessionStartMs: ms }),
  toggle: () => set((s) => ({ playing: !s.playing })),
  reset: () => set({ t: 0, playing: false }),
}))

// RAF-based clock, called once from App
let rafId: number | null = null
let lastTs: number | null = null

export function startClock() {
  if (rafId !== null) return

  function tick(now: number) {
    const store = useTimeline.getState()
    if (store.playing && lastTs !== null) {
      // Clamp the real elapsed time before scaling by speed. A backgrounded tab
      // throttles RAF, so on refocus `now - lastTs` can be many seconds — without
      // this clamp the playhead would jump forward and skip a whole location chunk.
      const realDelta = Math.min(now - lastTs, MAX_FRAME_STEP_MS)
      store.setT(store.t + realDelta * store.speed)
    }
    lastTs = now
    rafId = requestAnimationFrame(tick)
  }

  rafId = requestAnimationFrame((now) => {
    lastTs = now
    rafId = requestAnimationFrame(tick)
  })
}

export function stopClock() {
  if (rafId !== null) {
    cancelAnimationFrame(rafId)
    rafId = null
    lastTs = null
  }
}
