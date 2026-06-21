import {
  RATE_MAX_PER_SECOND,
  RATE_MAX_PER_MINUTE,
  RATE_MAX_RETRIES,
} from "@/constants";
import * as Sentry from "@sentry/react";

const BASE = "https://api.openf1.org/v1";

// Optional bearer token. OpenF1's historical tier is documented as free/no-auth,
// but if the API starts gating requests (401/403) you can supply a token via the
// VITE_OPENF1_API_KEY env var (.env.local) and it'll be sent on every request.
const API_KEY = import.meta.env.VITE_OPENF1_API_KEY as string | undefined;

// Carries the HTTP status so callers can distinguish auth failures (401/403),
// which are not retryable, from transient errors (429/5xx).
export class OpenF1Error extends Error {
  constructor(
    readonly status: number,
    readonly path: string,
  ) {
    super(`OpenF1 ${path}: ${status}`);
    this.name = "OpenF1Error";
  }
}

interface OpenF1ErrorPayload {
  detail?: string;
}

type QueryParams = Record<string, string | number | boolean>;

// Identical concurrent GETs (same URL + auth header) share one network request.
const inFlightJsonRequests = new Map<string, Promise<unknown[]>>();

function logApiWarning(message: string, extra: Record<string, unknown>) {
  Sentry.logger.warn(message, {
    log_source: "openf1_api",
    ...extra,
  });
}

function logApiError(message: string, extra: Record<string, unknown>) {
  Sentry.logger.error(message, {
    log_source: "openf1_api",
    ...extra,
  });
}

export function isAuthError(err: unknown): err is OpenF1Error {
  return (
    err instanceof OpenF1Error && (err.status === 401 || err.status === 403)
  );
}

// ── Rate limiter ──────────────────────────────────────────────────────────────
// OpenF1's free tier allows 3 req/s and 30 req/min, enforced with HTTP 429.
// A naive concurrency cap is NOT enough: at high playback speed the chunk
// prefetcher can fire many requests in well under a second. We gate request
// *starts* with two sliding windows (per-second and per-minute) and, on 429,
// honour Retry-After with exponential backoff.

const startTimes: number[] = []; // ms timestamps of recent request starts
const waiters: Array<() => void> = [];

function pruneOlderThan(cutoff: number) {
  // startTimes is append-only and sorted, so drop from the front.
  while (startTimes.length > 0 && startTimes[0] < cutoff) startTimes.shift();
}

// How long until a new request may start without breaching either window.
// Returns 0 if a slot is available right now.
function msUntilSlot(now: number): number {
  pruneOlderThan(now - 60_000);
  const inLastSecond = startTimes.filter((t) => t > now - 1_000).length;
  const inLastMinute = startTimes.length;

  let wait = 0;
  if (inLastSecond >= RATE_MAX_PER_SECOND) {
    const oldestInSecond = startTimes[startTimes.length - RATE_MAX_PER_SECOND];
    wait = Math.max(wait, oldestInSecond + 1_000 - now);
  }
  if (inLastMinute >= RATE_MAX_PER_MINUTE) {
    wait = Math.max(wait, startTimes[0] + 60_000 - now);
  }
  return wait;
}

let pumpScheduled = false;

function pump() {
  pumpScheduled = false;
  if (waiters.length === 0) return;

  const now = Date.now();
  const wait = msUntilSlot(now);
  if (wait <= 0) {
    startTimes.push(now);
    const run = waiters.shift()!;
    run();
    // Try to release more in the same tick if windows still allow it.
    schedulePump(0);
  } else {
    schedulePump(wait);
  }
}

function schedulePump(delay: number) {
  if (pumpScheduled) return;
  pumpScheduled = true;
  setTimeout(pump, Math.max(0, delay));
}

// Resolves when the caller is cleared to start a request.
function acquireSlot(): Promise<void> {
  return new Promise((resolve) => {
    waiters.push(resolve);
    schedulePump(0);
  });
}

// ── Fetch with backoff ──────────────────────────────────────────────────────--
const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));

function parseRetryAfter(res: Response): number | null {
  const h = res.headers.get("Retry-After");
  if (!h) return null;
  const secs = Number(h);
  if (!Number.isNaN(secs)) return secs * 1000;
  const dateMs = Date.parse(h);
  return Number.isNaN(dateMs) ? null : Math.max(0, dateMs - Date.now());
}

async function isNoResults404(path: string, res: Response): Promise<boolean> {
  if (res.status !== 404) return false;

  // OpenF1 location windows frequently return 404 when no samples exist in a
  // requested range. For replay chunking this is an expected "empty chunk".
  if (path === "location") return true;

  try {
    const body = (await res.clone().json()) as OpenF1ErrorPayload;
    const detail = (body.detail ?? "").toLowerCase();
    return detail.includes("no results found") || detail.includes("no data");
  } catch {
    return false;
  }
}

