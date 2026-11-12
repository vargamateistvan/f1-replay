/* global RequestInit */
import { afterAll, afterEach, beforeAll, beforeEach, describe, expect, it, vi } from "vitest";
import { readFileSync } from "node:fs";
import { generateKeyPairSync, randomBytes } from "node:crypto";
import { Miniflare } from "miniflare";
import { build } from "esbuild";
import { resolve } from "node:path";
import { DEFAULT_PUSH_PREFERENCES } from "../../src/utils/pushPreferences";
import { discoverPushAlerts } from "../src/pushDiscovery";
import { cleanPushAlerts, processPushAlerts } from "../src/pushDelivery";
import type { Env } from "../src/index";

const now = Date.parse("2026-07-05T13:50:00Z");
const session = {
  session_key: 10, meeting_key: 2, year: 2026, session_name: "Race", session_type: "Race",
  date_start: "2026-07-05T14:00:00Z", date_end: "2026-07-05T16:00:00Z", is_cancelled: false,
};
const keys = generateKeyPairSync("ec", { namedCurve: "prime256v1" }).privateKey.export({ format: "jwk" });
const publicKey = Buffer.concat([Buffer.from([4]), Buffer.from(keys.x!, "base64url"), Buffer.from(keys.y!, "base64url")]).toString("base64url");
const preferences = {
  ...DEFAULT_PUSH_PREFERENCES,
  alerts: { reminder: true, started: true, results: true },
};
let mf: Miniflare;
let env: Env;
let providerStatus: number;
let requests: { url: string; init?: RequestInit }[];
let calendar = session;
let apiStatus = 200;
let controls: { date: string; message: string; qualifying_phase: number | null }[];
let resultRows: { session_key: number; driver_number: number; position: number }[];
let driverRows: { session_key: number; driver_number: number }[];

async function seedDevice(id = "a", prefs = preferences) {
  await env.NOTIFICATIONS!.batch([
    env.NOTIFICATIONS!.prepare(`
      INSERT INTO push_subscriptions (endpoint, p256dh, auth, credential_hash, created_at, updated_at)
      VALUES (?, ?, ?, ?, ?, ?)
    `).bind(`https://web.push.apple.com/${id}`, publicKey, randomBytes(16).toString("base64url"), id, now - 60_000, now),
    env.NOTIFICATIONS!.prepare("INSERT INTO push_preferences (credential_hash, preferences, updated_at) VALUES (?, ?, ?)")
      .bind(id, JSON.stringify(prefs), now - 60_000),
  ]);
}

beforeAll(async () => {
  mf = new Miniflare({ modules: true, script: "export default { fetch() { return new Response('ok'); } };", d1Databases: ["NOTIFICATIONS"] });
  const db = await mf.getD1Database("NOTIFICATIONS");
  for (const file of ["0001_push_subscriptions.sql", "0002_push_preferences.sql", "0003_push_outbox.sql"]) {
    await db.exec(readFileSync(new URL(`../migrations/${file}`, import.meta.url), "utf8").replace(/\n/g, " "));
  }
  env = {
    CACHE: {} as KVNamespace, NOTIFICATIONS: db, PUSH_ENABLED: "true",
    PUSH_PREFERENCES_ENABLED: "true", PUSH_DISCOVERY_ENABLED: "true", PUSH_DELIVERY_ENABLED: "true",
    VAPID_PUBLIC_KEY: publicKey, VAPID_PRIVATE_KEY: keys.d, VAPID_SUBJECT: "mailto:test@example.com",
  };
});

