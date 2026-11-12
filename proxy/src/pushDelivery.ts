/* global D1PreparedStatement */
import { buildPushPayload } from "@block65/webcrypto-web-push";
import { isPushPreferences } from "../../src/utils/pushPreferences";
import { validateSubscription } from "./notifications";
import { pushSessionType, type PushEvent, type PushSession } from "./pushEvents";
import type { Env } from "./index";

const MINUTE = 60_000;
const DAY = 24 * 60 * MINUTE;
const LEASE_MS = 5 * MINUTE;
const CALENDAR_MAX_AGE_MS = 2 * MINUTE;
const FANOUT_BATCH = 100;
const DELIVERY_BATCH = 8;
const MAX_ATTEMPTS = 5;
const TIMEOUT_MS = 10_000;

interface EventRow {
  event_key: string;
  kind: PushEvent["kind"];
  occurred_at: number;
  expires_at: number;
  session_json: string;
  cursor: string;
}

interface DeliveryRow extends EventRow {
  credential_hash: string;
  attempts: number;
}

interface DeviceRow {
  endpoint: string;
  p256dh: string;
  auth: string;
  created_at: number;
  preferences: string;
  updated_at: number;
}

function sessionFromJson(value: string): PushSession {
  const parsed: unknown = JSON.parse(value);
  if (!parsed || typeof parsed !== "object" || Array.isArray(parsed)) throw new Error("Invalid stored session");
  const s = parsed as Record<string, unknown>;
  if (typeof s.session_key !== "number" || typeof s.meeting_key !== "number" ||
      typeof s.year !== "number" || typeof s.session_name !== "string" ||
      typeof s.session_type !== "string" || typeof s.date_start !== "string" ||
      typeof s.date_end !== "string" || typeof s.is_cancelled !== "boolean") {
    throw new Error("Invalid stored session");
  }
  return {
    session_key: s.session_key, meeting_key: s.meeting_key, year: s.year,
    session_name: s.session_name, session_type: s.session_type, date_start: s.date_start,
    date_end: s.date_end, is_cancelled: s.is_cancelled,
  };
}

async function fanout(db: D1Database, now: number): Promise<boolean> {
  const token = crypto.randomUUID();
  const event = await db.prepare(`
    UPDATE push_alert_events SET lease_token = ?, lease_until = ?
    WHERE event_key = (
      SELECT event_key FROM push_alert_events
      WHERE fanout_done = 0 AND expires_at > ? AND lease_until <= ?
      ORDER BY expires_at LIMIT 1
    ) RETURNING event_key, kind, occurred_at, expires_at, session_json, cursor
  `).bind(token, now + LEASE_MS, now, now).first<EventRow>();
  if (!event) return false;
  const category = pushSessionType(sessionFromJson(event.session_json));
  if (!category) throw new Error("Invalid stored push category");
  const devices = await db.prepare(`
    SELECT s.credential_hash, s.created_at, p.preferences, p.updated_at
    FROM push_subscriptions s JOIN push_preferences p ON p.credential_hash = s.credential_hash
    WHERE s.credential_hash > ? ORDER BY s.credential_hash LIMIT ?
  `).bind(event.cursor, FANOUT_BATCH).all<{ credential_hash: string; created_at: number; preferences: string; updated_at: number }>();
  const statements: D1PreparedStatement[] = [];
  for (const device of devices.results) {
    const prefs: unknown = JSON.parse(device.preferences);
    if (!isPushPreferences(prefs)) throw new Error("Invalid stored push preferences");
    if (device.created_at > event.occurred_at || device.updated_at > event.occurred_at ||
        !prefs.alerts[event.kind] || !prefs.sessions[category]) continue;
    statements.push(db.prepare(`
      INSERT OR IGNORE INTO push_alert_deliveries (event_key, credential_hash)
      SELECT event_key, ? FROM push_alert_events WHERE event_key = ? AND lease_token = ?
    `).bind(device.credential_hash, event.event_key, token));
  }
  const cursor = devices.results.at(-1)?.credential_hash ?? event.cursor;
  statements.push(db.prepare(`
    UPDATE push_alert_events SET cursor = ?, fanout_done = ?, lease_token = NULL, lease_until = 0
    WHERE event_key = ? AND lease_token = ?
  `).bind(cursor, devices.results.length < FANOUT_BATCH ? 1 : 0, event.event_key, token));
  await db.batch(statements);
  return true;
}

