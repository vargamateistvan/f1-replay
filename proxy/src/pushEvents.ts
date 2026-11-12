import type { PushSessionType } from "../../src/utils/pushPreferences";

export const REMINDER_LEAD_MS = 10 * 60_000;
export const REMINDER_CATCHUP_MS = 2 * 60_000;
export const START_FRESHNESS_MS = 5 * 60_000;
export const RESULTS_LOOKBACK_MS = 24 * 60 * 60_000;

export interface PushSession {
  session_key: number;
  meeting_key: number;
  year: number;
  session_name: string;
  session_type: string;
  date_start: string;
  date_end: string;
  is_cancelled: boolean;
}

export interface PushRaceControl {
  date: string;
  message: string;
  qualifying_phase: number | null;
}

export interface PushResult {
  session_key: number;
  driver_number: number;
  position: number | null;
}

export interface PushDriver {
  session_key: number;
  driver_number: number;
}

export interface PushEvent {
  kind: "reminder" | "started" | "results";
  sessionKey: number;
  occurredAt: number;
  expiresAt: number;
}

export function pushSessionType(session: Pick<PushSession, "session_type" | "session_name">): PushSessionType | null {
  const type = session.session_type.toLowerCase();
  const name = session.session_name.toLowerCase();
  if (type === "sprint qualifying" || type === "sprint shootout" ||
      name === "sprint qualifying" || name === "sprint shootout") return "sprintQualifying";
  if (type === "race") return "race";
  if (type === "sprint") return "sprint";
  if (type === "qualifying") return "qualifying";
  if (type === "practice") return "practice";
  return null;
}

export function reminderEvent(session: PushSession, now: number): PushEvent | null {
  const start = Date.parse(session.date_start);
  const threshold = start - REMINDER_LEAD_MS;
  if (session.is_cancelled || !pushSessionType(session) || !Number.isFinite(start) ||
      now < threshold || now >= threshold + REMINDER_CATCHUP_MS) return null;
  return { kind: "reminder", sessionKey: session.session_key, occurredAt: threshold, expiresAt: threshold + REMINDER_CATCHUP_MS };
}

export function startedEvent(session: PushSession, rows: PushRaceControl[], now: number): PushEvent | null {
  const start = Date.parse(session.date_start);
  const type = pushSessionType(session);
  if (session.is_cancelled || !type || !Number.isFinite(start)) return null;
  const initial = rows
    .filter((row) => /^SESSION STARTED\b/i.test(row.message) &&
      (type === "qualifying" || type === "sprintQualifying"
        ? row.qualifying_phase === 1 : row.qualifying_phase === null))
    .map((row) => Date.parse(row.date))
    .filter((date) => Number.isFinite(date) && date >= start - 60 * 60_000)
    .sort((a, b) => a - b)[0];
  if (initial === undefined || initial > now || now >= initial + START_FRESHNESS_MS) return null;
  // If the original start is missing, a start after an interruption can be a
  // restart rather than the beginning of the session.
  if (rows.some((row) => {
    const time = Date.parse(row.date);
    return time >= start - 60 * 60_000 && time < initial &&
      /\b(?:RED FLAG|CHEQUERED FLAG|SESSION FINISHED)\b/i.test(row.message);
  })) return null;
  return { kind: "started", sessionKey: session.session_key, occurredAt: initial, expiresAt: initial + START_FRESHNESS_MS };
}

export function resultsEvent(
  session: PushSession, rows: PushRaceControl[], results: PushResult[], drivers: PushDriver[], now: number,
): PushEvent | null {
  const end = Date.parse(session.date_end);
  const type = pushSessionType(session);
  if (session.is_cancelled || !type || !Number.isFinite(end) || now < end || now >= end + RESULTS_LOOKBACK_MS) return null;
  const start = Date.parse(session.date_start);
  if (!Number.isFinite(start)) return null;
  const flags = rows.filter((row) =>
    /\bCHEQUERED FLAG\b/i.test(row.message) &&
    (type !== "qualifying" && type !== "sprintQualifying" || row.qualifying_phase === 3),
  ).map((row) => Date.parse(row.date)).filter((date) => Number.isFinite(date) && date >= start && date <= now);
  if (!flags.length || !drivers.length || !results.length || !results.every((row) =>
    row.session_key === session.session_key && Number.isInteger(row.driver_number) && row.driver_number > 0 &&
    (row.position === null || Number.isInteger(row.position) && row.position > 0))) return null;
  const entrantNumbers = new Set<number>();
  for (const driver of drivers) {
    if (driver.session_key !== session.session_key || !Number.isInteger(driver.driver_number) ||
        driver.driver_number <= 0 || entrantNumbers.has(driver.driver_number)) return null;
    entrantNumbers.add(driver.driver_number);
  }
  const resultNumbers = new Set<number>();
  const positions = new Set<number>();
  for (const result of results) {
    if (!entrantNumbers.has(result.driver_number) || resultNumbers.has(result.driver_number) ||
        (result.position !== null && positions.has(result.position))) return null;
    resultNumbers.add(result.driver_number);
    if (result.position !== null) positions.add(result.position);
  }
  if (resultNumbers.size !== entrantNumbers.size || !positions.has(1)) return null;
  return { kind: "results", sessionKey: session.session_key, occurredAt: Math.max(...flags), expiresAt: end + RESULTS_LOOKBACK_MS };
}