beforeEach(async () => {
  vi.useFakeTimers({ toFake: ["Date"] });
  vi.setSystemTime(now);
  providerStatus = 201;
  apiStatus = 200;
  controls = [];
  resultRows = [];
  driverRows = [];
  calendar = { ...session };
  requests = [];
  await env.NOTIFICATIONS!.batch([
    env.NOTIFICATIONS!.prepare("DELETE FROM push_alert_deliveries"),
    env.NOTIFICATIONS!.prepare("DELETE FROM push_alert_events"),
    env.NOTIFICATIONS!.prepare("DELETE FROM push_alert_state"),
    env.NOTIFICATIONS!.prepare("DELETE FROM push_preferences"),
    env.NOTIFICATIONS!.prepare("DELETE FROM push_subscriptions"),
  ]);
  vi.stubGlobal("fetch", vi.fn(async (input: string | URL | Request, init?: RequestInit) => {
    const url = String(input);
    requests.push({ url, init });
    if (url.startsWith("https://web.push.apple.com/")) {
      return new Response(null, { status: providerStatus, headers: providerStatus === 429 ? { "Retry-After": "180" } : {} });
    }
    if (apiStatus !== 200) return new Response(null, { status: apiStatus, headers: { "Retry-After": "120" } });
    if (url.includes("/sessions?")) return Response.json([calendar]);
    if (url.includes("/meetings?")) return Response.json([{ meeting_key: 2, is_cancelled: false }]);
    if (url.includes("/race_control?")) return Response.json(controls);
    if (url.includes("/session_result?")) return Response.json(resultRows);
    if (url.includes("/drivers?")) return Response.json(driverRows);
    throw new Error("Unexpected request");
  }));
});
afterEach(() => { vi.unstubAllGlobals(); vi.useRealTimers(); });
afterAll(async () => { await mf.dispose(); });

