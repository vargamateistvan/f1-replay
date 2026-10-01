#!/usr/bin/env node
import { readFileSync } from "node:fs";

/**
 * One-off backfill: give legacy KV cache entries the 90-day expiry.
 *
 * Before the 90-day TTL was introduced, historical entries were written to
 * KV without an expiration, so they'd live forever. KV expirations are fixed
 * at write time, so the only way to put them on the clock is to re-write
 * them. This script lists every `openf1:` key, picks the ones with no
 * expiration, and re-writes their value with `expiration_ttl` = 90 days
 * (counted from now). Values are preserved — no OpenF1 refetch is needed.
 *
 * Dry run by default; pass `--apply` to actually write.
 *
 * Environment:
 *   CLOUDFLARE_API_TOKEN   required — token with "Workers KV Storage: Edit"
 *   CLOUDFLARE_ACCOUNT_ID  required
 *   KV_NAMESPACE_ID        optional — defaults to the CACHE binding id in
 *                          wrangler.toml
 *
 * Usage:
 *   node scripts/expire-legacy-kv.mjs            # report only
 *   node scripts/expire-legacy-kv.mjs --apply    # re-write with 90-day TTL
 */

// Mirror TTL_HISTORICAL_KV in src/index.ts — keep in sync.
const TTL_HISTORICAL_KV = 60 * 60 * 24 * 90;
const KEY_PREFIX = "openf1:";

// Cloudflare bulk-write limits: 10 000 pairs / 100 MB per request.
const BULK_MAX_PAIRS = 1000;
const BULK_MAX_BYTES = 50 * 1024 * 1024;
// Cloudflare API allows 1200 requests / 5 min per user.
const READ_CONCURRENCY = 3;
const MIN_REQUEST_INTERVAL_MS = 260;
const MAX_RETRIES = 5;

const APPLY = process.argv.includes("--apply");
const API_TOKEN = process.env.CLOUDFLARE_API_TOKEN ?? "";
const ACCOUNT_ID = process.env.CLOUDFLARE_ACCOUNT_ID ?? "";
const NAMESPACE_ID =
  process.env.KV_NAMESPACE_ID ?? readNamespaceIdFromWrangler();

if (!API_TOKEN || !ACCOUNT_ID || !NAMESPACE_ID) {
  console.error(
    "CLOUDFLARE_API_TOKEN, CLOUDFLARE_ACCOUNT_ID and a KV namespace id are required.",
  );
  process.exit(1);
}

const NS_BASE = `https://api.cloudflare.com/client/v4/accounts/${ACCOUNT_ID}/storage/kv/namespaces/${NAMESPACE_ID}`;

function readNamespaceIdFromWrangler() {
  try {
    const toml = readFileSync(
      new URL("../wrangler.toml", import.meta.url),
      "utf8",
    );
    const block = toml.match(
      /\[\[kv_namespaces\]\][^[]*?binding\s*=\s*"CACHE"[^[]*?\bid\s*=\s*"([^"]+)"/,
    );
    return block?.[1] ?? "";
  } catch {
    return "";
  }
}

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

let nextRequestAt = 0;
async function throttle() {
  const now = Date.now();
  const wait = Math.max(0, nextRequestAt - now);
  nextRequestAt = Math.max(now, nextRequestAt) + MIN_REQUEST_INTERVAL_MS;
  if (wait > 0) await sleep(wait);
}

async function cfFetch(url, init = {}) {
  for (let attempt = 0; ; attempt++) {
    await throttle();
    const res = await fetch(url, {
      ...init,
      headers: { Authorization: `Bearer ${API_TOKEN}`, ...init.headers },
    });
    if ((res.status === 429 || res.status >= 500) && attempt < MAX_RETRIES) {
      const retryAfter = Number(res.headers.get("Retry-After"));
      await sleep(
        Number.isFinite(retryAfter) && retryAfter > 0
          ? retryAfter * 1000
          : 1000 * 2 ** attempt,
      );
      continue;
    }
    return res;
  }
}

async function listLegacyKeys() {
  const legacy = [];
  let total = 0;
  let cursor = "";
  do {
    const params = new URLSearchParams({ prefix: KEY_PREFIX, limit: "1000" });
    if (cursor) params.set("cursor", cursor);
    const res = await cfFetch(`${NS_BASE}/keys?${params}`);
    const json = await res.json();
    if (!res.ok || !json.success) {
      throw new Error(`List keys failed: ${JSON.stringify(json.errors)}`);
    }
    for (const key of json.result) {
      total++;
      if (key.expiration == null) legacy.push(key.name);
    }
    cursor = json.result_info?.cursor ?? "";
  } while (cursor);
  return { legacy, total };
}

async function readValue(key) {
  const res = await cfFetch(`${NS_BASE}/values/${encodeURIComponent(key)}`);
  if (res.status === 404) return null;
  if (!res.ok) {
    throw new Error(`Read ${key} failed: HTTP ${res.status}`);
  }
  return res.text();
}

async function bulkWrite(pairs) {
  const res = await cfFetch(`${NS_BASE}/bulk`, {
    method: "PUT",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(pairs),
  });
  const json = await res.json();
  if (!res.ok || !json.success) {
    throw new Error(`Bulk write failed: ${JSON.stringify(json.errors)}`);
  }
}

async function main() {
  console.log(`Listing ${KEY_PREFIX}* keys in namespace ${NAMESPACE_ID}…`);
  const { legacy, total } = await listLegacyKeys();
  console.log(`${total} keys total, ${legacy.length} without an expiration.`);

  if (!APPLY) {
    for (const key of legacy.slice(0, 20)) console.log(`  ${key}`);
    if (legacy.length > 20) console.log(`  … and ${legacy.length - 20} more`);
    console.log("Dry run — re-run with --apply to set the 90-day expiry.");
    return;
  }

  let batch = [];
  let batchBytes = 0;
  let written = 0;
  let skipped = 0;

  const flush = async () => {
    if (batch.length === 0) return;
    await bulkWrite(batch);
    written += batch.length;
    console.log(`  wrote ${written}/${legacy.length}`);
    batch = [];
    batchBytes = 0;
  };

  for (let i = 0; i < legacy.length; i += READ_CONCURRENCY) {
    const keys = legacy.slice(i, i + READ_CONCURRENCY);
    const values = await Promise.all(keys.map(readValue));
    for (let j = 0; j < keys.length; j++) {
      const value = values[j];
      if (value === null) {
        skipped++;
        continue;
      }
      const bytes = Buffer.byteLength(value) + keys[j].length + 64;
      if (
        batch.length >= BULK_MAX_PAIRS ||
        (batch.length > 0 && batchBytes + bytes > BULK_MAX_BYTES)
      ) {
        await flush();
      }
      batch.push({ key: keys[j], value, expiration_ttl: TTL_HISTORICAL_KV });
      batchBytes += bytes;
    }
  }
  await flush();

  console.log(
    `Done: ${written} keys now expire in 90 days, ${skipped} vanished mid-run.`,
  );
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
