import type { Lap, Pit, RaceControl, Overtake, TeamRadio } from '@/api/types'

// ─── Normalized toast events ────────────────────────────────────────────────

export type ToastKind = 'radio' | 'flag' | 'overtake' | 'pit'

export interface RadioPayload { driverNumber: number; recordingUrl: string }
export interface FlagPayload  { flag: string; message: string; lapNumber: number | null }
export interface OvertakePayload { overtaking: number; overtaken: number; position: number | null }
export interface PitPayload  { driverNumber: number; lapNumber: number; pitDuration: number | null }

export type ToastPayload = RadioPayload | FlagPayload | OvertakePayload | PitPayload

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
      id: `overtake-${o.date}-${o.overtaking_driver_number}`,
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
      payload: { driverNumber: p.driver_number, lapNumber: p.lap_number, pitDuration: p.pit_duration } satisfies PitPayload,
    })
  }

  return events.sort((a, b) => a.ms - b.ms)
}

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
