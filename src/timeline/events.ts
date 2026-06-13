import type { Lap, Pit, RaceControl, Overtake } from '@/api/types'

// Helpers for jump-to-event navigation. All times returned are session-relative
// milliseconds (UTC date − sessionStartMs), matching the timeline clock's `t`.

function relMs(dateIso: string, sessionStartMs: number): number {
  return new Date(dateIso).getTime() - sessionStartMs
}

// Distinct lap boundaries (one per lap number, earliest start across drivers =
// the leader crossing the line), sorted ascending.
export function lapStartTimes(laps: Lap[], sessionStartMs: number): number[] {
  const byLap = new Map<number, number>()
  for (const l of laps) {
    if (!l.date_start) continue
    const t = relMs(l.date_start, sessionStartMs)
    const cur = byLap.get(l.lap_number)
    if (cur === undefined || t < cur) byLap.set(l.lap_number, t)
  }
  return [...byLap.values()].filter((v) => v >= 0).sort((a, b) => a - b)
}

export function pitTimes(pits: Pit[], sessionStartMs: number): number[] {
  return pits
    .map((p) => relMs(p.date, sessionStartMs))
    .filter((v) => v >= 0)
    .sort((a, b) => a - b)
}

// Times of flag-bearing race-control messages (SC, yellow, red, chequered, …).
export function flagTimes(entries: RaceControl[], sessionStartMs: number): number[] {
  return entries
    .filter((e) => e.flag && e.flag !== '')
    .map((e) => relMs(e.date, sessionStartMs))
    .filter((v) => v >= 0)
    .sort((a, b) => a - b)
}

export function overtakeTimes(overtakes: Overtake[], sessionStartMs: number): number[] {
  return overtakes
    .map((o) => relMs(o.date, sessionStartMs))
    .filter((v) => v >= 0)
    .sort((a, b) => a - b)
}

// First marker strictly after `t` (small epsilon so repeated presses advance).
export function nextAfter(sorted: number[], t: number, eps = 1): number | null {
  for (const v of sorted) if (v > t + eps) return v
  return null
}

// Last marker before `t` (1s epsilon so "prev" steps back rather than sticking).
export function prevBefore(sorted: number[], t: number, eps = 1000): number | null {
  let best: number | null = null
  for (const v of sorted) {
    if (v < t - eps) best = v
    else break
  }
  return best
}
