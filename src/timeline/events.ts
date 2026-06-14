import type { Lap, Pit, RaceControl, Overtake, TeamRadio } from '@/api/types'
import { pitStopTime } from '@/utils/pit'

// ─── Normalized toast events ────────────────────────────────────────────────

export type ToastKind = 'radio' | 'flag' | 'overtake' | 'pit' | 'fastest_lap'

export interface RadioPayload      { driverNumber: number; recordingUrl: string }
export interface FlagPayload       { flag: string; message: string; lapNumber: number | null }
export interface OvertakePayload   { overtaking: number; overtaken: number; position: number | null }
export interface PitPayload        { driverNumber: number; lapNumber: number; pitDuration: number | null }
export interface FastestLapPayload { driverNumber: number; lapNumber: number; lapTime: number }

export type ToastPayload = RadioPayload | FlagPayload | OvertakePayload | PitPayload | FastestLapPayload

export interface ToastEvent {
  id: string
  ms: number
  kind: ToastKind
  payload: ToastPayload
}

// Flags worth interrupting the viewer with (not CLEAR / GREEN noise)
const TOAST_FLAGS = new Set(['YELLOW', 'DOUBLE_YELLOW', 'RED', 'SAFETY_CAR', 'VIRTUAL_SC', 'CHEQUERED', 'BLUE'])

export function buildToastEvents(
  radios: TeamRadio[],
  raceControl: RaceControl[],
  overtakes: Overtake[],
  pits: Pit[],
  sessionStartMs: number,
  laps: Lap[] = [],
): ToastEvent[] {
  const events: ToastEvent[] = []

  for (const r of radios) {
    const ms = new Date(r.date).getTime() - sessionStartMs
    if (ms < 0) continue
    events.push({
      id: `radio-${r.driver_number}-${r.date}`,
      ms,
      kind: 'radio',
      payload: { driverNumber: r.driver_number, recordingUrl: r.recording_url } satisfies RadioPayload,
    })
  }

  for (const e of raceControl) {
    const ms = new Date(e.date).getTime() - sessionStartMs
    if (ms < 0) continue
    const isPenalty = /penalty|investigation/i.test(e.message)
    if (!e.flag && !isPenalty) continue
    if (e.flag && !TOAST_FLAGS.has(e.flag) && !isPenalty) continue
    events.push({
      id: `flag-${e.date}-${e.message.slice(0, 20)}`,
      ms,
      kind: 'flag',
      payload: { flag: e.flag ?? '', message: e.message, lapNumber: e.lap_number } satisfies FlagPayload,
    })
  }

  for (const o of overtakes) {
    const ms = new Date(o.date).getTime() - sessionStartMs
    if (ms < 0) continue
    events.push({
      id: `overtake-${o.date}-${o.overtaking_driver_number}-${o.overtaken_driver_number}`,
      ms,
      kind: 'overtake',
      payload: { overtaking: o.overtaking_driver_number, overtaken: o.overtaken_driver_number, position: o.position } satisfies OvertakePayload,
    })
  }

  for (const p of pits) {
    const ms = new Date(p.date).getTime() - sessionStartMs
    if (ms < 0) continue
    events.push({
      id: `pit-${p.driver_number}-${p.date}`,
      ms,
      kind: 'pit',
      payload: { driverNumber: p.driver_number, lapNumber: p.lap_number, pitDuration: pitStopTime(p) } satisfies PitPayload,
    })
  }

  // Fastest lap: emit a toast each time a new session-best is set.
  // Sort laps by completion time (date_start + lap_duration) and track running best.
  const lapsByEnd = laps
    .filter((l): l is Lap & { date_start: string; lap_duration: number } =>
      l.date_start !== null && l.lap_duration !== null && l.lap_duration > 0)
    .map((l) => ({
      ...l,
      endMs: new Date(l.date_start).getTime() - sessionStartMs + l.lap_duration * 1_000,
    }))
    .sort((a, b) => a.endMs - b.endMs)

  let sessionBest = Infinity
  for (const lap of lapsByEnd) {
    if (lap.endMs < 0) continue
    if (lap.lap_duration < sessionBest) {
      sessionBest = lap.lap_duration
      events.push({
        id: `fastest-lap-${lap.driver_number}-${lap.lap_number}`,
        ms: lap.endMs,
        kind: 'fastest_lap',
        payload: {
          driverNumber: lap.driver_number,
          lapNumber: lap.lap_number,
          lapTime: lap.lap_duration,
        } satisfies FastestLapPayload,
      })
    }
  }

  return events.sort((a, b) => a.ms - b.ms)
}

// Helpers for jump-to-event navigation. All times returned are session-relative
// milliseconds (UTC date − sessionStartMs), matching the timeline clock's `t`.

function relMs(dateIso: string, sessionStartMs: number): number {
  return new Date(dateIso).getTime() - sessionStartMs
}

export function radioTimes(entries: TeamRadio[], sessionStartMs: number): number[] {
  return entries
    .map((r) => relMs(r.date, sessionStartMs))
    .filter((v) => v >= 0)
    .sort((a, b) => a - b)
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

// Last marker at or before `t - eps` (1s epsilon so "prev" steps back rather
// than sticking when you're right at a boundary). Uses <= so that the marker
// at exactly t - eps is included — without this, pressing ⏮ one second into
// a lap would skip past the current lap start and jump to the previous one.
export function prevBefore(sorted: number[], t: number, eps = 1000): number | null {
  let best: number | null = null
  for (const v of sorted) {
    if (v <= t - eps) best = v
    else break
  }
  return best
}
