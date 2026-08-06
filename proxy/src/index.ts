/**
 * f1-replay OpenF1 proxy — Cloudflare Worker
 *
 * Proxies every GET /v1/<endpoint>?<params> to api.openf1.org and caches
 * the JSON response in Cloudflare KV with a TTL that depends on whether the
 * data is from a live session or a historical (immutable) one.
 *
 * Cache TTL strategy
 * ──────────────────
 * Historical data never changes after a session ends, so we cache it for 30
 * days. Live data gets short TTLs so the UI stays current.
 *
 *  Bucket        │ Endpoints                                    │ TTL
 *  ──────────────┼──────────────────────────────────────────────┼──────────
 *  STATIC        │ meetings, sessions, drivers, starting_grid,  │ 30 days
 *                │ championship_drivers, championship_teams      │
 *  RESULT        │ session_result                                │ 30 days
 *  WINDOW (hist) │ location, car_data  (date< is in the past)   │ 30 days
 *  WINDOW (live) │ location, car_data  (date< is recent)        │ 5 s
 *  LIVE FAST     │ position, intervals, laps                     │ 20 s
 *  LIVE SLOW     │ weather, race_control, team_radio,            │ 60 s
 *                │ pit, stints, overtakes                        │
 *
 * Empty [] responses are never cached — data may not be available yet.
 *
 * CORS
 * ────
 * The SPA is served from a different origin (GitHub Pages / localhost), so
 * the worker adds permissive CORS headers on every response.
 */

export interface Env {
  /** KV namespace bound in wrangler.toml as `CACHE`. */
  CACHE: KVNamespace;
  /**
   * Optional OpenF1 bearer token (set with `wrangler secret put OPENF1_API_KEY`).
   * The public API works fine without one; supply a token if you have a paid tier.
   */
  OPENF1_API_KEY?: string;
}

// ── Constants ────────────────────────────────────────────────────────────────

const OPENF1_BASE = "https://api.openf1.org/v1";

const TTL_PERMANENT = 60 * 60 * 24 * 30; // 30 days
const TTL_LIVE_FAST = 20;                 // 20 s  — positions / intervals / laps
const TTL_LIVE_SLOW = 60;                 // 60 s  — weather / radio / control
const TTL_LIVE_WINDOW = 5;               // 5 s   — location / car_data (live session)

// Mirror of src/utils/live.ts: ±30 min buffer around session bounds.
const LIVE_BUFFER_MS = 30 * 60 * 1000;

// Endpoint classification sets — matched against the first path segment.
const STATIC_ENDPOINTS = new Set([
  "meetings",
  "sessions",
  "drivers",
  "starting_grid",
  "championship_drivers",
  "championship_teams",
]);

const RESULT_ENDPOINTS = new Set(["session_result"]);

// These endpoints are always queried with date-window params (date>, date<).
const WINDOW_ENDPOINTS = new Set(["location", "car_data"]);

// High-frequency live feeds.
const LIVE_FAST_ENDPOINTS = new Set(["position", "intervals", "laps"]);

// Everything else (weather, race_control, team_radio, pit, stints, overtakes)
// falls into the LIVE_SLOW bucket.

// ── Helpers ──────────────────────────────────────────────────────────────────

/**
 * A date-window query is historical when its upper bound (`date<`) is more
 * than LIVE_BUFFER_MS in the past — meaning the session it belongs to is over.
 */
function isWindowHistorical(params: URLSearchParams): boolean {
  const upper = params.get("date<");
  if (!upper) return false;
  return Date.parse(upper) < Date.now() - LIVE_BUFFER_MS;
}

function chooseTtl(endpoint: string, params: URLSearchParams): number {
  if (STATIC_ENDPOINTS.has(endpoint) || RESULT_ENDPOINTS.has(endpoint)) {
    return TTL_PERMANENT;
  }
  if (WINDOW_ENDPOINTS.has(endpoint)) {
    return isWindowHistorical(params) ? TTL_PERMANENT : TTL_LIVE_WINDOW;
  }
  if (LIVE_FAST_ENDPOINTS.has(endpoint)) {
    return isWindowHistorical(params) ? TTL_PERMANENT : TTL_LIVE_FAST;
  }
  // LIVE_SLOW bucket
  return isWindowHistorical(params) ? TTL_PERMANENT : TTL_LIVE_SLOW;
}

