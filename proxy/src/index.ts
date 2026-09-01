/**
 * f1-replay OpenF1 proxy — Cloudflare Worker
 *
 * Cache hierarchy:
 *
 *   Browser
 *      ↓
 *   Cloudflare Cache API  ← fastest
 *      ↓ MISS
 *   Cloudflare KV          ← persistent/shared cache
 *      ↓ MISS
 *   OpenF1 API
 *
 * Cache TTL strategy
 * ──────────────────
 * STATIC / RESULT     → permanent in KV, 30-day browser cache
 * Historical data     → permanent in KV, 30-day browser cache
 * Live location/data  → 5 s
 * Live position/laps  → 20 s
 * Other live data     → 60 s
 *
 * Empty [] responses are never cached.
 *
 * Cache warming
 * ─────────────
 * The warm-cache GitHub workflow (scripts/warm-proxy-cache.mjs) replays every
 * canonical app URL after a session ends. Requests carrying a valid
 * `X-Warm-Secret` header are cached permanently, and `X-Warm-Refresh: 1`
 * additionally bypasses the cache read to re-fetch mutable lists
 * (meetings/sessions) from OpenF1.
 *
 * CORS
 * ────
 * The SPA is served from a different origin, so the worker adds
 * permissive CORS headers to every response.
 */

export interface Env {
  CACHE: KVNamespace;

  /**
   * Optional OpenF1 bearer token.
   *
   * Set with:
   *   wrangler secret put OPENF1_API_KEY
   */
  OPENF1_API_KEY?: string;

  /**
   * Optional shared secret for cache-warming requests.
   *
   * When set, requests carrying a matching `X-Warm-Secret` header are cached
   * permanently regardless of endpoint classification. This lets the
   * warm-cache GitHub workflow persist non-window endpoints (laps, position,
   * intervals, weather…) for finished sessions — those endpoints carry no
   * `date<` param, so chooseTtl cannot tell they are historical and would
   * otherwise only cache them for 20–60 s.
   *
   * Set with:
   *   wrangler secret put WARM_SECRET
   */
  WARM_SECRET?: string;
}

// ── Constants ────────────────────────────────────────────────────────────────

const OPENF1_BASE = "https://api.openf1.org/v1";

const TTL_PERMANENT = 60 * 60 * 24 * 30; // 30-day browser cache TTL.
// Historical / static KV entries are intentionally written without an
// expiration so they remain available until we delete them explicitly.
const TTL_LIVE_FAST = 20; // position / intervals / laps
const TTL_LIVE_SLOW = 60; // weather / radio / race control
const TTL_LIVE_WINDOW = 5; // location / car_data

// ±30 min buffer around session bounds.
const LIVE_BUFFER_MS = 30 * 60 * 1000;

// ── In-flight request deduplication ──────────────────────────────────────────
//
// Prevents multiple simultaneous requests in the SAME Worker isolate from
// hitting OpenF1 when the cache is empty.
//
// This is intentionally only an optimization. Cloudflare Workers are
// distributed, so requests handled by different isolates can still race.
//
// KV + Cache API provide the actual cross-request caching.

const inFlightRequests = new Map<string, Promise<Response>>();

// ── Endpoint classification ─────────────────────────────────────────────────

const STATIC_ENDPOINTS = new Set([
  "meetings",
  "sessions",
  "drivers",
  "starting_grid",
]);

const CURRENT_SEASON_MUTABLE_ENDPOINTS = new Set([
  "championship_drivers",
  "championship_teams",
]);

const RESULT_ENDPOINTS = new Set(["session_result"]);

const WINDOW_ENDPOINTS = new Set(["location", "car_data"]);

const LIVE_FAST_ENDPOINTS = new Set(["position", "intervals", "laps"]);

// Everything else falls into LIVE_SLOW.

// ── Helpers ──────────────────────────────────────────────────────────────────

/**
 * Determines whether a date-window query is historical.
 *
 * If date< is more than 30 minutes in the past, consider the data immutable.
 */
