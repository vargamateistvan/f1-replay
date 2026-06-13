import { create } from 'zustand'

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
      const delta = (now - lastTs) * store.speed
      store.setT(store.t + delta)
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
