import {
  pushSessionType, reminderEvent, resultsEvent, startedEvent,
  type PushDriver, type PushEvent, type PushRaceControl, type PushResult, type PushSession,
} from "./pushEvents";
import type { Env } from "./index";

const API_BASE = "https://api.openf1.org/v1";
const MINUTE = 60_000;
const DAY = 24 * 60 * MINUTE;
const LOCK_MS = 4 * MINUTE;
const MAX_REQUESTS = 8;
const MAX_CANDIDATES = 8;
const TIMEOUT_MS = 10_000;

function record(value: unknown): value is Record<string, unknown> {
  return value !== null && typeof value === "object" && !Array.isArray(value);
}

function sessionValid(value: unknown): value is PushSession {
  return record(value) && Number.isSafeInteger(value.session_key) &&
    Number.isSafeInteger(value.meeting_key) && Number.isSafeInteger(value.year) &&
    typeof value.session_name === "string" && typeof value.session_type === "string" &&
    typeof value.is_cancelled === "boolean" &&
    typeof value.date_start === "string" && Number.isFinite(Date.parse(value.date_start)) &&
    typeof value.date_end === "string" && Number.isFinite(Date.parse(value.date_end));
}

function controlValid(value: unknown): value is PushRaceControl {
  return record(value) && typeof value.date === "string" && typeof value.message === "string" &&
    (value.qualifying_phase === null || typeof value.qualifying_phase === "number");
}

function driverValid(value: unknown): value is PushDriver {
  return record(value) && Number.isInteger(value.session_key) && Number.isInteger(value.driver_number);
}

function resultValid(value: unknown): value is PushResult {
  return driverValid(value) && record(value) &&
    (value.position === null || Number.isInteger(value.position));
}

class BudgetExhausted extends Error {}

async function fetchRows(env: Env, endpoint: string, params: Record<string, string>, budget: { left: number }, now: number): Promise<unknown[]> {
  if (budget.left <= 0) throw new BudgetExhausted();
  budget.left--;
  const url = new URL(`${API_BASE}/${endpoint}`);
  for (const [key, value] of Object.entries(params)) url.searchParams.set(key, value);
  const response = await fetch(url, {
    headers: env.OPENF1_API_KEY ? { Authorization: `Bearer ${env.OPENF1_API_KEY}` } : {},
    redirect: "manual", signal: AbortSignal.timeout(TIMEOUT_MS),
  });
  if (response.status === 404 && (endpoint === "session_result" || endpoint === "race_control" || endpoint === "drivers")) return [];
  if (!response.ok) {
    if (response.status === 429) {
      const raw = response.headers.get("Retry-After");
      const seconds = raw && /^\d+$/.test(raw) ? Number(raw) : 0;
      const date = raw ? Date.parse(raw) : NaN;
      const until = Math.max(now + MINUTE, seconds ? now + seconds * 1000 : Number.isFinite(date) ? date : 0);
      await env.NOTIFICATIONS!.prepare(`
        INSERT INTO push_alert_state (key, value, updated_at) VALUES ('backoff', '', ?)
        ON CONFLICT(key) DO UPDATE SET updated_at = MAX(updated_at, excluded.updated_at)
      `).bind(until).run();
    }
    console.error("Push discovery request failed", { endpoint, status: response.status });
    throw new Error("OpenF1 push discovery failed");
  }
  const data: unknown = await response.json();
  if (!Array.isArray(data)) throw new Error(`Invalid OpenF1 ${endpoint} response`);
  return data;
}

async function saveEvent(db: D1Database, event: PushEvent, session: PushSession): Promise<void> {
  await db.prepare(`
    INSERT OR IGNORE INTO push_alert_events
      (event_key, session_key, kind, occurred_at, expires_at, retain_until, session_json)
    VALUES (?, ?, ?, ?, ?, ?, ?)
  `).bind(`${event.sessionKey}:${event.kind}`, event.sessionKey, event.kind, event.occurredAt,
    event.expiresAt, Math.max(event.expiresAt + DAY, Date.parse(session.date_end) + 2 * DAY),
    JSON.stringify(session)).run();
}