describe("automatic push pipeline", () => {
  it("discovers once, fans out opted-in devices and sends encrypted reminders", async () => {
    await seedDevice();
    await seedDevice("b", DEFAULT_PUSH_PREFERENCES);
    await discoverPushAlerts(env, now);
    await discoverPushAlerts(env, now);
    expect(await env.NOTIFICATIONS!.prepare("SELECT count(*) AS count FROM push_alert_events").first()).toEqual({ count: 1 });
    expect(await processPushAlerts(env)).toBe(true);
    const deliveries = await env.NOTIFICATIONS!.prepare("SELECT credential_hash, status FROM push_alert_deliveries").all();
    expect(deliveries.results).toEqual([{ credential_hash: "a", status: "sent" }]);
    const sends = requests.filter((r) => r.url.startsWith("https://web.push.apple.com/"));
    expect(sends).toHaveLength(1);
    expect(sends[0].init?.redirect).toBe("manual");
    expect(new Headers(sends[0].init?.headers).get("Content-Encoding")).toBe("aes128gcm");
    await processPushAlerts(env);
    expect(requests.filter((r) => r.url.startsWith("https://web.push.apple.com/"))).toHaveLength(1);
  });

  it("honours Retry-After and retries a transient provider response", async () => {
    await seedDevice();
    await discoverPushAlerts(env, now);
    providerStatus = 429;
    await processPushAlerts(env);
    expect(await env.NOTIFICATIONS!.prepare("SELECT status, attempts, next_attempt FROM push_alert_deliveries").first())
      .toEqual({ status: "pending", attempts: 1, next_attempt: now + 180_000 });
    vi.setSystemTime(now + 60_000);
    await processPushAlerts(env);
    expect(requests.filter((r) => r.url.startsWith("https://web.push.apple.com/"))).toHaveLength(1);
    // Keep the event useful and refresh the schedule as the real cron would.
    await env.NOTIFICATIONS!.prepare("UPDATE push_alert_events SET expires_at = ?").bind(now + 600_000).run();
    await env.NOTIFICATIONS!.prepare("UPDATE push_alert_state SET updated_at = ? WHERE key = 'calendar'").bind(now + 180_000).run();
    vi.setSystemTime(now + 180_000);
    providerStatus = 201;
    await processPushAlerts(env);
    expect(await env.NOTIFICATIONS!.prepare("SELECT status, attempts FROM push_alert_deliveries").first())
      .toEqual({ status: "sent", attempts: 2 });
  });

  it("skips a rescheduled session or a device that opted out before delivery", async () => {
    await seedDevice();
    await discoverPushAlerts(env, now);
    calendar = { ...session, date_start: "2026-07-05T15:00:00Z" };
    await discoverPushAlerts(env, now + 1000);
    await processPushAlerts(env);
    expect(await env.NOTIFICATIONS!.prepare("SELECT status FROM push_alert_deliveries").first()).toEqual({ status: "skipped" });
    expect(requests.filter((r) => r.url.startsWith("https://web.push.apple.com/"))).toHaveLength(0);
  });

  it("rechecks opt-out and unsubscribe before retrying a queued delivery", async () => {
    await seedDevice();
    await discoverPushAlerts(env, now);
    providerStatus = 503;
    await processPushAlerts(env);
    await env.NOTIFICATIONS!.prepare("UPDATE push_preferences SET preferences = ?, updated_at = ? WHERE credential_hash = 'a'")
      .bind(JSON.stringify(DEFAULT_PUSH_PREFERENCES), now + 1000).run();
    vi.setSystemTime(now + 60_000);
    providerStatus = 201;
    await processPushAlerts(env);
    expect(await env.NOTIFICATIONS!.prepare("SELECT status FROM push_alert_deliveries").first()).toEqual({ status: "skipped" });
    expect(requests.filter((r) => r.url.startsWith("https://web.push.apple.com/"))).toHaveLength(1);
  });

  it("discovers an actual start and a complete result only once", async () => {
    await seedDevice();
    calendar = { ...session, date_start: new Date(now - 30_000).toISOString(),
      date_end: new Date(now + 60_000).toISOString() };
    controls = [{ date: new Date(now - 10_000).toISOString(), message: "SESSION STARTED", qualifying_phase: null }];
    await discoverPushAlerts(env, now);
    expect(await env.NOTIFICATIONS!.prepare("SELECT kind FROM push_alert_events").first()).toEqual({ kind: "started" });
    const finished = now + 60_000;
    vi.setSystemTime(finished);
    controls.push({ date: new Date(finished - 1000).toISOString(), message: "CHEQUERED FLAG", qualifying_phase: null });
    resultRows = [{ session_key: 10, driver_number: 1, position: 1 }];
    driverRows = [{ session_key: 10, driver_number: 1 }, { session_key: 10, driver_number: 2 }];
    await discoverPushAlerts(env, finished);
    expect(await env.NOTIFICATIONS!.prepare("SELECT count(*) AS count FROM push_alert_events WHERE kind = 'results'").first()).toEqual({ count: 0 });
    resultRows.push({ session_key: 10, driver_number: 2, position: 2 });
    const later = finished + 5 * 60_000;
    vi.setSystemTime(later);
    await discoverPushAlerts(env, later);
    await discoverPushAlerts(env, later);
    expect(await env.NOTIFICATIONS!.prepare("SELECT count(*) AS count FROM push_alert_events WHERE kind = 'results'").first()).toEqual({ count: 1 });
  });

  it("serializes concurrent fan-out and sends a delivery at most once while leased", async () => {
    await seedDevice();
    await discoverPushAlerts(env, now);
    await Promise.all([processPushAlerts(env), processPushAlerts(env)]);
    expect(await env.NOTIFICATIONS!.prepare("SELECT count(*) AS count FROM push_alert_deliveries").first()).toEqual({ count: 1 });
    expect(requests.filter((r) => r.url.startsWith("https://web.push.apple.com/"))).toHaveLength(1);
  });

  it("resumes bounded fan-out across pages without losing devices", async () => {
    const statements = [];
    for (let i = 0; i < 101; i++) {
      const id = `device-${String(i).padStart(3, "0")}`;
      statements.push(
        env.NOTIFICATIONS!.prepare(`INSERT INTO push_subscriptions
          (endpoint, p256dh, auth, credential_hash, created_at, updated_at) VALUES (?, ?, ?, ?, ?, ?)`)
          .bind(`https://web.push.apple.com/${id}`, publicKey, randomBytes(16).toString("base64url"), id, now - 60_000, now),
        env.NOTIFICATIONS!.prepare("INSERT INTO push_preferences (credential_hash, preferences, updated_at) VALUES (?, ?, ?)")
          .bind(id, JSON.stringify(preferences), now - 60_000),
      );
    }
    await env.NOTIFICATIONS!.batch(statements);
    await discoverPushAlerts(env, now);
    await env.NOTIFICATIONS!.prepare("UPDATE push_alert_state SET updated_at = ? WHERE key = 'calendar'")
      .bind(now - 180_000).run();
    await processPushAlerts(env);
    expect(await env.NOTIFICATIONS!.prepare("SELECT count(*) AS count FROM push_alert_deliveries").first()).toEqual({ count: 100 });
    expect(await env.NOTIFICATIONS!.prepare("SELECT fanout_done FROM push_alert_events").first()).toEqual({ fanout_done: 0 });
    await processPushAlerts(env);
    expect(await env.NOTIFICATIONS!.prepare("SELECT count(*) AS count FROM push_alert_deliveries").first()).toEqual({ count: 101 });
    expect(await env.NOTIFICATIONS!.prepare("SELECT fanout_done FROM push_alert_events").first()).toEqual({ fanout_done: 1 });
  });

  it("recovers a delivery after its lease expires", async () => {
    await seedDevice();
    await discoverPushAlerts(env, now);
    await env.NOTIFICATIONS!.prepare("UPDATE push_alert_state SET updated_at = ? WHERE key = 'calendar'")
      .bind(now - 180_000).run();
    await processPushAlerts(env);
    await env.NOTIFICATIONS!.prepare("UPDATE push_alert_deliveries SET lease_until = ?, lease_token = 'old'")
      .bind(now + 30_000).run();
    await env.NOTIFICATIONS!.prepare("UPDATE push_alert_state SET updated_at = ? WHERE key = 'calendar'").bind(now).run();
    await processPushAlerts(env);
    expect(requests.filter((r) => r.url.startsWith("https://web.push.apple.com/"))).toHaveLength(0);
    vi.setSystemTime(now + 30_001);
    await processPushAlerts(env);
    expect(await env.NOTIFICATIONS!.prepare("SELECT status FROM push_alert_deliveries").first()).toEqual({ status: "sent" });
  });

  it("pauses on a stale calendar and deletes subscriptions rejected as expired", async () => {
    await seedDevice();
    await discoverPushAlerts(env, now);
    await env.NOTIFICATIONS!.prepare("UPDATE push_alert_state SET updated_at = ? WHERE key = 'calendar'").bind(now - 180_000).run();
    await processPushAlerts(env);
    expect(requests.filter((r) => r.url.startsWith("https://web.push.apple.com/"))).toHaveLength(0);
    await env.NOTIFICATIONS!.prepare("UPDATE push_alert_state SET updated_at = ? WHERE key = 'calendar'").bind(now).run();
    providerStatus = 410;
    await processPushAlerts(env);
    expect(await env.NOTIFICATIONS!.prepare("SELECT count(*) AS count FROM push_subscriptions").first()).toEqual({ count: 0 });
    expect(await env.NOTIFICATIONS!.prepare("SELECT count(*) AS count FROM push_preferences").first()).toEqual({ count: 0 });
  });

  it("does not discover on API access failure and observes upstream backoff", async () => {
    apiStatus = 429;
    await expect(discoverPushAlerts(env, now)).rejects.toThrow("OpenF1 push discovery failed");
    expect(requests).toHaveLength(1);
    await discoverPushAlerts(env, now + 60_000);
    expect(requests).toHaveLength(1);
    expect(await env.NOTIFICATIONS!.prepare("SELECT count(*) AS count FROM push_alert_events").first()).toEqual({ count: 0 });
  });

  it("does nothing when disabled and cleans expired state", async () => {
    await discoverPushAlerts({ ...env, PUSH_DISCOVERY_ENABLED: "false" }, now);
    expect(requests).toHaveLength(0);
    await discoverPushAlerts(env, now);
    await cleanPushAlerts(env.NOTIFICATIONS!, now + 3 * 24 * 60 * 60_000);
    expect(await env.NOTIFICATIONS!.prepare("SELECT count(*) AS count FROM push_alert_events").first()).toEqual({ count: 0 });
    expect(await processPushAlerts({ ...env, PUSH_DELIVERY_ENABLED: "false" })).toBe(false);
  });

  it("sends an automatic reminder through workerd with a real outbound request", async () => {
    vi.useRealTimers();
    const result = await build({
      stdin: {
        contents: `
          import { discoverPushAlerts } from "./proxy/src/pushDiscovery.ts";
          import worker from "./proxy/src/index.ts";
          export default { async fetch(request, env) {
            const time = Number(new URL(request.url).searchParams.get("time"));
            await discoverPushAlerts(env, time);
            await env.PUSH_QUEUE.send({ type: "drain" });
            return new Response("ok");
          }, queue: worker.queue };
        `,
        resolveDir: resolve("."), loader: "ts",
      },
      bundle: true, write: false, format: "esm", platform: "browser",
    });
    const realNow = Date.now();
    const realSession = {
      ...session, year: new Date(realNow).getUTCFullYear(),
      date_start: new Date(realNow + 10 * 60_000).toISOString(),
      date_end: new Date(realNow + 130 * 60_000).toISOString(),
    };
    const outbound: string[] = [];
    const runtime = new Miniflare({
      modules: true, script: result.outputFiles[0].text, compatibilityDate: "2024-10-22",
      compatibilityFlags: ["nodejs_compat"], d1Databases: ["NOTIFICATIONS"],
      queueProducers: { PUSH_QUEUE: "push" },
      queueConsumers: { push: { maxBatchSize: 1, maxBatchTimeout: 1 } },
      bindings: {
        PUSH_ENABLED: "true", PUSH_PREFERENCES_ENABLED: "true", PUSH_DISCOVERY_ENABLED: "true",
        PUSH_DELIVERY_ENABLED: "true", VAPID_PUBLIC_KEY: publicKey,
        VAPID_PRIVATE_KEY: keys.d!, VAPID_SUBJECT: "mailto:test@example.com",
      },
      outboundService: async (request) => {
        const url = new URL(request.url);
        outbound.push(url.hostname);
        if (url.pathname === "/v1/sessions") return Response.json([realSession]);
        if (url.pathname === "/v1/meetings") return Response.json([{ meeting_key: 2, is_cancelled: false }]);
        if (url.hostname === "web.push.apple.com") {
          expect(request.headers.get("content-encoding")).toBe("aes128gcm");
          expect((await request.arrayBuffer()).byteLength).toBeGreaterThan(0);
          return new Response(null, { status: 201 });
        }
        return new Response(null, { status: 500 });
      },
    });
    try {
      const db = await runtime.getD1Database("NOTIFICATIONS");
      for (const file of ["0001_push_subscriptions.sql", "0002_push_preferences.sql", "0003_push_outbox.sql"]) {
        await db.exec(readFileSync(new URL(`../migrations/${file}`, import.meta.url), "utf8").replace(/\n/g, " "));
      }
      await db.batch([
        db.prepare(`INSERT INTO push_subscriptions
          (endpoint, p256dh, auth, credential_hash, created_at, updated_at) VALUES (?, ?, ?, ?, ?, ?)`)
          .bind("https://web.push.apple.com/runtime", publicKey, randomBytes(16).toString("base64url"), "runtime", realNow - 60_000, realNow),
        db.prepare("INSERT INTO push_preferences (credential_hash, preferences, updated_at) VALUES (?, ?, ?)")
          .bind("runtime", JSON.stringify(preferences), realNow - 60_000),
      ]);
      const response = await runtime.dispatchFetch(`https://test.invalid/?time=${realNow}`);
      expect(response.status).toBe(200);
      await vi.waitFor(async () => {
        expect(await db.prepare("SELECT status FROM push_alert_deliveries").first()).toEqual({ status: "sent" });
      }, { timeout: 10_000 });
      expect(outbound).toEqual(["api.openf1.org", "api.openf1.org", "web.push.apple.com"]);
    } finally {
      await runtime.dispose();
    }
  });
});