function isWindowHistorical(params: URLSearchParams): boolean {
  const upper = params.get("date<");

  if (!upper) {
    return false;
  }

  const timestamp = Date.parse(upper);

  if (Number.isNaN(timestamp)) {
    return false;
  }

  return timestamp < Date.now() - LIVE_BUFFER_MS;
}

/**
 * Determines the cache TTL for an endpoint.
 */
function chooseTtl(endpoint: string, params: URLSearchParams): number {
  if (CURRENT_SEASON_MUTABLE_ENDPOINTS.has(endpoint)) {
    return TTL_LIVE_SLOW;
  }

  if (STATIC_ENDPOINTS.has(endpoint) || RESULT_ENDPOINTS.has(endpoint)) {
    return TTL_PERMANENT;
  }

  if (WINDOW_ENDPOINTS.has(endpoint)) {
    return isWindowHistorical(params) ? TTL_PERMANENT : TTL_LIVE_WINDOW;
  }

  if (LIVE_FAST_ENDPOINTS.has(endpoint)) {
    return isWindowHistorical(params) ? TTL_PERMANENT : TTL_LIVE_FAST;
  }

  // LIVE_SLOW bucket.
  return isWindowHistorical(params) ? TTL_PERMANENT : TTL_LIVE_SLOW;
}

/**
 * Normalize query parameters so equivalent URLs share the same KV key.
 *
 * Example:
 *
 * ?session_key=9158&driver_number=1
 *
 * and
 *
 * ?driver_number=1&session_key=9158
 *
 * produce the same KV key.
 */
function normalizeSearchParams(searchParams: URLSearchParams): string {
  const normalized = new URLSearchParams(searchParams);

  normalized.sort();

  const query = normalized.toString();

  return query ? `?${query}` : "";
}

