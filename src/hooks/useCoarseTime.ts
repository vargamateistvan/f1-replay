import { useState, useEffect } from 'react'
import { useTimeline } from '@/timeline/clock'

// Returns `t` (session-relative ms) throttled to at most once per `intervalMs`.
// Use this in step-based panels (LiveTiming, StrategyBar, Weather, etc.) so they
// reconcile at ~10 Hz instead of 60 Hz. TrackMap handles its own 60 Hz subscription
// independently via its own useTimeline() call inside the component.
export function useCoarseTime(intervalMs = 100): number {
  const [coarse, setCoarse] = useState(() => useTimeline.getState().t)

  useEffect(() => {
    let lastUpdate = 0
    return useTimeline.subscribe((s) => {
      const now = Date.now()
      if (now - lastUpdate >= intervalMs) {
        lastUpdate = now
        setCoarse(s.t)
      }
    })
  }, [intervalMs])

  return coarse
}