function retryTime(response: Response, now: number, attempts: number): number {
  const retryAfter = response.headers.get("Retry-After");
  const seconds = retryAfter && /^\d+$/.test(retryAfter) ? Number(retryAfter) : 0;
  const date = retryAfter ? Date.parse(retryAfter) : NaN;
  return Math.max(now + MINUTE * 2 ** (attempts - 1),
    seconds ? now + seconds * 1000 : Number.isFinite(date) ? date : 0);
}

async function finish(db: D1Database, row: DeliveryRow, token: string, status: string, nextAttempt = 0): Promise<void> {
  await db.prepare(`
    UPDATE push_alert_deliveries SET status = ?, next_attempt = ?, lease_token = NULL, lease_until = 0
    WHERE event_key = ? AND credential_hash = ? AND lease_token = ?
  `).bind(status, nextAttempt, row.event_key, row.credential_hash, token).run();
}

async function sendOne(env: Env, row: DeliveryRow, token: string, sessions: PushSession[]): Promise<void> {
  const db = env.NOTIFICATIONS!;
  const now = Date.now();
  const original = sessionFromJson(row.session_json);
  const session = sessions.find((item) => item.session_key === original.session_key);
  const device = await db.prepare(`
    SELECT s.endpoint, s.p256dh, s.auth, s.created_at, p.preferences, p.updated_at
    FROM push_subscriptions s JOIN push_preferences p ON p.credential_hash = s.credential_hash
    WHERE s.credential_hash = ?
  `).bind(row.credential_hash).first<DeviceRow>();
  const prefs: unknown = device ? JSON.parse(device.preferences) : null;
  const category = session ? pushSessionType(session) : null;
  if (!session || session.is_cancelled || !device || !category || !isPushPreferences(prefs) ||
      !prefs.alerts[row.kind] || !prefs.sessions[category] || device.created_at > row.occurred_at ||
      device.updated_at > row.occurred_at || row.expires_at <= now ||
      (row.kind === "reminder" && session.date_start !== original.date_start)) {
    await finish(db, row, token, "skipped");
    return;
  }
  const params = new URLSearchParams({
    year: String(session.year), meeting: String(session.meeting_key),
    session: String(session.session_key), view: "tracker",
  });
  const url = row.kind === "results"
    ? `/schedule?${new URLSearchParams({ year: String(session.year), result: String(session.session_key) })}`
    : `/?${params}`;
  const body = row.kind === "reminder"
    ? `Starts in about ${Math.max(1, Math.ceil((Date.parse(session.date_start) - now) / MINUTE))} minutes.`
    : row.kind === "started" ? "The session has started." : "Session results are available.";
  try {
    const subscription = await validateSubscription({
      endpoint: device.endpoint, keys: { p256dh: device.p256dh, auth: device.auth },
    });
    const payload = await buildPushPayload({
      data: { version: 1, title: `${session.session_name} · ${session.year}`, body, tag: row.event_key, url },
      options: { ttl: Math.max(1, Math.floor((row.expires_at - now) / 1000)) },
    }, { ...subscription, expirationTime: null }, {
      subject: env.VAPID_SUBJECT!, publicKey: env.VAPID_PUBLIC_KEY!, privateKey: env.VAPID_PRIVATE_KEY!,
    });
    const response = await fetch(subscription.endpoint, {
      ...payload, redirect: "manual", signal: AbortSignal.timeout(TIMEOUT_MS),
    });
    await response.body?.cancel();
    if (response.status === 404 || response.status === 410) {
      await db.batch([
        db.prepare(`DELETE FROM push_alert_deliveries WHERE credential_hash = ?
          AND EXISTS (SELECT 1 FROM push_subscriptions WHERE credential_hash = ? AND endpoint = ?)`)
          .bind(row.credential_hash, row.credential_hash, device.endpoint),
        db.prepare(`DELETE FROM push_preferences WHERE credential_hash = ?
          AND EXISTS (SELECT 1 FROM push_subscriptions WHERE credential_hash = ? AND endpoint = ?)`)
          .bind(row.credential_hash, row.credential_hash, device.endpoint),
        db.prepare("DELETE FROM push_subscriptions WHERE credential_hash = ? AND endpoint = ?")
          .bind(row.credential_hash, device.endpoint),
      ]);
      await finish(db, row, token, "expired");
    } else if (response.ok) {
      await finish(db, row, token, "sent");
    } else if (response.status === 429 || response.status >= 500) {
      console.warn("Automatic push provider retry", { status: response.status, attempts: row.attempts });
      await finish(db, row, token, row.attempts >= MAX_ATTEMPTS ? "failed" : "pending",
        retryTime(response, now, row.attempts));
    } else {
      console.error("Automatic push rejected", { status: response.status });
      await finish(db, row, token, "failed");
    }
  } catch {
    console.error("Automatic push preparation or delivery failed", { kind: row.kind });
    await finish(db, row, token, row.attempts >= MAX_ATTEMPTS ? "failed" : "pending",
      now + MINUTE * 2 ** (row.attempts - 1));
  }
}

