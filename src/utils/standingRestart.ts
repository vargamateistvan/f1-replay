import type { CarData, Position, RaceControl } from "@/api/types";
import {
  STANDING_RESTART_MIN_STOP_MS,
  STANDING_RESTART_SEARCH_MS,
  STANDING_RESTART_STOPPED_KMH,
} from "@/constants";

/** Absolute (UTC ms) span to search for a standing restart's lights out. */
export interface StandingRestartSearch {
  fromMs: number;
  toMs: number;
}

const RED_FLAG_RE = /\bRED FLAG\b/;
const STANDING_START_RE = /\bSTANDING START\b/;
const SESSION_STARTED_RE = /\bSESSION STARTED\b/;

function isRedFlag(entry: RaceControl): boolean {
  if ((entry.flag ?? "").toUpperCase() === "RED") return true;
  return RED_FLAG_RE.test((entry.message ?? "").toUpperCase());
}

/**
 * Standing restarts after a red flag. Race control announces "STANDING START"
 * but not when the lights go out, so each restart yields a window to search.
 * The window opens at the announcement, or at the resumption ("SESSION
 * STARTED") if that comes later, so cars leaving the pit lane don't count.
 */
export function standingRestartSearches(
  raceControl: readonly RaceControl[],
): StandingRestartSearch[] {
  const rows = raceControl
    .map((entry) => ({ entry, ms: Date.parse(entry.date) }))
    .filter(({ ms }) => Number.isFinite(ms))
    .sort((a, b) => a.ms - b.ms);

  const searches: StandingRestartSearch[] = [];
  for (let i = 0; i < rows.length; i++) {
    const { entry, ms } = rows[i]!;
    if (!isRedFlag(entry)) continue;

    let announcedMs: number | null = null;
    let resumedMs: number | null = null;
    for (let j = i + 1; j < rows.length; j++) {
      const next = rows[j]!;
      // A later red flag starts its own search.
      if (isRedFlag(next.entry)) break;
      const message = (next.entry.message ?? "").toUpperCase();
      if (resumedMs === null && next.ms > ms && SESSION_STARTED_RE.test(message))
        resumedMs = next.ms;
      if (announcedMs === null && STANDING_START_RE.test(message))
        announcedMs = next.ms;
      if (announcedMs !== null && resumedMs !== null) break;
    }
    if (announcedMs === null) continue;

    const fromMs = Math.max(announcedMs, resumedMs ?? announcedMs);
    searches.push({ fromMs, toMs: fromMs + STANDING_RESTART_SEARCH_MS });
  }
  return searches;
}

/** Race leader (P1) at absolute time `atMs`, from the position feed. */
export function leaderAt(
  positions: readonly Pick<Position, "date" | "driver_number" | "position">[],
  atMs: number,
): number | null {
  let leader: number | null = null;
  let leaderMs = -Infinity;
  for (const row of positions) {
    if (row.position !== 1) continue;
    const ms = Date.parse(row.date);
    if (!Number.isFinite(ms) || ms > atMs || ms < leaderMs) continue;
    leader = row.driver_number;
    leaderMs = ms;
  }
  return leader;
}

/**
 * Lights out from one car's data: the last stationary sample before it pulls
 * away after standing still for at least {@link STANDING_RESTART_MIN_STOP_MS}
 * (the grid). Returns absolute UTC ms, or null if it never left a standstill.
 */
export function detectLightsOut(
  rows: readonly Pick<CarData, "date" | "speed">[],
): number | null {
  const samples = rows
    .map((row) => ({ ms: Date.parse(row.date), speed: row.speed }))
    .filter(({ ms, speed }) => Number.isFinite(ms) && Number.isFinite(speed))
    .sort((a, b) => a.ms - b.ms);

  let stopStartMs: number | null = null;
  let lastStoppedMs: number | null = null;
  for (const { ms, speed } of samples) {
    if (speed <= STANDING_RESTART_STOPPED_KMH) {
      stopStartMs ??= ms;
      lastStoppedMs = ms;
      continue;
    }
    if (
      stopStartMs !== null &&
      lastStoppedMs !== null &&
      lastStoppedMs - stopStartMs >= STANDING_RESTART_MIN_STOP_MS
    )
      return lastStoppedMs;
    stopStartMs = null;
    lastStoppedMs = null;
  }
  return null;
}
