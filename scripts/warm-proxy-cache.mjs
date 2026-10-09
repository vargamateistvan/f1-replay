#!/usr/bin/env node
import { appendFileSync } from "node:fs";

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
 *                    (default 52). Sessions in this window have their
 *                    mutable data (results, championship, laps, pit…)
 *                    re-fetched on every run; the proxy only rewrites a
 *                    cache entry when OpenF1's data actually changed.
 *   MIN_AGE_MINUTES  optional — wait this long after date_end before warming
 *                    so the proxy classifies date windows as historical and
 *                    OpenF1 has published results (default 40).
 *   RESULTS_BACKFILL optional — "0" disables the season results backfill.
 *   WARM_LOG_REQUESTS
 *                    optional — "0" hides the per-request log lines (cache
 *                    state, status, size, latency, refresh outcome). Session
 *                    and season sections are always logged, collapsed into
 *                    groups when running in GitHub Actions.
 *   RESULTS_BACKFILL_FROM_YEAR
 *                    optional — first season to backfill (default 2023, the
 *                    start of OpenF1 coverage).
 *
 * Results backfill: the Standings page requests session_result for every
 * finished Race/Sprint (and main Qualifying for the teammate comparison) of a
 * season, plus championship_drivers/teams for the selected Race/Sprint. The
 * proxy keeps those forever, so every run tops up any that are missing;
 * already-cached ones are cheap hits that don't touch OpenF1.
 */

const OPENF1_DIRECT = "https://api.openf1.org/v1";

const PROXY_BASE = (process.env.PROXY_BASE ?? "").replace(/\/+$/, "");
const WARM_SECRET = process.env.WARM_SECRET ?? "";
const SESSION_KEY = process.env.SESSION_KEY ?? "";
const LOOKBACK_HOURS = Number(process.env.LOOKBACK_HOURS) || 52;
const MIN_AGE_MINUTES = Number(process.env.MIN_AGE_MINUTES) || 40;
const GITHUB_STEP_SUMMARY = process.env.GITHUB_STEP_SUMMARY ?? "";
const RESULTS_BACKFILL = process.env.RESULTS_BACKFILL !== "0";
const RESULTS_BACKFILL_FROM_YEAR =
  Number(process.env.RESULTS_BACKFILL_FROM_YEAR) || 2023;
const LOG_REQUESTS = process.env.WARM_LOG_REQUESTS !== "0";
const IN_GHA = process.env.GITHUB_ACTIONS === "true";
const RUN_STARTED_MS = Date.now();

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

// ── Logging helpers ──────────────────────────────────────────────────────────

/** Collapsible log section in GitHub Actions; plain header elsewhere. */
function startGroup(title) {
  console.log(IN_GHA ? `::group::${title}` : `\n── ${title} ──`);
}

function endGroup() {
  if (IN_GHA) console.log("::endgroup::");
}

function escapeAnnotation(text) {
  return String(text)
    .replace(/%/g, "%25")
    .replace(/\r/g, "%0D")
    .replace(/\n/g, "%0A");
}

function annotate(level, message) {
  if (IN_GHA) console.log(`::${level}::${escapeAnnotation(message)}`);
}

function formatBytes(n) {
  if (n < 1024) return `${n} B`;
  if (n < 1024 * 1024) return `${(n / 1024).toFixed(1)} KB`;
  return `${(n / 1024 / 1024).toFixed(2)} MB`;
}

function formatDuration(ms) {
  if (ms < 1_000) return `${Math.round(ms)}ms`;
  const s = ms / 1_000;
  if (s < 60) return `${s.toFixed(1)}s`;
  return `${Math.floor(s / 60)}m ${Math.round(s % 60)}s`;
}

function formatAge(ms) {
  const h = Math.floor(ms / 3_600_000);
  const m = Math.round((ms % 3_600_000) / 60_000);
  return h > 0 ? `${h}h ${m}m` : `${m}m`;
}

/** URL relative to the proxy base, decoded for readable log lines. */
function shortUrl(url) {
  const rel = url.startsWith(PROXY_BASE) ? url.slice(PROXY_BASE.length) : url;
  try {
    return decodeURIComponent(rel);
  } catch {
    return rel;
  }
}

// Entries whose data changed on refresh, and every failed request — listed
// in the step summary so they're visible without digging through the log.
const updatedEntries = [];
const failedEntries = [];
let throttledMs = 0;
let bytesReceived = 0;