async function deliver(env: Env, now: number): Promise<boolean> {
  const db = env.NOTIFICATIONS!;
  const calendar = await db.prepare("SELECT value, updated_at FROM push_alert_state WHERE key = 'calendar'")
    .first<{ value: string; updated_at: number }>();
  if (!calendar || now - calendar.updated_at > CALENDAR_MAX_AGE_MS) {
    console.warn("Automatic push delivery paused: calendar unavailable or stale");
    return false;
  }
  const raw: unknown = JSON.parse(calendar.value);
  if (!Array.isArray(raw)) throw new Error("Invalid stored push calendar");
  const sessions = raw.map((item) => sessionFromJson(JSON.stringify(item)));
  let processed = 0;
  for (let i = 0; i < DELIVERY_BATCH; i++) {
    const currentTime = Date.now();
    if (currentTime - calendar.updated_at > CALENDAR_MAX_AGE_MS) break;
    const token = crypto.randomUUID();
    const row = await db.prepare(`
      UPDATE push_alert_deliveries SET lease_token = ?, lease_until = ?, attempts = attempts + 1
      WHERE (event_key, credential_hash) = (
        SELECT d.event_key, d.credential_hash FROM push_alert_deliveries d
        JOIN push_alert_events e ON e.event_key = d.event_key
        WHERE d.status = 'pending' AND d.next_attempt <= ? AND d.lease_until <= ? AND e.expires_at > ?
        ORDER BY e.expires_at LIMIT 1
      )
      RETURNING event_key, credential_hash, attempts
    `).bind(token, currentTime + LEASE_MS, currentTime, currentTime, currentTime)
      .first<Pick<DeliveryRow, "event_key" | "credential_hash" | "attempts">>();
    if (!row) break;
    const event = await db.prepare(`
      SELECT event_key, kind, occurred_at, expires_at, session_json, cursor FROM push_alert_events WHERE event_key = ?
    `).bind(row.event_key).first<EventRow>();
    if (!event) throw new Error("Push event missing for delivery");
    await sendOne(env, { ...event, ...row }, token, sessions);
    processed++;
  }
  return processed === DELIVERY_BATCH;
}

export async function processPushAlerts(env: Env): Promise<boolean> {
  if (env.PUSH_ENABLED !== "true" || env.PUSH_PREFERENCES_ENABLED !== "true" ||
      env.PUSH_DELIVERY_ENABLED !== "true") return false;
  if (!env.NOTIFICATIONS || !env.VAPID_PUBLIC_KEY || !env.VAPID_PRIVATE_KEY || !env.VAPID_SUBJECT) {
    throw new Error("Automatic push delivery is not configured");
  }
  const now = Date.now();
  const expanded = await fanout(env.NOTIFICATIONS, now);
  const moreDeliveries = await deliver(env, now);
  return expanded || moreDeliveries;
}

export async function cleanPushAlerts(db: D1Database, now = Date.now()): Promise<void> {
  await db.batch([
    db.prepare("DELETE FROM push_alert_deliveries WHERE event_key IN (SELECT event_key FROM push_alert_events WHERE retain_until < ?)").bind(now),
    db.prepare("DELETE FROM push_alert_events WHERE retain_until < ?").bind(now),
    db.prepare("DELETE FROM push_alert_state WHERE key LIKE 'poll:%' AND updated_at < ?").bind(now - 2 * DAY),
  ]);
}
