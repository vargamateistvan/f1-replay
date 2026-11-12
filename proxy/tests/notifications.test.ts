import { afterAll, afterEach, beforeAll, beforeEach, describe, expect, it, vi } from "vitest";
import { readFileSync } from "node:fs";
import { Miniflare } from "miniflare";
import { generateKeyPairSync, randomBytes } from "node:crypto";
import {
  cleanNotificationSubscriptions, handleNotifications, validateSubscription,
  SUBSCRIPTION_RETENTION_MS, type NotificationEnv,
} from "../src/notifications";
import worker from "../src/index";

const origin = "https://f1replay.app";
const credential = randomBytes(32).toString("base64url");
const otherCredential = randomBytes(32).toString("base64url");
const keyPair = generateKeyPairSync("ec", { namedCurve: "prime256v1" });
const jwk = keyPair.privateKey.export({ format: "jwk" });
const publicKey = Buffer.concat([
  Buffer.from([4]), Buffer.from(jwk.x!, "base64url"), Buffer.from(jwk.y!, "base64url"),
]).toString("base64url");
const subscription = {
  endpoint: "https://web.push.apple.com/test-device",
  keys: { p256dh: publicKey, auth: randomBytes(16).toString("base64url") },
};

let mf: Miniflare;
let env: NotificationEnv;

function request(path: string, method = "GET", data?: unknown, token = credential, requestOrigin = origin) {
  return new Request(`https://proxy.f1replay.app/notifications/${path}`, {
    method,
    headers: {
      Origin: requestOrigin, Authorization: `Bearer ${token}`,
      "CF-Connecting-IP": "192.0.2.1",
      ...(data === undefined ? {} : { "Content-Type": "application/json" }),
    },
    body: data === undefined ? undefined : JSON.stringify(data),
  });
}

async function register(token = credential, endpoint = subscription.endpoint) {
  return handleNotifications(request("subscriptions", "POST", { ...subscription, endpoint }, token), env);
}

beforeAll(async () => {
  mf = new Miniflare({
    modules: true, script: "export default { fetch() { return new Response('ok'); } };",
    d1Databases: ["NOTIFICATIONS"],
  });
  const db = await mf.getD1Database("NOTIFICATIONS");
  await db.exec(readFileSync(new URL("../migrations/0001_push_subscriptions.sql", import.meta.url), "utf8").replace(/\n/g, " "));
  env = {
    NOTIFICATIONS: db, PUSH_ENABLED: "true",
    VAPID_PUBLIC_KEY: publicKey, VAPID_PRIVATE_KEY: jwk.d,
    VAPID_SUBJECT: "mailto:security@f1replay.app",
  };
});

beforeEach(async () => {
  await env.NOTIFICATIONS!.batch([
    env.NOTIFICATIONS!.prepare("DELETE FROM push_subscriptions"),
    env.NOTIFICATIONS!.prepare("DELETE FROM push_registration_limits"),
  ]);
});

afterEach(() => {
  vi.restoreAllMocks();
  vi.unstubAllGlobals();
});
afterAll(async () => { await mf.dispose(); });