export async function fetchEndpoint<T>(
  path: string,
  params: QueryParams,
): Promise<T[]> {
  // Build query string manually so comparison operators (>, <, >=, <=) in keys
  // are NOT percent-encoded — OpenF1 expects raw `date>value` syntax.
  const qs = Object.entries(params)
    .map(([k, v]) => `${k}=${encodeURIComponent(String(v))}`)
    .join("&");
  const query = qs ? `?${qs}` : "";
  const url = `${BASE}/${path}${query}`;

  const headers: Record<string, string> = {};
  if (API_KEY) headers.Authorization = `Bearer ${API_KEY}`;

  const requestKey = `${url}|${headers.Authorization ?? ""}`;
  const existing = inFlightJsonRequests.get(requestKey) as
    | Promise<T[]>
    | undefined;
  if (existing) return existing;

  const requestPromise = (async () => {
    let attempt = 0;
    let lastError: Error | null = null;

    for (;;) {
      try {
        await acquireSlot();
        const res = await fetch(url, { headers });

        if (res.ok) {
          try {
            const data = await res.json();
            if (!Array.isArray(data)) {
              logApiWarning("OpenF1 returned non-array JSON payload", {
                path,
                url,
                payload_type: typeof data,
              });
              console.warn(
                `Expected array response from ${path}, got:`,
                typeof data,
              );
              return [];
            }
            return data;
          } catch (parseErr) {
            logApiError("Failed to parse OpenF1 JSON response", {
              path,
              url,
              attempt,
            });
            Sentry.captureException(
              parseErr instanceof Error
                ? parseErr
                : new Error(String(parseErr)),
              {
                tags: { log_source: "openf1_api", failure_type: "parse" },
                extra: { path, url, attempt },
              },
            );
            console.error("Failed to parse JSON response from", path, parseErr);
            throw new OpenF1Error(0, `${path} (parse error)`);
          }
        }

        // OpenF1 returns 404 + `{"detail":"No results found."}` for empty filters.
        // Treat that specific case as an empty dataset.
        if (await isNoResults404(path, res)) return [];

        // Retry on 429 (rate limit) and 5xx (transient server) with backoff.
        // Auth (401/403) and other 4xx are terminal — fail fast.
        const retryable = res.status === 429 || res.status >= 500;
        if (!retryable || attempt >= RATE_MAX_RETRIES) {
          logApiError("OpenF1 request failed", {
            path,
            url,
            status: res.status,
            attempt,
            retryable,
          });
          const err = new OpenF1Error(res.status, path);
          lastError = err;
          Sentry.captureException(err, {
            tags: { log_source: "openf1_api", failure_type: "http" },
            extra: { path, url, status: res.status, attempt, retryable },
          });
          throw err;
        }

        const backoff = parseRetryAfter(res) ?? 2 ** attempt * 500; // 0.5s,1s,2s,4s…
        logApiWarning("Retrying OpenF1 request after retryable response", {
          path,
          url,
          status: res.status,
          attempt: attempt + 1,
          backoff_ms: backoff,
        });
        attempt++;
        await sleep(backoff);
      } catch (err) {
        // Network errors, parsing errors, etc.
        if (err instanceof OpenF1Error) throw err;
        lastError = err instanceof Error ? err : new Error(String(err));

        if (attempt >= RATE_MAX_RETRIES) {
          logApiError("OpenF1 request exhausted network retries", {
            path,
            url,
            attempt,
            error_message: lastError.message,
          });
          Sentry.captureException(lastError, {
            tags: { log_source: "openf1_api", failure_type: "network" },
            extra: { path, url, attempt },
          });
          console.error(
            `fetchEndpoint: max retries exceeded for ${path}:`,
            lastError,
          );
          throw new OpenF1Error(0, `${path} (network error)`);
        }

        attempt++;
        const backoff = 2 ** attempt * 500;
        logApiWarning("Retrying OpenF1 request after network error", {
          path,
          url,
          attempt,
          backoff_ms: backoff,
          error_message: lastError.message,
        });
        await sleep(backoff);
      }
    }
  })();

  inFlightJsonRequests.set(requestKey, requestPromise as Promise<unknown[]>);
  try {
    return await requestPromise;
  } finally {
    inFlightJsonRequests.delete(requestKey);
  }
}

export async function downloadEndpointCsv(
  path: string,
  params: QueryParams,
  fileName: string,
): Promise<boolean> {
  const qs = Object.entries({ ...params, csv: true })
    .map(([k, v]) => `${k}=${encodeURIComponent(String(v))}`)
    .join("&");
  const query = qs ? `?${qs}` : "";
  const url = `${BASE}/${path}${query}`;

  const headers: Record<string, string> = {};
  if (API_KEY) headers.Authorization = `Bearer ${API_KEY}`;

  let attempt = 0;
  for (;;) {
    await acquireSlot();
    const res = await fetch(url, { headers });

    if (res.ok) {
      const csv = await res.text();
      if (!csv.trim()) return false;

      const blob = new Blob([csv], { type: "text/csv;charset=utf-8;" });
      const blobUrl = URL.createObjectURL(blob);
      const a = document.createElement("a");
      a.href = blobUrl;
      a.download = fileName;
      document.body.appendChild(a);
      a.click();
      a.remove();
      URL.revokeObjectURL(blobUrl);
      return true;
    }

    if (await isNoResults404(path, res)) return false;

    const retryable = res.status === 429 || res.status >= 500;
    if (!retryable || attempt >= RATE_MAX_RETRIES) {
      const err = new OpenF1Error(res.status, path);
      logApiError("OpenF1 CSV download failed", {
        path,
        url,
        status: res.status,
        attempt,
        retryable,
      });
      Sentry.captureException(err, {
        tags: { log_source: "openf1_api", failure_type: "csv_download" },
        extra: { path, url, status: res.status, attempt, retryable },
      });
      throw err;
    }

    const backoff = parseRetryAfter(res) ?? 2 ** attempt * 500;
    logApiWarning("Retrying OpenF1 CSV download", {
      path,
      url,
      status: res.status,
      attempt: attempt + 1,
      backoff_ms: backoff,
    });
    attempt++;
    await sleep(backoff);
  }
}
