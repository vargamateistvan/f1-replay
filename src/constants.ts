// Central home for tunable constants and magic numbers used across the app.
// Grouped by domain. Prefer importing from here over re-declaring literals.

// ── Seasons ───────────────────────────────────────────────────────────────────
// Years offered in every session/standings picker. OpenF1 coverage starts in 2023.
// Newest first so the default selection is the latest season.
export const YEARS = [2026, 2025, 2024, 2023] as const
export const DEFAULT_YEAR = YEARS[0]

// ── Playback ────────────────────────────────────────────────────────────────--
export const SPEEDS = [1, 2, 4, 8, 16] as const
// Cap a single RAF step so a throttled/backgrounded tab can't jump the playhead
// across a whole location chunk when it refocuses (real ms, before speed scaling).
export const MAX_FRAME_STEP_MS = 250

// ── Location replay chunks ──────────────────────────────────────────────────--
// 5-minute windows keep each fetch ≤ ~22k rows (20 drivers × 3.7 Hz × 300 s).
export const CHUNK_MS = 5 * 60 * 1000

// ── Live session detection / polling ───────────────────────────────────────--
// Buffer so "live" activates just before lights-out and lingers past the flag.
export const LIVE_BUFFER_MS = 30 * 60 * 1000
// Refetch interval for live data.
export const LIVE_POLL_MS = 10_000

// ── Track map (SVG) ─────────────────────────────────────────────────────────--
export const TRACK_SVG_W = 600
export const TRACK_SVG_H = 400
export const TRACK_SVG_PAD = 24
// Lap used to derive the track outline (a clean early lap; falls back to lap 3, then any).
export const TRACK_OUTLINE_LAP = 2

// ── Live timing sector colours ──────────────────────────────────────────────--
// Delta (s) of a sector vs the session best that still counts as that colour.
export const SECTOR_PURPLE_S = 0.05 // within 50 ms of best → personal/overall best
export const SECTOR_GREEN_S = 0.5 // within 0.5 s → green

// ── Championship points ─────────────────────────────────────────────────────--
export const RACE_POINTS = [25, 18, 15, 12, 10, 8, 6, 4, 2, 1] as const
export const SPRINT_POINTS = [8, 7, 6, 5, 4, 3, 2, 1] as const

// ── API rate limiting ───────────────────────────────────────────────────────--
// OpenF1 free tier: 3 req/s and 30 req/min. Keep headroom under both.
export const RATE_MAX_PER_SECOND = 3
export const RATE_MAX_PER_MINUTE = 30
export const RATE_MAX_RETRIES = 4
