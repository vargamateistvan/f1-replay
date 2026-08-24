#!/usr/bin/env node
/**
 * Warm the OpenF1 proxy cache (proxy/) for recently-finished sessions.
 *
 * Requests the EXACT canonical URLs the SPA builds (same param order, same
 * encodeURIComponent encoding, same chunk grids aligned to session
 * date_start), so every entry written here is a guaranteed cache hit for
 * real users later.
 *
 * Session discovery goes DIRECTLY to api.openf1.org (the proxy caches
 * meetings/sessions permanently, so its copy may not list the session that
 * just ended). All warming traffic goes through the proxy.
 *
 * Rate limiting: only proxy MISSes (and direct discovery requests) reach
 * OpenF1, which allows 3 req/s and 30 req/min. Origin-bound requests are
 * paced with sliding windows at 2/s and 20/min; cache hits are nearly free
 * and only get a courtesy delay.
 *
 * Environment:
 *   PROXY_BASE       required — e.g. https://proxy.f1replay.app/v1
 *   WARM_SECRET      optional — matches the Worker's WARM_SECRET secret.
 *                    Enables permanent caching of non-window endpoints and
 *                    forced refresh of meetings/sessions lists.
 *   SESSION_KEY      optional — warm one specific session regardless of age.
 *   LOOKBACK_HOURS   optional — how far back to look for ended sessions
 *                    (default 3; pair with the workflow cron interval).
 *   MIN_AGE_MINUTES  optional — wait this long after date_end before warming
 *                    so the proxy classifies date windows as historical and
 *                    OpenF1 has published results (default 40).
 */

const OPENF1_DIRECT = "https://api.openf1.org/v1";

const PROXY_BASE = (process.env.PROXY_BASE ?? "").replace(/\/+$/, "");
const WARM_SECRET = process.env.WARM_SECRET ?? "";
const SESSION_KEY = process.env.SESSION_KEY ?? "";
const LOOKBACK_HOURS = Number(process.env.LOOKBACK_HOURS) || 3;
const MIN_AGE_MINUTES = Number(process.env.MIN_AGE_MINUTES) || 40;

// Mirror src/constants.ts — keep in sync.
const LOCATION_CHUNK_MS = 2 * 60 * 1000; // LOCATION_CHUNK_MS
const CHUNK_MS = 5 * 60 * 1000; // CHUNK_MS (car_data)

// Origin-bound request budget. Deliberately well under OpenF1's 3/s, 30/min:
// the proxy's egress IP is shared with real users' cache misses.
const MAX_ORIGIN_PER_SECOND = 2;
const MAX_ORIGIN_PER_MINUTE = 20;

if (!PROXY_BASE) {
  console.error("PROXY_BASE is required (e.g. https://proxy.f1replay.app/v1)");
  process.exit(1);
}
if (PROXY_BASE.includes("api.openf1.org")) {
  console.error(
    "PROXY_BASE points to api.openf1.org. This workflow must target your proxy/Worker base URL (e.g. https://proxy.f1replay.app/v1).",
  );
  process.exit(1);
}

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

// ── URL construction (mirrors src/api/client.ts fetchEndpoint) ──────────────

function buildQuery(params) {
  return Object.entries(params)
    .map(([k, v]) => `${k}=${encodeURIComponent(String(v))}`)
    .join("&");
}

function canonicalUrl(base, endpoint, params) {
  const qs = buildQuery(params);
  return `${base}/${endpoint}${qs ? `?${qs}` : ""}`;
}

// ── Origin-rate-limited fetch ────────────────────────────────────────────────

const originTimes = []; // timestamps of requests known to have reached OpenF1

function msUntilOriginSlot(now) {
  while (originTimes.length > 0 && originTimes[0] < now - 60_000) {
    originTimes.shift();
  }
  const inLastSecond = originTimes.filter((t) => t > now - 1_000).length;
  let wait = 0;
  if (inLastSecond >= MAX_ORIGIN_PER_SECOND) {
    const oldest = originTimes[originTimes.length - MAX_ORIGIN_PER_SECOND];
    wait = Math.max(wait, oldest + 1_000 - now);
  }
  if (originTimes.length >= MAX_ORIGIN_PER_MINUTE) {
    wait = Math.max(wait, originTimes[0] + 60_000 - now);
  }
  return wait;
}

