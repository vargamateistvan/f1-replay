import {
  RATE_MAX_PER_SECOND,
  RATE_MAX_PER_MINUTE,
  RATE_MAX_RETRIES,
} from '@/constants'

const BASE = 'https://api.openf1.org/v1'

// ── Rate limiter ──────────────────────────────────────────────────────────────
// OpenF1's free tier allows 3 req/s and 30 req/min, enforced with HTTP 429.
// A naive concurrency cap is NOT enough: at high playback speed the chunk
// prefetcher can fire many requests in well under a second. We gate request
// *starts* with two sliding windows (per-second and per-minute) and, on 429,
// honour Retry-After with exponential backoff.

const startTimes: number[] = [] // ms timestamps of recent request starts
const waiters: Array<() => void> = []

function pruneOlderThan(cutoff: number) {
  // startTimes is append-only and sorted, so drop from the front.
  while (startTimes.length > 0 && startTimes[0] < cutoff) startTimes.shift()
}

// How long until a new request may start without breaching either window.
// Returns 0 if a slot is available right now.
function msUntilSlot(now: number): number {
  pruneOlderThan(now - 60_000)
  const inLastSecond = startTimes.filter((t) => t > now - 1_000).length
  const inLastMinute = startTimes.length

  let wait = 0
  if (inLastSecond >= RATE_MAX_PER_SECOND) {
    const oldestInSecond = startTimes[startTimes.length - RATE_MAX_PER_SECOND]
    wait = Math.max(wait, oldestInSecond + 1_000 - now)
  }
  if (inLastMinute >= RATE_MAX_PER_MINUTE) {
    wait = Math.max(wait, startTimes[0] + 60_000 - now)
  }
  return wait
}

let pumpScheduled = false

function pump() {
  pumpScheduled = false
  if (waiters.length === 0) return

  const now = Date.now()
  const wait = msUntilSlot(now)
  if (wait <= 0) {
    startTimes.push(now)
    const run = waiters.shift()!
    run()
    // Try to release more in the same tick if windows still allow it.
    schedulePump(0)
  } else {
    schedulePump(wait)
  }
}

function schedulePump(delay: number) {
  if (pumpScheduled) return
  pumpScheduled = true
  setTimeout(pump, Math.max(0, delay))
}

// Resolves when the caller is cleared to start a request.
function acquireSlot(): Promise<void> {
  return new Promise((resolve) => {
    waiters.push(resolve)
    schedulePump(0)
  })
}

// ── Fetch with backoff ──────────────────────────────────────────────────────--
const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms))

function parseRetryAfter(res: Response): number | null {
  const h = res.headers.get('Retry-After')
  if (!h) return null
  const secs = Number(h)
  if (!Number.isNaN(secs)) return secs * 1000
  const dateMs = Date.parse(h)
  return Number.isNaN(dateMs) ? null : Math.max(0, dateMs - Date.now())
}

export async function fetchEndpoint<T>(
  path: string,
  params: Record<string, string | number | boolean>,
): Promise<T[]> {
  // Build query string manually so comparison operators (>, <, >=, <=) in keys
  // are NOT percent-encoded — OpenF1 expects raw `date>value` syntax.
  const qs = Object.entries(params)
    .map(([k, v]) => `${k}=${encodeURIComponent(String(v))}`)
    .join('&')
  const query = qs ? `?${qs}` : ''
  const url = `${BASE}/${path}${query}`

  let attempt = 0
  for (;;) {
    await acquireSlot()
    const res = await fetch(url)

    if (res.ok) return res.json() as Promise<T[]>

    // Retry on 429 (rate limit) and 5xx (transient server) with backoff.
    const retryable = res.status === 429 || res.status >= 500
    if (!retryable || attempt >= RATE_MAX_RETRIES) {
      throw new Error(`OpenF1 ${path}: ${res.status}`)
    }

    const backoff = parseRetryAfter(res) ?? 2 ** attempt * 500 // 0.5s,1s,2s,4s…
    attempt++
    await sleep(backoff)
  }
}