function writeGithubSummary(lines) {
  if (!GITHUB_STEP_SUMMARY) return;
  try {
    appendFileSync(GITHUB_STEP_SUMMARY, `${lines.join("\n")}\n`, "utf8");
  } catch (err) {
    console.warn(
      `Could not write GitHub summary: ${err instanceof Error ? err.message : String(err)}`,
    );
  }
}

function snapshotStats() {
  return { ...stats };
}

function diffStats(before, after) {
  return {
    hit: after.hit - before.hit,
    miss: after.miss - before.miss,
    noData: after.noData - before.noData,
    empty: after.empty - before.empty,
    forbidden: after.forbidden - before.forbidden,
    unauthorized: after.unauthorized - before.unauthorized,
    error: after.error - before.error,
    updated: after.updated - before.updated,
    unchanged: after.unchanged - before.unchanged,
  };
}

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
    throttledMs += wait;
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
  // Forced refreshes, split by whether the proxy rewrote its cached copy.
  updated: 0,
  unchanged: 0,
};
let firstForbiddenDetail = null;

/**
 * Fetch through the proxy. Pessimistically reserves an origin slot before
 * sending (the request may be a MISS); releases it when X-Cache says HIT.
 */
async function warmFetch(
  url,
  { refresh = false, onBody = null, context = "" } = {},
) {
  const headers = { Accept: "application/json" };
  const sendsRefresh = Boolean(WARM_SECRET) && refresh;
  if (WARM_SECRET) {
    headers["X-Warm-Secret"] = WARM_SECRET;
    if (sendsRefresh) headers["X-Warm-Refresh"] = "1";
  }
  const path = shortUrl(url);

  const logLine = (cacheState, status, bytes, ms, note = "") => {
    if (!LOG_REQUESTS) return;
    const tag = sendsRefresh ? "REFRESH" : "WARM";
    console.log(
      `  ${tag.padEnd(7)} ${cacheState.padEnd(5)} ${String(status).padEnd(3)} ` +
        `${formatBytes(bytes).padStart(9)} ${formatDuration(ms).padStart(7)}  ` +
        `${path}${note ? `  ${note}` : ""}`,
    );
  };

  const fail = (reason) => {
    stats.error++;
    failedEntries.push({ context, path, reason });
    annotate("warning", `Warm failed (${reason}): ${path}`);
  };

  for (let attempt = 1; attempt <= 6; attempt++) {
    await awaitOriginSlot();
    originTimes.push(Date.now());

    const started = Date.now();
    let res;
    try {
      res = await fetch(url, { headers });
    } catch (err) {
      console.warn(
        `  network error on ${path} (attempt ${attempt}/6: ${err.message ?? err}), retrying in 5s…`,
      );
      await sleep(5_000);
      continue;
    }

    if (res.status === 429) {
      // Escalate the wait: the per-minute window may still be saturated by
      // other users' cache misses sharing the proxy's egress IP.
      const retryAfter = Number(res.headers.get("Retry-After")) || 0;
      const waitS = Math.max(retryAfter, 15 * attempt);
      console.warn(
        `  429 on ${path} (attempt ${attempt}/6, Retry-After=${retryAfter || "n/a"}), waiting ${waitS}s…`,
      );
      throttledMs += waitS * 1_000;
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

    const warmUpdated = res.headers.get("X-Warm-Updated");
    let refreshNote = "";
    if (warmUpdated === "1") {
      stats.updated++;
      refreshNote = "→ data changed, cache updated";
      updatedEntries.push({ context, path });
      annotate("notice", `Cache updated (data changed): ${path}`);
    } else if (warmUpdated === "0") {
      stats.unchanged++;
      refreshNote = "→ unchanged";
    }

    // OpenF1 returns 404 for date windows past the end of the actual data
    // (e.g. the scheduled slot is longer than the session ran). Not an error.
    if (res.status === 404) {
      stats.noData++;
      await res.body?.cancel();
      logLine(cacheState, 404, 0, Date.now() - started, "→ no data");
      return "noData";
    }

    if (!res.ok) {
      if (res.status === 401) stats.unauthorized++;
      const text = await res.text();
      if (res.status === 403) {
        stats.forbidden++;
        if (firstForbiddenDetail === null) {
          const contentType = res.headers.get("Content-Type") ?? "";
          const detail =
            contentType.includes("application/json") && text.trim().startsWith("{")
              ? (() => {
                  try {
                    const parsed = JSON.parse(text);
                    return JSON.stringify(parsed);
                  } catch {
                    return text;
                  }
                })()
              : text;
          firstForbiddenDetail = detail.slice(0, 500);
          console.error(`First 403 detail: ${firstForbiddenDetail}`);
        }
      }
      logLine(cacheState, res.status, Buffer.byteLength(text), Date.now() - started, "→ ERROR");
      console.warn(`    body: ${text.slice(0, 200).replace(/\s+/g, " ")}`);
      fail(`HTTP ${res.status}`);
      return "error";
    }

    const body = await res.text();
    const size = Buffer.byteLength(body);
    bytesReceived += size;
    const isEmpty = body.trim() === "[]";
    if (isEmpty) stats.empty++;
    else if (onBody) onBody(body);
    logLine(
      cacheState,
      res.status,
      size,
      Date.now() - started,
      isEmpty ? "→ empty (not cached)" : refreshNote,
    );
    return "ok";
  }

  console.warn(`  giving up on ${path} after 6 attempts`);
  fail("retries exhausted");
  return "error";
}

/** Direct OpenF1 request (discovery only) — always counts against the budget. */
async function directFetch(endpoint, params) {
  await awaitOriginSlot();
  originTimes.push(Date.now());
  const url = canonicalUrl(OPENF1_DIRECT, endpoint, params);
  const started = Date.now();
  const res = await fetch(url, { headers: { Accept: "application/json" } });
  const text = await res.text();
  console.log(
    `  DIRECT  ${String(res.status).padEnd(3)} ${formatBytes(Buffer.byteLength(text)).padStart(9)} ` +
      `${formatDuration(Date.now() - started).padStart(7)}  ${url}`,
  );
  if (!res.ok) {
    const detail = text.slice(0, 300).replace(/\s+/g, " ");
    annotate("error", `OpenF1 discovery ${endpoint} failed: HTTP ${res.status} ${detail}`);
    throw new Error(`OpenF1 ${endpoint}: ${res.status} ${detail}`);
  }
  return JSON.parse(text);
}

// ── Session discovery ────────────────────────────────────────────────────────

async function findSessionsToWarm() {
  if (SESSION_KEY) {
    const sessions = await directFetch("sessions", { session_key: SESSION_KEY });
    if (sessions.length === 0) {
      console.error(`No session found for session_key=${SESSION_KEY}`);
      process.exit(1);
    }
    console.log(`Manual run: warming session_key=${SESSION_KEY} (discovery skipped).`);
    return sessions;
  }

  const now = Date.now();
  const year = new Date().getUTCFullYear();
  const sessions = await directFetch("sessions", { year });

  const selected = sessions.filter((s) => {
    const endMs = Date.parse(s.date_end);
    if (Number.isNaN(endMs)) return false;
    const age = now - endMs;
    return (
      age >= MIN_AGE_MINUTES * 60_000 && age <= LOOKBACK_HOURS * 3_600_000
    );
  });

  // Show what's around the window so it's obvious why a session was or
  // wasn't picked: everything that ended in the last 7 days or starts soon.
  startGroup(
    `Session discovery — ${sessions.length} sessions in ${year}, ${selected.length} selected`,
  );
  const nearby = sessions
    .map((s) => ({ s, endMs: Date.parse(s.date_end) }))
    .filter(
      ({ endMs }) =>
        Number.isFinite(endMs) &&
        endMs >= now - 7 * 86_400_000 &&
        endMs <= now + 7 * 86_400_000,
    )
    .sort((a, b) => a.endMs - b.endMs);
  if (nearby.length === 0) {
    console.log("  No sessions ended in the last 7 days or end in the next 7 days.");
  }
  for (const { s, endMs } of nearby) {
    const age = now - endMs;
    let status;
    if (age < 0) status = `upcoming/live (ends in ${formatAge(-age)})`;
    else if (age < MIN_AGE_MINUTES * 60_000)
      status = `too recent (ended ${formatAge(age)} ago, min ${MIN_AGE_MINUTES}m)`;
    else if (age <= LOOKBACK_HOURS * 3_600_000)
      status = `SELECTED (ended ${formatAge(age)} ago)`;
    else status = `outside lookback (ended ${formatAge(age)} ago)`;
    console.log(
      `  ${String(s.session_key).padEnd(6)} ${`${s.session_name} @ ${s.circuit_short_name}`.padEnd(36)} ` +
        `end ${s.date_end}  ${status}`,
    );
  }
  endGroup();

  return selected;
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
  // Endpoints OpenF1 may correct or complete after the chequered flag
  // (results, penalties, late-published grid/overtakes/radio…) are refreshed
  // on every run inside the lookback window; the proxy only rewrites its
  // copy when the data changed. Large high-frequency feeds (position,
  // intervals, weather, location/car_data) are not revised, so they are
  // only warmed once.
  push("drivers", { session_key: sk }, { refresh: true });
  push("laps", { session_key: sk }, { refresh: true });
  push("position", { session_key: sk });
  push("intervals", { session_key: sk });
  push("pit", { session_key: sk }, { refresh: true });
  push("stints", { session_key: sk }, { refresh: true });
  push("race_control", { session_key: sk }, { refresh: true });
  push("team_radio", { session_key: sk }, { refresh: true });
  push("weather", { session_key: sk });
  push("session_result", { session_key: sk }, { refresh: true });
  push("starting_grid", { session_key: sk }, { refresh: true });
  push("overtakes", { session_key: sk }, { refresh: true });
  push("championship_drivers", { session_key: sk }, { refresh: true });
  push("championship_teams", { session_key: sk }, { refresh: true });

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

// ── Season results backfill (mirrors src/hooks/useStandings.ts) ─────────────

function isSprintName(name) {
  return /(^|\s)sprint(\s|$)/i.test(name ?? "") && !/qualifying/i.test(name ?? "");
}

function isPointsSession(s) {
  return (
    s.session_type === "Race" ||
    s.session_type === "Sprint" ||
    isSprintName(s.session_name)
  );
}

function isStandingsResultSession(s) {
  if (s.is_cancelled) return false;
  const isMainQualifying =
    s.session_type === "Qualifying" &&
    !/sprint|shootout/i.test(s.session_name ?? "");
  return isPointsSession(s) || isMainQualifying;
}

// URLs the Standings page needs for one finished session. Championship
// snapshots only exist for Races/Sprints (other sessions 404).
function standingsUrls(s) {
  const params = { session_key: s.session_key };
  const urls = [canonicalUrl(PROXY_BASE, "session_result", params)];
  if (isPointsSession(s)) {
    urls.push(canonicalUrl(PROXY_BASE, "championship_drivers", params));
    urls.push(canonicalUrl(PROXY_BASE, "championship_teams", params));
  }
  return urls;
}

async function backfillSeasonResults(alreadyWarmed) {
  const now = Date.now();
  const currentYear = new Date().getUTCFullYear();
  const totals = diffStats(stats, stats);
  const perYear = [];
  let requested = 0;

  for (let year = currentYear; year >= RESULTS_BACKFILL_FROM_YEAR; year--) {
    const yearStarted = Date.now();
    startGroup(`Results backfill ${year}`);

    let seasonSessions = [];
    await warmFetch(canonicalUrl(PROXY_BASE, "sessions", { year }), {
      context: `backfill ${year}`,
      onBody: (body) => {
        try {
          seasonSessions = JSON.parse(body);
        } catch {
          seasonSessions = [];
        }
      },
    });

    const due = seasonSessions.filter((s) => {
      const endMs = Date.parse(s.date_end);
      return (
        isStandingsResultSession(s) &&
        !alreadyWarmed.has(s.session_key) &&
        Number.isFinite(endMs) &&
        now - endMs >= MIN_AGE_MINUTES * 60_000
      );
    });

    const urls = due.flatMap(standingsUrls);
    console.log(
      `  ${seasonSessions.length} sessions listed, ${due.length} finished Race/Sprint/Qualifying → ${urls.length} results/championship URLs`,
    );
    const before = snapshotStats();
    for (const url of urls) {
      await warmFetch(url, { context: `backfill ${year}` });
      requested++;
    }
    const delta = diffStats(before, stats);
    for (const key of Object.keys(totals)) totals[key] += delta[key];
    const elapsedMs = Date.now() - yearStarted;
    console.log(
      `  ${year}: ${urls.length} URLs — ${delta.hit} cached, ${delta.miss} fetched from OpenF1, ` +
        `${delta.noData} no-data, ${delta.error} errors in ${formatDuration(elapsedMs)}`,
    );
    endGroup();
    perYear.push({
      year,
      sessions: due.length,
      urls: urls.length,
      stats: delta,
      elapsedMs,
    });
  }

  return { requested, stats: totals, perYear };
}

// ── Main ─────────────────────────────────────────────────────────────────────

startGroup("Run configuration");
console.log(`  Proxy base:        ${PROXY_BASE}`);
console.log(
  `  Warm secret:       ${WARM_SECRET ? "set (permanent caching + refresh enabled)" : "NOT set (refreshes disabled, short TTLs for non-window endpoints)"}`,
);
console.log(`  Session key:       ${SESSION_KEY || "(auto-discover)"}`);
console.log(`  Lookback:          ${LOOKBACK_HOURS} h`);
console.log(`  Min age:           ${MIN_AGE_MINUTES} min`);
console.log(
  `  Results backfill:  ${RESULTS_BACKFILL ? `on, from ${RESULTS_BACKFILL_FROM_YEAR}` : "off"}`,
);
console.log(
  `  Origin budget:     ${MAX_ORIGIN_PER_SECOND}/s, ${MAX_ORIGIN_PER_MINUTE}/min`,
);
console.log(`  Per-request logs:  ${LOG_REQUESTS ? "on" : "off (WARM_LOG_REQUESTS=0)"}`);
console.log(`  Started:           ${new Date(RUN_STARTED_MS).toISOString()}`);
endGroup();

if (!WARM_SECRET) {
  annotate(
    "warning",
    "WARM_SECRET is not set — recent session data cannot be refreshed and non-window endpoints only get short TTLs.",
  );
}

const sessions = await findSessionsToWarm();

if (sessions.length === 0) {
  console.log(
    `No sessions ended in the last ${LOOKBACK_HOURS} h (min age ${MIN_AGE_MINUTES} min).`,
  );
}

const perSession = [];

for (const session of sessions) {
  const urls = sessionUrls(session);
  const before = snapshotStats();
  const sessionStarted = Date.now();
  const context = `${session.session_name} @ ${session.circuit_short_name}`;
  const refreshCount = urls.filter((u) => u.refresh).length;
  startGroup(
    `Warming ${context} (session_key=${session.session_key}, ${urls.length} URLs, ${refreshCount} refreshed)`,
  );
  console.log(
    `  ${session.date_start} → ${session.date_end}, ended ${formatAge(Date.now() - Date.parse(session.date_end))} ago`,
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
    const outcome = await warmFetch(url, { refresh, context });
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

  const delta = diffStats(before, stats);
  const elapsedMs = Date.now() - sessionStarted;
  console.log(
    `  Done in ${formatDuration(elapsedMs)}: ${delta.hit} cached, ${delta.miss} fetched, ` +
      `${delta.updated} updated, ${delta.unchanged} unchanged, ${delta.noData} no-data, ${delta.error} errors`,
  );
  endGroup();

  perSession.push({
    key: session.session_key,
    name: session.session_name,
    circuit: session.circuit_short_name,
    urls: urls.length,
    skipped,
    stats: delta,
    elapsedMs,
  });
}

const backfill = RESULTS_BACKFILL
  ? await backfillSeasonResults(new Set(sessions.map((s) => s.session_key)))
  : null;

if (backfill) {
  console.log(
    `Results backfill: ${backfill.requested} requested, ` +
      `${backfill.stats.hit} already cached, ${backfill.stats.miss} warmed.`,
  );
}

const totalElapsedMs = Date.now() - RUN_STARTED_MS;

console.log(
  `Done in ${formatDuration(totalElapsedMs)}. cache hits: ${stats.hit}, misses (warmed): ${stats.miss}, ` +
    `refreshed: ${stats.updated} updated / ${stats.unchanged} unchanged, ` +
    `empty: ${stats.empty}, no-data windows: ${stats.noData}, ` +
    `403: ${stats.forbidden}, 401: ${stats.unauthorized}, errors: ${stats.error}, ` +
    `received: ${formatBytes(bytesReceived)}, rate-limit waits: ${formatDuration(throttledMs)}`,
);

if (updatedEntries.length > 0) {
  console.log(`Entries whose data changed (${updatedEntries.length}):`);
  for (const e of updatedEntries) console.log(`  [${e.context}] ${e.path}`);
}
if (failedEntries.length > 0) {
  console.log(`Failed requests (${failedEntries.length}):`);
  for (const e of failedEntries) {
    console.log(`  [${e.context}] ${e.reason} ${e.path}`);
  }
}

if (stats.error > 0 && stats.hit === 0 && stats.forbidden > 0) {
  console.error(
    "All requests were forbidden. Check that PROXY_BASE points to your proxy (not api.openf1.org) and verify the Worker's OPENF1_API_KEY secret is valid or unset.",
  );
}

writeGithubSummary([
  "## Warm Proxy Cache",
  "",
  `- Proxy base: \`${PROXY_BASE}\``,
  `- Warm secret: ${WARM_SECRET ? "set" : "**not set** (refreshes disabled)"}`,
  `- Duration: \`${formatDuration(totalElapsedMs)}\` (rate-limit waits \`${formatDuration(throttledMs)}\`), received \`${formatBytes(bytesReceived)}\``,
  `- Sessions warmed: \`${sessions.length}\` (lookback ${LOOKBACK_HOURS} h, min age ${MIN_AGE_MINUTES} min)`,
  ...(backfill
    ? [
        `- Results backfill: \`${backfill.requested}\` requested, \`${backfill.stats.hit}\` already cached, \`${backfill.stats.miss}\` warmed, \`${backfill.stats.error}\` errors`,
      ]
    : []),
  `- Cache hits: \`${stats.hit}\``,
  `- Misses (warmed): \`${stats.miss}\``,
  `- Refreshed entries: \`${stats.updated}\` updated (data changed), \`${stats.unchanged}\` unchanged`,
  `- No-data windows: \`${stats.noData}\``,
  `- Empty responses: \`${stats.empty}\``,
  `- 403 responses: \`${stats.forbidden}\``,
  `- 401 responses: \`${stats.unauthorized}\``,
  `- Errors: \`${stats.error}\``,
  "",
  "### Per-session breakdown",
  "",
  ...(perSession.length === 0
    ? ["_No sessions in the lookback window._"]
    : [
        "| Session key | Session | Circuit | URLs | Hits | Misses | Updated | Unchanged | No-data | 403 | 401 | Errors | Skipped windows | Duration |",
        "|---:|---|---|---:|---:|---:|---:|---:|---:|---:|---:|---:|---:|---:|",
        ...perSession.map(
          (s) =>
            `| ${s.key} | ${s.name} | ${s.circuit} | ${s.urls} | ${s.stats.hit} | ${s.stats.miss} | ${s.stats.updated} | ${s.stats.unchanged} | ${s.stats.noData} | ${s.stats.forbidden} | ${s.stats.unauthorized} | ${s.stats.error} | ${s.skipped} | ${formatDuration(s.elapsedMs)} |`,
        ),
      ]),
  ...(backfill
    ? [
        "",
        "### Results backfill by season",
        "",
        "| Season | Sessions | URLs | Cached | Fetched | No-data | Errors | Duration |",
        "|---:|---:|---:|---:|---:|---:|---:|---:|",
        ...backfill.perYear.map(
          (y) =>
            `| ${y.year} | ${y.sessions} | ${y.urls} | ${y.stats.hit} | ${y.stats.miss} | ${y.stats.noData} | ${y.stats.error} | ${formatDuration(y.elapsedMs)} |`,
        ),
      ]
    : []),
  ...(updatedEntries.length > 0
    ? [
        "",
        `### Cache entries updated (data changed) — ${updatedEntries.length}`,
        "",
        "| Context | URL |",
        "|---|---|",
        ...updatedEntries.map((e) => `| ${e.context} | \`${e.path}\` |`),
      ]
    : []),
  ...(failedEntries.length > 0
    ? [
        "",
        `### Failed requests — ${failedEntries.length}`,
        "",
        "| Context | Reason | URL |",
        "|---|---|---|",
        ...failedEntries.map(
          (e) => `| ${e.context} | ${e.reason} | \`${e.path}\` |`,
        ),
      ]
    : []),
  ...(firstForbiddenDetail
    ? [
        "",
        "### First 403 detail",
        "",
        "```text",
        firstForbiddenDetail,
        "```",
      ]
    : []),
]);

// Empty/no-data responses are never cached by the proxy, so a fully-warmed
// session still reports them as misses on re-runs — expected and harmless.
process.exit(stats.error > 0 ? 1 : 0);