async function awaitOriginSlot() {
  for (;;) {
    const wait = msUntilOriginSlot(Date.now());
    if (wait <= 0) return;
    await sleep(wait);
  }
}

const stats = {
  hit: 0,
  miss: 0,
  empty: 0,
  noData: 0,
  forbidden: 0,
  unauthorized: 0,
  error: 0,
};

/**
 * Fetch through the proxy. Pessimistically reserves an origin slot before
 * sending (the request may be a MISS); releases it when X-Cache says HIT.
 */
async function warmFetch(url, { refresh = false } = {}) {
  const headers = { Accept: "application/json" };
  if (WARM_SECRET) {
    headers["X-Warm-Secret"] = WARM_SECRET;
    if (refresh) headers["X-Warm-Refresh"] = "1";
  }

  for (let attempt = 1; attempt <= 6; attempt++) {
    await awaitOriginSlot();
    originTimes.push(Date.now());

    let res;
    try {
      res = await fetch(url, { headers });
    } catch (err) {
      console.warn(`  network error (${err.message ?? err}), retrying…`);
      await sleep(5_000);
      continue;
    }

    if (res.status === 429) {
      // Escalate the wait: the per-minute window may still be saturated by
      // other users' cache misses sharing the proxy's egress IP.
      const retryAfter = Number(res.headers.get("Retry-After")) || 0;
      const waitS = Math.max(retryAfter, 15 * attempt);
      console.warn(`  429, waiting ${waitS}s…`);
      await sleep(waitS * 1_000);
      continue;
    }

    const cacheState = res.headers.get("X-Cache") ?? "MISS";
    if (cacheState === "EDGE" || cacheState === "KV") {
      // Served from cache — didn't touch OpenF1, release the slot.
      originTimes.pop();
      stats.hit++;
    } else {
      stats.miss++;
    }

    // OpenF1 returns 404 for date windows past the end of the actual data
    // (e.g. the scheduled slot is longer than the session ran). Not an error.
    if (res.status === 404) {
      stats.noData++;
      return "noData";
    }

    if (!res.ok) {
      if (res.status === 401) stats.unauthorized++;
      if (res.status === 403) stats.forbidden++;
      stats.error++;
      console.warn(`  ${res.status} ${url}`);
      return "error";
    }

    const body = await res.text();
    if (body.trim() === "[]") stats.empty++;
    return "ok";
  }

  stats.error++;
  console.warn(`  giving up on ${url}`);
  return "error";
}

/** Direct OpenF1 request (discovery only) — always counts against the budget. */
async function directFetch(endpoint, params) {
  await awaitOriginSlot();
  originTimes.push(Date.now());
  const url = canonicalUrl(OPENF1_DIRECT, endpoint, params);
  const res = await fetch(url, { headers: { Accept: "application/json" } });
  if (!res.ok) throw new Error(`OpenF1 ${endpoint}: ${res.status}`);
  return res.json();
}

// ── Session discovery ────────────────────────────────────────────────────────

async function findSessionsToWarm() {
  if (SESSION_KEY) {
    const sessions = await directFetch("sessions", { session_key: SESSION_KEY });
    if (sessions.length === 0) {
      console.error(`No session found for session_key=${SESSION_KEY}`);
      process.exit(1);
    }
    return sessions;
  }

  const now = Date.now();
  const year = new Date().getUTCFullYear();
  const sessions = await directFetch("sessions", { year });

  return sessions.filter((s) => {
    const endMs = Date.parse(s.date_end);
    if (Number.isNaN(endMs)) return false;
    const age = now - endMs;
    return (
      age >= MIN_AGE_MINUTES * 60_000 && age <= LOOKBACK_HOURS * 3_600_000
    );
  });
}

// ── Warm plan (mirrors the hooks in src/hooks/) ──────────────────────────────