/**
 * Cache key: full path + query string, prefixed so KV keys are namespaced.
 * Identical requests from different users share the same key.
 */
function makeCacheKey(pathname: string, search: string): string {
  return `openf1:${pathname}${search}`;
}

// ── CORS ─────────────────────────────────────────────────────────────────────

const CORS: Record<string, string> = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Methods": "GET, OPTIONS",
  "Access-Control-Allow-Headers": "Authorization, Content-Type",
  "Access-Control-Max-Age": "86400",
};

function corsHeaders(
  extra: Record<string, string> = {},
): Record<string, string> {
  return { ...CORS, ...extra };
}

function jsonResponse(
  body: string,
  status: number,
  extra: Record<string, string> = {},
): Response {
  return new Response(body, {
    status,
    headers: corsHeaders({
      "Content-Type": "application/json",
      ...extra,
    }),
  });
}

// ── Worker entry point ───────────────────────────────────────────────────────

export default {
  async fetch(request: Request, env: Env): Promise<Response> {
    // Handle CORS preflight.
    if (request.method === "OPTIONS") {
      return new Response(null, { status: 204, headers: corsHeaders() });
    }

    if (request.method !== "GET") {
      return new Response("Method Not Allowed", { status: 405 });
    }

    const url = new URL(request.url);

    // The worker is deployed at the root; the SPA sends requests to /v1/<endpoint>.
    // Strip the /v1 prefix to derive the OpenF1 path segment.
    // e.g. /v1/location?session_key=9158&date>=… → endpoint="location"
    const pathname = url.pathname.replace(/^\/v1\/?/, "") || "";
    const endpoint = pathname.split("/")[0]; // "location", "laps", …

    if (!endpoint) {
      return jsonResponse(
        JSON.stringify({ error: "Missing endpoint" }),
        400,
      );
    }

    const openf1Url = `${OPENF1_BASE}/${pathname}${url.search}`;
    const ttl = chooseTtl(endpoint, url.searchParams);
    const cacheKey = makeCacheKey(`/${pathname}`, url.search);

    // ── KV read ───────────────────────────────────────────────────────────────
    let cached: string | null = null;
    try {
      cached = await env.CACHE.get(cacheKey);
    } catch {
      // KV unavailable — fall through to origin. Don't fail the user's request.
    }

    if (cached !== null) {
      return jsonResponse(cached, 200, {
        "X-Cache": "HIT",
        "Cache-Control": `public, max-age=${ttl}`,
      });
    }

    // ── Origin fetch ──────────────────────────────────────────────────────────
    const originHeaders: HeadersInit = { Accept: "application/json" };
    if (env.OPENF1_API_KEY) {
      (originHeaders as Record<string, string>).Authorization =
        `Bearer ${env.OPENF1_API_KEY}`;
    }

    let originRes: Response;
    try {
      originRes = await fetch(openf1Url, { headers: originHeaders });
    } catch (err) {
      return jsonResponse(
        JSON.stringify({ error: "Origin unreachable", detail: String(err) }),
        502,
      );
    }

    // Pass non-200 responses through without caching them.
    if (!originRes.ok) {
      const body = await originRes.text();
      return new Response(body, {
        status: originRes.status,
        headers: corsHeaders({
          "Content-Type":
            originRes.headers.get("Content-Type") ?? "application/json",
          "X-Cache": "MISS",
        }),
      });
    }

    const body = await originRes.text();

    // ── KV write ──────────────────────────────────────────────────────────────
    // Skip caching empty arrays — live data may not exist yet and we don't want
    // to serve a stale [] to subsequent requests within the TTL window.
    const isEmpty = body.trim() === "[]";
    if (!isEmpty) {
      try {
        await env.CACHE.put(cacheKey, body, { expirationTtl: ttl });
      } catch {
        // Best-effort — a failed KV write must never break the response.
      }
    }

    return jsonResponse(body, 200, {
      "X-Cache": "MISS",
      "Cache-Control": `public, max-age=${ttl}`,
    });
  },
} satisfies ExportedHandler<Env>;