async function discover(env: Env, now: number): Promise<void> {
  const db = env.NOTIFICATIONS!;
  const budget = { left: MAX_REQUESTS };
  const currentYear = new Date(now).getUTCFullYear();
  const years = new Date(now).getUTCMonth() === 0 && new Date(now).getUTCDate() === 1
    ? [currentYear, currentYear - 1] : [currentYear];
  const sessions: PushSession[] = [];
  for (const year of years) {
    const rawSessions = await fetchRows(env, "sessions", { year: String(year) }, budget, now);
    const rawMeetings = await fetchRows(env, "meetings", { year: String(year) }, budget, now);
    if (!rawSessions.every(sessionValid) || !rawMeetings.every((m) =>
      record(m) && Number.isSafeInteger(m.meeting_key) && typeof m.is_cancelled === "boolean")) {
      throw new Error("Invalid OpenF1 push calendar");
    }
    const cancellations = new Map<number, boolean>();
    for (const m of rawMeetings) {
      if (record(m) && typeof m.meeting_key === "number" && typeof m.is_cancelled === "boolean") {
        cancellations.set(m.meeting_key, m.is_cancelled);
      }
    }
    if (rawSessions.some((s) => !cancellations.has(s.meeting_key))) {
      throw new Error("Incomplete OpenF1 push calendar");
    }
    sessions.push(...rawSessions.map((s) => ({ ...s, is_cancelled: s.is_cancelled || cancellations.get(s.meeting_key) === true })));
  }
  await db.prepare(`
    INSERT INTO push_alert_state (key, value, updated_at) VALUES ('calendar', ?, ?)
    ON CONFLICT(key) DO UPDATE SET value = excluded.value, updated_at = excluded.updated_at
  `).bind(JSON.stringify(sessions), now).run();

  for (const session of sessions) {
    const reminder = reminderEvent(session, now);
    if (reminder) await saveEvent(db, reminder, session);
  }
  const candidates = sessions.filter((s) => !s.is_cancelled && pushSessionType(s) &&
    now >= Date.parse(s.date_start) - MINUTE && now < Date.parse(s.date_end) + DAY)
    .sort((a, b) => Date.parse(b.date_start) - Date.parse(a.date_start))
    .slice(0, MAX_CANDIDATES);
  for (const session of candidates) {
    const end = Date.parse(session.date_end);
    const events = await db.prepare("SELECT kind FROM push_alert_events WHERE session_key = ?")
      .bind(session.session_key).all<{ kind: string }>();
    const found = new Set(events.results.map((e) => e.kind));
    const needStart = !found.has("started") && now < end + MINUTE;
    const last = await db.prepare("SELECT updated_at FROM push_alert_state WHERE key = ?")
      .bind(`poll:${session.session_key}`).first<{ updated_at: number }>();
    const needResults = !found.has("results") && now >= end && (!last || now - last.updated_at >= 5 * MINUTE);
    if (!needStart && !needResults) continue;
    const rawControl = await fetchRows(env, "race_control", { session_key: String(session.session_key) }, budget, now);
    if (!rawControl.every(controlValid)) throw new Error("Invalid OpenF1 race-control response");
    if (needStart) {
      const event = startedEvent(session, rawControl, now);
      if (event) await saveEvent(db, event, session);
    }
    if (needResults) {
      const rawResults = await fetchRows(env, "session_result", { session_key: String(session.session_key) }, budget, now);
      const rawDrivers = await fetchRows(env, "drivers", { session_key: String(session.session_key) }, budget, now);
      if (!rawResults.every(resultValid) || !rawDrivers.every(driverValid)) throw new Error("Invalid OpenF1 classification response");
      const event = resultsEvent(session, rawControl, rawResults, rawDrivers, now);
      if (event) await saveEvent(db, event, session);
      await db.prepare(`
        INSERT INTO push_alert_state (key, value, updated_at) VALUES (?, '', ?)
        ON CONFLICT(key) DO UPDATE SET updated_at = excluded.updated_at
      `).bind(`poll:${session.session_key}`, now).run();
    }
  }
}

export async function discoverPushAlerts(env: Env, now = Date.now()): Promise<void> {
  if (env.PUSH_DISCOVERY_ENABLED !== "true" || env.PUSH_PREFERENCES_ENABLED !== "true") return;
  if (!env.NOTIFICATIONS) throw new Error("Push discovery database missing");
  const db = env.NOTIFICATIONS;
  const backoff = await db.prepare("SELECT updated_at FROM push_alert_state WHERE key = 'backoff'")
    .first<{ updated_at: number }>();
  if (backoff && backoff.updated_at > now) return;
  const token = crypto.randomUUID();
  const lock = await db.prepare(`
    INSERT INTO push_alert_state (key, value, updated_at) VALUES ('discovery_lock', ?, ?)
    ON CONFLICT(key) DO UPDATE SET value = excluded.value, updated_at = excluded.updated_at
    WHERE push_alert_state.updated_at <= ?
    RETURNING value
  `).bind(token, now + LOCK_MS, now).first();
  if (!lock) return;
  try {
    await discover(env, now);
  } catch (error) {
    if (!(error instanceof BudgetExhausted)) throw error;
    console.warn("Push discovery request budget exhausted");
  } finally {
    await db.prepare("DELETE FROM push_alert_state WHERE key = 'discovery_lock' AND value = ?")
      .bind(token).run();
  }
}
