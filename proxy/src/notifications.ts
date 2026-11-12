import { buildPushPayload } from "@block65/webcrypto-web-push";

export interface NotificationEnv {
  NOTIFICATIONS?: D1Database;
  PUSH_ENABLED?: string;
  PUSH_ORIGINS?: string;
  VAPID_PUBLIC_KEY?: string;
  VAPID_PRIVATE_KEY?: string;
  VAPID_SUBJECT?: string;
}

const BODY_LIMIT_BYTES = 4096;
const REQUEST_WINDOW_MS = 60_000;
const REGISTRATION_LIMIT = 10;
const TEST_TTL_SECONDS = 60;
const PROVIDER_TIMEOUT_MS = 10_000;
export const SUBSCRIPTION_RETENTION_MS = 180 * 24 * 60 * 60 * 1000;
const DEFAULT_ORIGIN = "https://f1replay.app";
const METHODS = "GET, POST, DELETE, OPTIONS";

interface Subscription {
  endpoint: string;
  keys: { p256dh: string; auth: string };
}

interface StoredSubscription {
  endpoint: string;
  p256dh: string;
  auth: string;
  credential_hash: string;
}

class RequestError extends Error {
  constructor(readonly status: number, message: string) {
    super(message);
  }
}

function decodeKey(value: unknown, length: number): Uint8Array<ArrayBuffer> {
  if (typeof value !== "string" || !/^[A-Za-z0-9_-]+$/.test(value)) {
    throw new RequestError(400, "Invalid subscription key.");
  }
  let raw: string;
  try {
    raw = atob(value.replace(/-/g, "+").replace(/_/g, "/"));
  } catch {
    throw new RequestError(400, "Invalid subscription key.");
  }
  const bytes = Uint8Array.from(raw, (char) => char.charCodeAt(0));
  if (bytes.length !== length) throw new RequestError(400, "Invalid subscription key.");
  return bytes;
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

export async function validateSubscription(value: unknown): Promise<Subscription> {
  if (!isRecord(value) || typeof value.endpoint !== "string" || !isRecord(value.keys)) {
    throw new RequestError(400, "Invalid push subscription.");
  }
  let url: URL;
  try {
    url = new URL(value.endpoint);
  } catch {
    throw new RequestError(400, "Invalid push endpoint.");
  }
  const host = url.hostname;
  const supported =
    host === "fcm.googleapis.com" ||
    host === "updates.push.services.mozilla.com" ||
    host.endsWith(".push.services.mozilla.com") ||
    host === "web.push.apple.com" ||
    host.endsWith(".push.apple.com") ||
    host.endsWith(".notify.windows.com");
  if (!supported || url.protocol !== "https:" || url.port || url.username ||
      url.password || url.hash || value.endpoint.length > 2048) {
    throw new RequestError(400, "Unsupported push endpoint.");
  }
  const publicKey = decodeKey(value.keys.p256dh, 65);
  decodeKey(value.keys.auth, 16);
  try {
    await crypto.subtle.importKey("raw", publicKey, { name: "ECDH", namedCurve: "P-256" }, false, []);
  } catch {
    throw new RequestError(400, "Invalid subscription public key.");
  }
  return {
    endpoint: url.href,
    keys: { p256dh: String(value.keys.p256dh), auth: String(value.keys.auth) },
  };
}

async function hash(value: string): Promise<string> {
  const digest = await crypto.subtle.digest("SHA-256", new TextEncoder().encode(value));
  return Array.from(new Uint8Array(digest), (byte) => byte.toString(16).padStart(2, "0")).join("");
}

function credential(request: Request): string {
  const match = /^Bearer ([A-Za-z0-9_-]{43})$/.exec(request.headers.get("Authorization") ?? "");
  if (!match) throw new RequestError(401, "Device credential required.");
  return match[1];
}

async function body(request: Request): Promise<unknown> {
  if (request.headers.get("Content-Type")?.split(";")[0].trim() !== "application/json") {
    throw new RequestError(415, "JSON body required.");
  }
  const reader = request.body?.getReader();
  if (!reader) throw new RequestError(400, "JSON body required.");
  const chunks: Uint8Array[] = [];
  let size = 0;
  for (;;) {
    const { done, value } = await reader.read();
    if (done) break;
    size += value.byteLength;
    if (size > BODY_LIMIT_BYTES) {
      await reader.cancel();
      throw new RequestError(413, "Request body too large.");
    }
    chunks.push(value);
  }
  const bytes = new Uint8Array(size);
  let offset = 0;
  for (const chunk of chunks) {
    bytes.set(chunk, offset);
    offset += chunk.byteLength;
  }
  try {
    return JSON.parse(new TextDecoder().decode(bytes));
  } catch {
    throw new RequestError(400, "Invalid JSON.");
  }
}

function configured(env: NotificationEnv): boolean {
  return Boolean(env.NOTIFICATIONS && env.VAPID_PUBLIC_KEY &&
    env.VAPID_PRIVATE_KEY && /^mailto:|^https:\/\//.test(env.VAPID_SUBJECT ?? ""));
}

export async function handleNotifications(request: Request, env: NotificationEnv): Promise<Response> {
  const origin = request.headers.get("Origin") ?? "";
  const origins = (env.PUSH_ORIGINS ?? DEFAULT_ORIGIN).split(",").map((item) => item.trim());
  const allowed = origins.includes(origin);
  const headers: Record<string, string> = {
    "Content-Type": "application/json",
    "Cache-Control": "no-store",
    Vary: "Origin",
    ...(allowed ? {
      "Access-Control-Allow-Origin": origin,
      "Access-Control-Allow-Methods": METHODS,
      "Access-Control-Allow-Headers": "Authorization, Content-Type",
    } : {}),
  };
  const respond = (data: unknown, status = 200) =>
    new Response(JSON.stringify(data), { status, headers });

  if (!allowed) return respond({ error: "Origin not allowed." }, 403);
  if (request.method === "OPTIONS") return new Response(null, { status: 204, headers });

  try {
    const path = new URL(request.url).pathname;
    if (path === "/notifications/config" && request.method === "GET") {
      if (env.PUSH_ENABLED !== "true") return respond({ enabled: false });
      if (!configured(env)) throw new RequestError(503, "Device notifications are not configured.");
      return respond({ enabled: true, publicKey: env.VAPID_PUBLIC_KEY, automaticAlerts: false });
    }
    if (!env.NOTIFICATIONS) throw new RequestError(503, "Device notifications are unavailable.");
    const db = env.NOTIFICATIONS;
    const credentialHash = await hash(credential(request));
    const now = Date.now();

    if (path === "/notifications/subscriptions" && request.method === "POST") {
      if (env.PUSH_ENABLED !== "true" || !configured(env)) {
        throw new RequestError(503, "Device notifications are unavailable.");
      }
      // Cloudflare supplies this header; daily cleanup removes expired, secret-salted hashes.
      const ip = request.headers.get("CF-Connecting-IP");
      if (!ip) throw new RequestError(503, "Registration rate limiting is unavailable.");
      const rateKey = await hash(`${env.VAPID_PRIVATE_KEY}:${ip}`);
      const rate = await db.prepare(`
        INSERT INTO push_registration_limits (key, count, expires_at) VALUES (?, 1, ?)
        ON CONFLICT(key) DO UPDATE SET
          count = CASE WHEN expires_at <= ? THEN 1 ELSE count + 1 END,
          expires_at = CASE WHEN expires_at <= ? THEN excluded.expires_at ELSE expires_at END
        RETURNING count
      `).bind(rateKey, now + REQUEST_WINDOW_MS, now, now).first<{ count: number }>();
      if (!rate || rate.count > REGISTRATION_LIMIT) {
        throw new RequestError(429, "Too many registration attempts. Try again in a minute.");
      }
      const subscription = await validateSubscription(await body(request));
      const existing = await db.prepare("SELECT credential_hash FROM push_subscriptions WHERE endpoint = ?")
        .bind(subscription.endpoint).first<{ credential_hash: string }>();
      if (existing && existing.credential_hash !== credentialHash) {
        throw new RequestError(409, "Subscription belongs to a different device credential. Disable it in your browser and retry.");
      }
      const saved = await db.prepare(`
        INSERT INTO push_subscriptions (endpoint, p256dh, auth, credential_hash, created_at, updated_at)
        VALUES (?, ?, ?, ?, ?, ?)
        ON CONFLICT(credential_hash) DO UPDATE SET
          endpoint = excluded.endpoint, p256dh = excluded.p256dh, auth = excluded.auth,
          updated_at = excluded.updated_at
        RETURNING endpoint
      `).bind(subscription.endpoint, subscription.keys.p256dh, subscription.keys.auth,
        credentialHash, now, now).first();
      if (!saved) throw new RequestError(409, "Subscription ownership conflict.");
      return respond({ enabled: true });
    }

    if (path === "/notifications/subscription" && request.method === "DELETE") {
      await db.prepare("DELETE FROM push_subscriptions WHERE credential_hash = ?").bind(credentialHash).run();
      return respond({ enabled: false });
    }
    if (path === "/notifications/subscription" && request.method === "GET") {
      const row = await db.prepare(`
        UPDATE push_subscriptions SET updated_at = ? WHERE credential_hash = ?
        RETURNING endpoint
      `).bind(now, credentialHash).first<{ endpoint: string }>();
      return respond({ enabled: Boolean(row), endpoint: row?.endpoint ?? null });
    }
    if (path === "/notifications/test" && request.method === "POST") {
      if (env.PUSH_ENABLED !== "true" || !configured(env)) {
        throw new RequestError(503, "Device notifications are unavailable.");
      }
      const row = await db.prepare(`
        UPDATE push_subscriptions SET last_test_at = ?
        WHERE credential_hash = ? AND (last_test_at IS NULL OR last_test_at <= ?)
        RETURNING endpoint, p256dh, auth, credential_hash
      `).bind(now, credentialHash, now - REQUEST_WINDOW_MS).first<StoredSubscription>();
      if (!row) {
        const exists = await db.prepare("SELECT 1 FROM push_subscriptions WHERE credential_hash = ?")
          .bind(credentialHash).first();
        throw new RequestError(exists ? 429 : 404, exists
          ? "Wait a minute before sending another test."
          : "Subscription expired. Enable notifications again.");
      }
      const payload = await buildPushPayload({
        data: {
          version: 1, title: "F1 Replay", body: "Device notifications are working. Automated session alerts are not available yet.",
          tag: "f1-replay-test", url: "/home",
        },
        options: { ttl: TEST_TTL_SECONDS },
      }, { endpoint: row.endpoint, expirationTime: null, keys: { p256dh: row.p256dh, auth: row.auth } }, {
        subject: env.VAPID_SUBJECT!, publicKey: env.VAPID_PUBLIC_KEY!, privateKey: env.VAPID_PRIVATE_KEY!,
      });
      const result = await fetch(row.endpoint, {
        ...payload, redirect: "error", signal: AbortSignal.timeout(PROVIDER_TIMEOUT_MS),
      });
      await result.body?.cancel();
      if (result.status === 404 || result.status === 410) {
        await db.prepare("DELETE FROM push_subscriptions WHERE credential_hash = ?").bind(credentialHash).run();
        throw new RequestError(410, "Subscription expired. Disable notifications and enable them again.");
      }
      if (!result.ok) {
        console.warn("Web Push provider rejected test", { status: result.status });
        throw new RequestError(502, "Push provider rejected the test. Try again later.");
      }
      return respond({ sent: true });
    }
    return respond({ error: "Unknown notification route or unsupported method." }, 404);
  } catch (error) {
    if (error instanceof RequestError) return respond({ error: error.message }, error.status);
    // Never log provider URLs, subscription material or request bodies.
    console.error("Device notification request failed.");
    return respond({ error: "Device notification request failed. Please retry." }, 500);
  }
}

export async function cleanNotificationSubscriptions(env: NotificationEnv): Promise<void> {
  if (!env.NOTIFICATIONS) return;
  const now = Date.now();
  await env.NOTIFICATIONS.batch([
    env.NOTIFICATIONS.prepare("DELETE FROM push_subscriptions WHERE updated_at < ?")
      .bind(now - SUBSCRIPTION_RETENTION_MS),
    env.NOTIFICATIONS.prepare("DELETE FROM push_registration_limits WHERE expires_at <= ?").bind(now),
  ]);
}
