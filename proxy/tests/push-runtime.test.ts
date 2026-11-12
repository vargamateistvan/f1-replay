import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { Miniflare } from "miniflare";
import { build } from "esbuild";
import { generateKeyPairSync, randomBytes } from "node:crypto";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";

describe("push delivery in the Cloudflare Worker runtime", () => {
  let mf: Miniflare;
  const keys = generateKeyPairSync("ec", { namedCurve: "prime256v1" }).privateKey.export({ format: "jwk" });
  const publicKey = Buffer.concat([
    Buffer.from([4]), Buffer.from(keys.x!, "base64url"), Buffer.from(keys.y!, "base64url"),
  ]).toString("base64url");
  const credential = randomBytes(32).toString("base64url");
  const subscription = {
    endpoint: "https://web.push.apple.com/test",
    keys: { p256dh: publicKey, auth: randomBytes(16).toString("base64url") },
  };

  beforeAll(async () => {
    const result = await build({
      stdin: {
        contents: `
          import { handleNotifications } from "./proxy/src/notifications.ts";
          globalThis.fetch = async () => new Response(null, { status: 201 });
          export default { fetch(request, env) { return handleNotifications(request, env); } };
        `,
        resolveDir: resolve("."), loader: "ts",
      },
      bundle: true, write: false, format: "esm", platform: "browser",
    });
    mf = new Miniflare({
      modules: true, script: result.outputFiles[0].text,
      compatibilityDate: "2024-10-22", compatibilityFlags: ["nodejs_compat"],
      d1Databases: ["NOTIFICATIONS"],
      bindings: {
        PUSH_ENABLED: "true", VAPID_PUBLIC_KEY: publicKey,
        VAPID_PRIVATE_KEY: keys.d!, VAPID_SUBJECT: "mailto:test@example.com",
      },
    });
    const db = await mf.getD1Database("NOTIFICATIONS");
    await db.exec(readFileSync(resolve("proxy/migrations/0001_push_subscriptions.sql"), "utf8").replace(/\n/g, " "));
  });

  afterAll(async () => { await mf?.dispose(); });

  it("registers and constructs an encrypted test push in workerd", async () => {
    const headers = {
      Origin: "https://f1replay.app", Authorization: `Bearer ${credential}`,
      "Content-Type": "application/json", "CF-Connecting-IP": "192.0.2.1",
    };
    const registered = await mf.dispatchFetch("https://proxy.f1replay.app/notifications/subscriptions", {
      method: "POST", headers, body: JSON.stringify(subscription),
    });
    expect(await registered.json()).toEqual({ enabled: true });
    const sent = await mf.dispatchFetch("https://proxy.f1replay.app/notifications/test", {
      method: "POST", headers,
    });
    expect(await sent.json()).toEqual({ sent: true });
  });
});
