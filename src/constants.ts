// Central home for tunable constants and magic numbers used across the app.
// Grouped by domain. Prefer importing from here over re-declaring literals.

// ── Seasons ───────────────────────────────────────────────────────────────────
// OpenF1 coverage starts in 2023. Generates a descending list up to the current
// year so the picker stays current without manual updates.
const OPENF1_START_YEAR = 2023;
const _currentYear = new Date().getFullYear();
export const YEARS = Array.from(
  { length: _currentYear - OPENF1_START_YEAR + 1 },
  (_, i) => _currentYear - i,
) as number[];
export const DEFAULT_YEAR = YEARS[0];

// ── Playback ────────────────────────────────────────────────────────────────--
export const SPEEDS = [1, 2, 4, 8, 16] as const;
// Cap a single RAF step so a throttled/backgrounded tab can't jump the playhead
// across a whole location chunk when it refocuses (real ms, before speed scaling).
export const MAX_FRAME_STEP_MS = 250;

// ── Location replay chunks ──────────────────────────────────────────────────--
// 5-minute windows keep each fetch ≤ ~22k rows (20 drivers × 3.7 Hz × 300 s).
export const CHUNK_MS = 5 * 60 * 1000;
// Location endpoint can return very large payloads; use smaller chunking there
// to reduce per-request JSON parse/indexing spikes on fast playback.
export const LOCATION_CHUNK_MS = 2 * 60 * 1000;

// ── Live session detection / polling ───────────────────────────────────────--
// Buffer so "live" activates just before lights-out and lingers past the flag.
export const LIVE_BUFFER_MS = 30 * 60 * 1000;
// Refetch intervals for live data. Fast cadence is for timing-critical panels
// (positions/intervals/laps), while slower cadence reduces pressure for feeds
// that change less often (weather/race control/team radio/overtakes).
export const LIVE_POLL_FAST_MS = 20_000;
export const LIVE_POLL_SLOW_MS = 60_000;
// OpenF1 MQTT-over-WebSocket endpoint for browser clients.
export const OPENF1_MQTT_WSS_URL = "wss://mqtt.openf1.org:8084/mqtt";
// Grace period for reconnect attempts before giving up the current connection attempt.
export const OPENF1_MQTT_CONNECT_TIMEOUT_MS = 10_000;
// Keep this modest: MQTT updates are high frequency and query caches already hold
// full-session data from REST. These caps protect memory in long live sessions.
export const LIVE_MQTT_MAX_ROWS = 4_000;

// ── Track map (SVG) ─────────────────────────────────────────────────────────--
export const TRACK_SVG_W = 600;
export const TRACK_SVG_H = 400;
export const TRACK_SVG_PAD = 24;
// Lap used to derive the track outline (a clean early lap; falls back to lap 3, then any).
export const TRACK_OUTLINE_LAP = 2;

// ── Live timing sector colours ──────────────────────────────────────────────--
// Delta (s) of a sector vs the session best that still counts as that colour.
export const SECTOR_PURPLE_S = 0.05; // within 50 ms of best → personal/overall best
export const SECTOR_GREEN_S = 0.5; // within 0.5 s → green

// Fallback session duration when date_end is missing (2 hours).
export const DEFAULT_SESSION_MS = 7_200_000;

// ── Track map sector colours ────────────────────────────────────────────────--
export const SECTOR_COLORS: Record<1 | 2 | 3, string> = {
  1: "#f5a623",
  2: "#7cb342",
  3: "#b71c1c",
};

// ── Track map follow-cam (zoom dimensions in SVG units) ─────────────────────--
// 200 × 134 gives ≈3× zoom on the 600 × 400 viewport. Tune here to adjust depth.
export const FOLLOW_ZOOM_W = 200;
export const FOLLOW_ZOOM_H = 134;

// ── Tyre compound colours ───────────────────────────────────────────────────--
export const COMPOUND_COLORS = {
  SOFT: "#e8002d",
  MEDIUM: "#ffd700",
  HARD: "#f0f0f0",
  INTERMEDIATE: "#39b54a",
  WET: "#4da6ff",
  UNKNOWN: "#636369",
} as const;

// ── Championship points ─────────────────────────────────────────────────────--
export const RACE_POINTS = [25, 18, 15, 12, 10, 8, 6, 4, 2, 1] as const;
export const SPRINT_POINTS = [8, 7, 6, 5, 4, 3, 2, 1] as const;

// ── API rate limiting ───────────────────────────────────────────────────────--
// OpenF1 free tier: 3 req/s and 30 req/min.
// We cap at 2/s and 25/min to keep headroom and avoid hitting server limits
// after a fresh page load (server window doesn't reset with the client).
export const RATE_MAX_PER_SECOND = 2;
export const RATE_MAX_PER_MINUTE = 25;
export const RATE_MAX_RETRIES = 6;