function sessionUrls(session) {
  const sk = session.session_key;
  const year = session.year;
  const meetingKey = session.meeting_key;
  const startMs = Date.parse(session.date_start);
  const endMs = Date.parse(session.date_end);
  const durationMs = Math.max(0, endMs - startMs);

  const urls = [];
  const push = (endpoint, params, { refresh = false, group = null } = {}) =>
    urls.push({
      url: canonicalUrl(PROXY_BASE, endpoint, params),
      refresh,
      group,
    });

  // Mutable lists — force refresh so mid-season KV copies stay current.
  push("meetings", { year }, { refresh: true });
  push("sessions", { meeting_key: meetingKey }, { refresh: true });
  push("sessions", { year }, { refresh: true });

  // Session-scoped endpoints (useSession.ts hooks, canonical param order).
  push("drivers", { session_key: sk });
  push("laps", { session_key: sk });
  push("position", { session_key: sk });
  push("intervals", { session_key: sk });
  push("pit", { session_key: sk });
  push("stints", { session_key: sk });
  push("race_control", { session_key: sk });
  push("team_radio", { session_key: sk });
  push("weather", { session_key: sk });
  push("session_result", { session_key: sk });
  push("starting_grid", { session_key: sk });
  push("overtakes", { session_key: sk });
  push("championship_drivers", { session_key: sk });
  push("championship_teams", { session_key: sk });

  // Location chunks — 2-min grid aligned to date_start (useLocationChunks).
  const lastLocationChunk = Math.floor(durationMs / LOCATION_CHUNK_MS);
  for (let idx = 0; idx <= lastLocationChunk; idx++) {
    push(
      "location",
      {
        session_key: sk,
        "date>": new Date(startMs + idx * LOCATION_CHUNK_MS).toISOString(),
        "date<": new Date(
          startMs + (idx + 1) * LOCATION_CHUNK_MS,
        ).toISOString(),
      },
      { group: "location" },
    );
  }

  // All-driver car_data chunks — 5-min grid (useAllCarDataWindow).
  const lastCarChunk = Math.floor(durationMs / CHUNK_MS);
  for (let idx = 0; idx <= lastCarChunk; idx++) {
    push(
      "car_data",
      {
        session_key: sk,
        "date>": new Date(startMs + idx * CHUNK_MS).toISOString(),
        "date<": new Date(startMs + (idx + 1) * CHUNK_MS).toISOString(),
      },
      { group: "car_data" },
    );
  }

  return urls;
}

// ── Main ─────────────────────────────────────────────────────────────────────

const sessions = await findSessionsToWarm();

if (sessions.length === 0) {
  console.log(
    `No sessions ended in the last ${LOOKBACK_HOURS} h (min age ${MIN_AGE_MINUTES} min). Nothing to warm.`,
  );
  process.exit(0);
}

for (const session of sessions) {
  const urls = sessionUrls(session);
  console.log(
    `Warming ${session.session_name} @ ${session.circuit_short_name} ` +
      `(session_key=${session.session_key}, ${urls.length} URLs)…`,
  );

  // Chunk groups are chronological; once a group hits consecutive no-data
  // 404s the session data has ended (scheduled slot longer than the actual
  // running) — skip the rest of that group instead of probing every window.
  const consecutiveNoData = new Map();
  let skipped = 0;

  for (const { url, refresh, group } of urls) {
    if (group && (consecutiveNoData.get(group) ?? 0) >= 2) {
      skipped++;
      continue;
    }
    const outcome = await warmFetch(url, { refresh });
    if (group) {
      consecutiveNoData.set(
        group,
        outcome === "noData" ? (consecutiveNoData.get(group) ?? 0) + 1 : 0,
      );
    }
  }

  if (skipped > 0) {
    console.log(`  skipped ${skipped} windows past the end of session data`);
  }
}

console.log(
  `Done. cache hits: ${stats.hit}, misses (warmed): ${stats.miss}, ` +
    `empty: ${stats.empty}, no-data windows: ${stats.noData}, ` +
    `403: ${stats.forbidden}, 401: ${stats.unauthorized}, errors: ${stats.error}`,
);

if (stats.error > 0 && stats.hit === 0 && stats.forbidden > 0) {
  console.error(
    "All requests were forbidden. Check that PROXY_BASE points to your proxy (not api.openf1.org) and verify the Worker's OPENF1_API_KEY secret is valid or unset.",
  );
}

// Empty/no-data responses are never cached by the proxy, so a fully-warmed
// session still reports them as misses on re-runs — expected and harmless.
process.exit(stats.error > 0 ? 1 : 0);