describe("notification routes", () => {
  it("is disabled without provisioning and does not change public proxy preflight", async () => {
    const config = await handleNotifications(request("config"), {});
    expect(await config.json()).toEqual({ enabled: false });
    expect(config.headers.get("Cache-Control")).toBe("no-store");
    const preflight = await worker.fetch(new Request("https://proxy.f1replay.app/v1/laps", { method: "OPTIONS" }), {
      CACHE: {} as KVNamespace,
    });
    expect(preflight.headers.get("Access-Control-Allow-Origin")).toBe("*");
    expect(preflight.headers.get("Access-Control-Allow-Methods")).toBe("GET, OPTIONS");
  });

  it("requires explicit origin and credentials; never caches device data", async () => {
    expect((await handleNotifications(request("config", "GET", undefined, credential, "https://evil.example"), env)).status).toBe(403);
    expect((await handleNotifications(request("subscription", "GET", undefined, "invalid"), env)).status).toBe(401);
    const response = await handleNotifications(request("config"), env);
    expect(response.headers.get("Access-Control-Allow-Origin")).toBe(origin);
    expect(response.headers.get("Cache-Control")).toBe("no-store");
    expect(await response.json()).toMatchObject({ enabled: true, publicKey, automaticAlerts: false });
    expect((await handleNotifications(request("config"), { PUSH_ENABLED: "true" })).status).toBe(503);
  });

  it("registers idempotently and prevents another credential taking ownership", async () => {
    expect((await register()).status).toBe(200);
    expect((await register()).status).toBe(200);
    expect((await register(otherCredential)).status).toBe(409);
    expect(await (await handleNotifications(request("subscription"), env)).json()).toMatchObject({
      enabled: true, endpoint: subscription.endpoint,
    });
  });

  it("replaces a rotated endpoint without retaining the old subscription", async () => {
    await register();
    const endpoint = "https://fcm.googleapis.com/fcm/send/new-device";
    expect((await register(credential, endpoint)).status).toBe(200);
    expect(await env.NOTIFICATIONS!.prepare("SELECT count(*) AS count FROM push_subscriptions").first()).toEqual({ count: 1 });
    expect(await (await handleNotifications(request("subscription"), env)).json()).toMatchObject({ endpoint });
  });

  it("revokes idempotently even when sending is switched off", async () => {
    await register();
    const off = { ...env, PUSH_ENABLED: "false" };
    expect((await handleNotifications(request("subscription", "DELETE"), off)).status).toBe(200);
    expect((await handleNotifications(request("subscription", "DELETE"), off)).status).toBe(200);
    expect(await (await handleNotifications(request("subscription"), off)).json()).toMatchObject({ enabled: false });
  });

  it("rate-limits registration and bounds request bodies", async () => {
    const huge = await handleNotifications(request("subscriptions", "POST", { padding: "x".repeat(5000) }), env);
    expect(huge.status).toBe(413);
    for (let i = 0; i < 9; i++) await register();
    expect((await register()).status).toBe(429);
  });

  it("builds Apple-compatible encrypted push and rate-limits test sends atomically", async () => {
    await register();
    const provider = vi.fn().mockResolvedValue(new Response(null, { status: 201 }));
    vi.stubGlobal("fetch", provider);
    expect((await handleNotifications(request("test", "POST"), env)).status).toBe(200);
    const [endpoint, options] = provider.mock.calls[0];
    expect(endpoint).toBe(subscription.endpoint);
    expect(options.redirect).toBe("error");
    expect(new Headers(options.headers).get("Content-Encoding")).toBe("aes128gcm");
    expect(new Headers(options.headers).get("Authorization")).toMatch(/^vapid /);
    await register();
    expect((await handleNotifications(request("test", "POST"), env)).status).toBe(429);
    expect(provider).toHaveBeenCalledTimes(1);
  });

  it("removes expired provider subscriptions and surfaces delivery errors", async () => {
    await register();
    vi.stubGlobal("fetch", vi.fn().mockResolvedValue(new Response(null, { status: 410 })));
    expect((await handleNotifications(request("test", "POST"), env)).status).toBe(410);
    expect(await (await handleNotifications(request("subscription"), env)).json()).toMatchObject({ enabled: false });
    await register();
    vi.stubGlobal("fetch", vi.fn().mockResolvedValue(new Response(null, { status: 503 })));
    vi.spyOn(console, "warn").mockImplementation(() => {});
    expect((await handleNotifications(request("test", "POST"), env)).status).toBe(502);
  });

  it("reports push preparation failures without logging secrets or subscription details", async () => {
    await register();
    const log = vi.spyOn(console, "error").mockImplementation(() => {});
    const fetch = vi.fn();
    vi.stubGlobal("fetch", fetch);
    const invalid = { ...env, VAPID_PRIVATE_KEY: "not-a-valid-key" };
    const response = await handleNotifications(request("test", "POST"), invalid);
    expect(response.status).toBe(503);
    expect(await response.json()).toMatchObject({ error: expect.stringContaining("Could not prepare") });
    expect(fetch).not.toHaveBeenCalled();
    expect(log).toHaveBeenCalledWith("Device notification request failed.", {
      stage: "prepare_test", errorType: expect.any(String),
    });
    expect(JSON.stringify(log.mock.calls)).not.toContain(subscription.endpoint);
    expect(JSON.stringify(log.mock.calls)).not.toContain(invalid.VAPID_PRIVATE_KEY);
  });

  it("reports provider connection failures separately without logging endpoint details", async () => {
    await register();
    const log = vi.spyOn(console, "error").mockImplementation(() => {});
    vi.stubGlobal("fetch", vi.fn().mockRejectedValue(new TypeError(`Connection failed: ${subscription.endpoint}`)));
    const response = await handleNotifications(request("test", "POST"), env);
    expect(response.status).toBe(502);
    expect(await response.json()).toMatchObject({ error: expect.stringContaining("Could not reach") });
    expect(log).toHaveBeenCalledWith("Device notification request failed.", {
      stage: "send_test", errorType: "TypeError",
    });
    expect(JSON.stringify(log.mock.calls)).not.toContain(subscription.endpoint);
  });

  it("deletes old subscriptions and expired registration buckets", async () => {
    await register();
    await env.NOTIFICATIONS!.prepare("UPDATE push_subscriptions SET updated_at = ?")
      .bind(Date.now() - SUBSCRIPTION_RETENTION_MS - 1).run();
    await env.NOTIFICATIONS!.prepare("UPDATE push_registration_limits SET expires_at = 0").run();
    await cleanNotificationSubscriptions(env);
    expect(await env.NOTIFICATIONS!.prepare("SELECT count(*) AS count FROM push_subscriptions").first()).toEqual({ count: 0 });
    expect(await env.NOTIFICATIONS!.prepare("SELECT count(*) AS count FROM push_registration_limits").first()).toEqual({ count: 0 });
  });
});

describe("subscription validation", () => {
  it.each([
    "https://localhost/push", "http://web.push.apple.com/push",
    "https://web.push.apple.com.evil.example/push", "https://fcm.googleapis.com:444/push",
    "https://user:pass@web.push.apple.com/push", "https://web.push.apple.com/push#fragment",
  ])("rejects unsafe endpoints: %s", async (endpoint) => {
    await expect(validateSubscription({ ...subscription, endpoint })).rejects.toThrow();
  });

  it("rejects invalid key material", async () => {
    await expect(validateSubscription({ ...subscription, keys: { auth: "x", p256dh: publicKey } })).rejects.toThrow();
    await expect(validateSubscription({
      ...subscription, keys: { auth: subscription.keys.auth, p256dh: randomBytes(65).toString("base64url") },
    })).rejects.toThrow();
  });
});
