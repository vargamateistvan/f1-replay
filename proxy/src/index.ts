/**
 * f1-replay OpenF1 proxy — Cloudflare Worker
 *
 * Proxies GET /v1/<endpoint>?<params> to api.openf1.org and caches
 * JSON responses in Cloudflare KV.
 *
 * Cache TTL strategy
 * ──────────────────
 * STATIC / RESULT     → 30 days
 * Historical data     → 30 days
 * Live location/data  → 5 s
 * Live position/laps  → 20 s
 * Other live data     → 60 s
 *
 * Empty [] responses are never cached.
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
}

// ── Constants ────────────────────────────────────────────────────────────────

const OPENF1_BASE = "https://api.openf1.org/v1";

const TTL_PERMANENT = 60 * 60 * 24 * 30; // 30 days
const TTL_LIVE_FAST = 20; // position / intervals / laps
const TTL_LIVE_SLOW = 60; // weather / radio / race control
const TTL_LIVE_WINDOW = 5; // location / car_data

// ±30 min buffer around session bounds.
const LIVE_BUFFER_MS = 30 * 60 * 1000;

// ── Request deduplication ────────────────────────────────────────────────────
//
// This prevents multiple simultaneous requests inside the SAME Worker isolate
// from all hitting OpenF1 when the KV cache is empty.
//
// Important:
// Cloudflare Workers are distributed, so this does NOT provide global
// deduplication across every Worker instance. KV still provides the main
// cross-user/cross-instance cache.

const inFlightRequests = new Map<string, Promise<Response>>();

// ── Endpoint classification ─────────────────────────────────────────────────

const STATIC_ENDPOINTS = new Set([
  "meetings",
  "sessions",
  "drivers",
  "starting_grid",
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
 * Normalize query parameters so equivalent URLs share the same cache key.
 *
 * Example:
 *
 * ?session_key=9158&driver_number=1
 *
 * and
 *
 * ?driver_number=1&session_key=9158
 *
 * will produce the same cache key.
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

// ── Origin fetch ─────────────────────────────────────────────────────────────

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

// ── Worker entry point ───────────────────────────────────────────────────────

export default {
  async fetch(request: Request, env: Env): Promise<Response> {
    // ── CORS preflight ────────────────────────────────────────────────────────

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

    // ── Parse endpoint ────────────────────────────────────────────────────────

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

    // ── Build OpenF1 URL ──────────────────────────────────────────────────────

    const openf1Url = `${OPENF1_BASE}/${pathname}${url.search}`;

    const ttl = chooseTtl(endpoint, url.searchParams);

    // Normalize query parameters for the cache key.
    const normalizedSearch = normalizeSearchParams(url.searchParams);

    const cacheKey = makeCacheKey(`/${pathname}`, normalizedSearch);

    // ── KV read ───────────────────────────────────────────────────────────────

    let cached: string | null = null;

    try {
      cached = await env.CACHE.get(cacheKey);
    } catch {
      // KV unavailable.
      //
      // We deliberately fall through to OpenF1 instead of failing
      // the user's request.
    }

    if (cached !== null) {
      return jsonResponse(cached, 200, {
        "X-Cache": "HIT",
        "Cache-Control": `public, max-age=${ttl}`,
      });
    }

    // ── Request deduplication ─────────────────────────────────────────────────
    //
    // If another request in this Worker isolate is already fetching
    // the exact same resource, wait for it instead of starting
    // another OpenF1 request.

    const existingRequest = inFlightRequests.get(cacheKey);

    if (existingRequest) {
      const response = await existingRequest;

      return new Response(response.body, {
        status: response.status,
        headers: response.headers,
      });
    }

    // ── OpenF1 request ────────────────────────────────────────────────────────

    const fetchPromise = (async (): Promise<Response> => {
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

      // Pass non-200 responses through without caching.
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

      // Do not cache empty arrays.
      //
      // This is important for live data because [] can simply mean
      // that the data is not available yet.
      const isEmpty = body.trim() === "[]";

      if (!isEmpty) {
        try {
          await env.CACHE.put(cacheKey, body, {
            expirationTtl: ttl,
          });
        } catch {
          // Best effort.
          //
          // A failed KV write must never break the response.
        }
      }

      return jsonResponse(body, 200, {
        "X-Cache": "MISS",
        "Cache-Control": `public, max-age=${ttl}`,
      });
    })();

    inFlightRequests.set(cacheKey, fetchPromise);

    try {
      const response = await fetchPromise;

      // Clone the response before returning it so the response
      // can safely be consumed by multiple waiting requests.
      return new Response(response.body, {
        status: response.status,
        headers: response.headers,
      });
    } finally {
      // Always remove the in-flight entry.
      //
      // This allows a future request to fetch the resource again
      // after the current request has completed.
      inFlightRequests.delete(cacheKey);
    }
  },
} satisfies ExportedHandler<Env>;