/**
 * Creates a KV cache key.
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
  return {
    ...CORS,
    ...extra,
  };
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

// ── OpenF1 ───────────────────────────────────────────────────────────────────

async function fetchFromOpenF1(openf1Url: string, env: Env): Promise<Response> {
  const originHeaders: HeadersInit = {
    Accept: "application/json",
  };

  if (env.OPENF1_API_KEY) {
    (originHeaders as Record<string, string>).Authorization =
      `Bearer ${env.OPENF1_API_KEY}`;
  }

  return fetch(openf1Url, {
    headers: originHeaders,
  });
}

// ── Worker ───────────────────────────────────────────────────────────────────

export default {
  async fetch(request: Request, env: Env): Promise<Response> {
    // ── CORS preflight ───────────────────────────────────────────────────────

    if (request.method === "OPTIONS") {
      return new Response(null, {
        status: 204,
        headers: corsHeaders(),
      });
    }

    // Only GET is supported.
    if (request.method !== "GET") {
      return new Response("Method Not Allowed", {
        status: 405,
        headers: corsHeaders(),
      });
    }

    const url = new URL(request.url);

    // ── Parse endpoint ───────────────────────────────────────────────────────

    const pathname = url.pathname.replace(/^\/v1\/?/, "") || "";

    const endpoint = pathname.split("/")[0];

    if (!endpoint) {
      return jsonResponse(
        JSON.stringify({
          error: "Missing endpoint",
        }),
        400,
      );
    }

    // ── Determine TTL ─────────────────────────────────────────────────────────

    // Authenticated warm requests (cache-warming workflow) force permanent
    // caching: they only run after a session has finished, so every response
    // is immutable even when the URL alone doesn't prove it.
    const isWarmRequest =
      env.WARM_SECRET !== undefined &&
      env.WARM_SECRET !== "" &&
      request.headers.get("X-Warm-Secret") === env.WARM_SECRET;

    const ttl = isWarmRequest
      ? TTL_PERMANENT
      : chooseTtl(endpoint, url.searchParams);

    // Authenticated warm requests can additionally force a refetch from
    // OpenF1 with `X-Warm-Refresh: 1`. This is how the warm workflow keeps
    // permanently-cached-but-mutable lists (meetings/sessions for the current
    // year) up to date after every session.
    const isWarmRefresh =
      isWarmRequest && request.headers.get("X-Warm-Refresh") === "1";

    // ── Cache keys ────────────────────────────────────────────────────────────

    //
    // Cache API:
    // Use the complete request URL.
    //
    // This lets Cloudflare treat each public URL as a distinct cache entry.
    //
    const edgeCacheKey = new Request(url.toString(), {
      method: "GET",
    });

    //
    // KV:
    // Normalize query parameter ordering so equivalent queries share
    // the same KV entry.
    //
    const normalizedSearch = normalizeSearchParams(url.searchParams);

    const kvCacheKey = makeCacheKey(`/${pathname}`, normalizedSearch);

    // ── LEVEL 1: Cloudflare Cache API ─────────────────────────────────────────
    // eslint-disable-next-line no-undef
    const edgeCache = caches.default;

    let edgeCached: Response | undefined;

    try {
      if (!isWarmRefresh) {
        edgeCached = await edgeCache.match(edgeCacheKey);
      }
    } catch {
      // Cache API failure should never break the request.
    }

    if (edgeCached) {
      return new Response(edgeCached.body, {
        status: edgeCached.status,
        headers: corsHeaders({
          "Content-Type":
            edgeCached.headers.get("Content-Type") ?? "application/json",
          "X-Cache": "EDGE",
          "Cache-Control": `public, max-age=${ttl}`,
        }),
      });
    }

    // ── LEVEL 2: KV ───────────────────────────────────────────────────────────

    let cached: string | null = null;

    try {
      if (!isWarmRefresh) {
        cached = await env.CACHE.get(kvCacheKey);
      }
    } catch {
      // KV unavailable.
      // Fall through to OpenF1.
    }

    if (cached !== null) {
      const response = jsonResponse(cached, 200, {
        "X-Cache": "KV",
        "Cache-Control": `public, max-age=${ttl}`,
      });

      //
      // Warm the Cloudflare edge cache.
      //
      // Don't await this. The user doesn't need to wait for
      // the edge cache write.
      //
      try {
        await edgeCache.put(edgeCacheKey, response.clone());
      } catch {
        // Best effort.
      }

      return response;
    }

    // ── LEVEL 3: Request deduplication ─────────────────────────────────────────
    //
    // If another request in this Worker isolate is already fetching
    // this exact resource, wait for that request instead of creating
    // another OpenF1 request.

    const existingRequest = inFlightRequests.get(kvCacheKey);

    if (existingRequest) {
      const response = await existingRequest;

      return new Response(response.body, {
        status: response.status,
        headers: response.headers,
      });
    }

    // ── LEVEL 4: OpenF1 ────────────────────────────────────────────────────────

    const fetchPromise = (async (): Promise<Response> => {
      const openf1Url = `${OPENF1_BASE}/${pathname}${url.search}`;

      let originRes: Response;

      try {
        originRes = await fetchFromOpenF1(openf1Url, env);
      } catch (err) {
        return jsonResponse(
          JSON.stringify({
            error: "Origin unreachable",
            detail: String(err),
          }),
          502,
        );
      }

      // Never cache OpenF1 errors.
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

      // Never cache empty arrays.
      const isEmpty = body.trim() === "[]";

      const response = jsonResponse(body, 200, {
        "X-Cache": "MISS",
        "Cache-Control": `public, max-age=${ttl}`,
      });

      if (!isEmpty) {
        // ── Store in KV ─────────────────────────────────────────────────────

        try {
          const kvWriteOptions =
            ttl === TTL_PERMANENT ? undefined : { expirationTtl: ttl };

          await env.CACHE.put(kvCacheKey, body, kvWriteOptions);
        } catch {
          // Best effort.
        }

        // ── Store in Cloudflare Cache API ───────────────────────────────────

        try {
          await edgeCache.put(edgeCacheKey, response.clone());
        } catch {
          // Best effort.
        }
      }

      return response;
    })();

    inFlightRequests.set(kvCacheKey, fetchPromise);

    try {
      const response = await fetchPromise;

      return new Response(response.body, {
        status: response.status,
        headers: response.headers,
      });
    } finally {
      inFlightRequests.delete(kvCacheKey);
    }
  },
} satisfies ExportedHandler<Env>;
