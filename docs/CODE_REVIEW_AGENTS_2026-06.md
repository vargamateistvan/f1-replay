# Code Review — f1-replay (June 2026)

> Agent-facing analysis. Covers architecture health, notable patterns, identified issues, and recommended improvements.  
> Companion to [AGENTS.md](../AGENTS.md) and [CODE_REVIEW_2026-06.md](CODE_REVIEW_2026-06.md).

---

## 1. Executive Summary

The codebase is well-structured for a solo/small-team SPA. The separation between pure utilities (`utils/`, `timeline/`), data-fetching hooks (`hooks/`), typed API surface (`api/`), and UI components (`components/`) is consistent and easy to navigate. The rate-limiter, cache-persistence layer, and interpolation engine are the most technically sophisticated parts, and they are all correct and performant.

**Highlights**

- Rate limiter correctly uses _two_ sliding windows (per-second + per-minute), not just a concurrency cap — matches OpenF1's documented limits.
- `Float32Array` / `Float64Array` typed arrays in `interpolate.ts` are a good decision: zero GC pressure at 60 fps × 20 drivers.
- `computeStandings` is a pure function with its own unit tests — easy to extend and verify.
- IndexedDB persister degrades gracefully (no-op when IDB is blocked in private browsing).
- `isSessionLive` uses a ±30-min buffer to avoid edge cases around session start/end.

---

## 2. Architecture Assessment

### 2a. Layer boundaries — ✅ Good

The four-layer model (API → Hooks → Timeline → Components) is respected throughout. No components call `api.*` directly; all data flows through TanStack Query hooks.

One minor exception: `useCarDataForLap.ts` contains a `fetchCarDataForLap` async function that calls `api.laps` then `api.carDataForDriver` sequentially inside the hook's `queryFn`. This is intentional (waterfall is unavoidable — lap dates are needed before car data can be fetched) and acceptable, but it means errors from the first request bubble up as a single query failure with no partial state.

### 2b. State model — ✅ Good

Two Zustand stores:

- `useTimeline` — ephemeral playback state, never persisted.
- `useSettings` — user preferences, persisted to localStorage.

TanStack Query is used correctly as the cache for all server data. There is no local state duplication of server data in components.

### 2c. Playhead architecture — ✅ Good

The RAF clock in `timeline/clock.ts` correctly clamps the per-frame delta (`MAX_FRAME_STEP_MS = 250 ms`) to prevent playhead jumps when a backgrounded tab refocuses. This is a common pitfall that has been handled.

The `sessionStartMs + t` convention is consistent across the codebase.

---

## 3. Identified Issues

### 3a. `useCarDataForLap` — sequential fetch doubles latency on cold cache

**File**: `src/hooks/useCarDataForLap.ts`  
**Severity**: Medium  
**Description**: The hook fetches laps first, then uses lap dates to fetch car data. On a warm query cache this is instant, but on first load (or after cache expiry) the user waits for two sequential round trips.

**Recommendation**: Pre-fetch or co-locate `laps` data where possible. The laps query is already cached by `useSession.ts`'s `useLaps` hook — the telemetry hook could read from the same cache key instead of issuing a separate `api.laps` call:

```ts
// Instead of:
const laps = await api.laps(sessionKey, driverNumber);

// Use the already-cached query:
const laps = queryClient.getQueryData<Lap[]>([
  "laps",
  sessionKey,
  driverNumber,
]);
```

---

### 3b. `settings.ts` — `AppSettings` has grown large without grouping

**File**: `src/stores/settings.ts`  
**Severity**: Low  
**Description**: `AppSettings` has 35+ fields. There is a comment grouping by domain but no structural grouping (nested objects). This makes it harder to audit which settings belong to which feature.

**Recommendation**: Consider nested namespaces in a future refactor:

```ts
interface AppSettings {
  toasts: { enabled: boolean; radio: boolean; … }
  map: { showCompoundBadges: boolean; … }
  playback: { defaultSpeed: number; … }
  // …
}
```

This is a non-breaking change only if `setSetting` is refactored to accept a path. **Low priority** — the current flat structure works fine.

---

### 3c. `timeline/events.ts` — `normalizeRecordingUrl` only upgrades `http://` prefix

**File**: `src/timeline/events.ts`  
**Severity**: Low  
**Description**: The function upgrades `http://` URLs to `https://` to avoid mixed-content errors. This is correct, but the function returns `""` for a blank URL and doesn't validate that the result is a valid URL before it is passed to the `<audio>` element.

**Recommendation**: Add a validity check or handle errors at the audio player level with an `onError` handler. The current behaviour (empty `src` on `<audio>`) causes a benign but noisy browser error.

---

### 3d. `useLocationChunks.ts` — eviction uses `queryClient.removeQueries` without checking prefetch state

**File**: `src/hooks/useLocationChunks.ts`  
**Severity**: Low  
**Description**: The eviction logic removes chunks outside `EVICT_RADIUS = 4`. If a background prefetch is in-flight for a chunk that falls outside the radius (edge case: very fast seek followed by seek back), the prefetch result may be discarded immediately after it resolves.

**Impact**: Minimal — the chunk will just be re-fetched. No data corruption.

---

### 3e. `api/client.ts` — `inFlightJsonRequests` map is never pruned on error

**File**: `src/api/client.ts`  
**Severity**: Medium  
**Description**: The `inFlightJsonRequests` map stores in-progress fetch Promises keyed by URL. On a successful fetch, the entry is deleted. On a network error or HTTP 4xx/5xx, the Promise rejects, but it's unclear from the visible code whether the rejection path removes the key. If the key remains after rejection, subsequent calls to the same URL will receive a cached rejected Promise and fail immediately without retrying.

**Recommendation**: Confirm the rejection path deletes the key:

```ts
inFlightJsonRequests.set(url, promise);
promise.finally(() => inFlightJsonRequests.delete(url));
```

---

### 3f. `useTrackMap.ts` — convex hull fallback is O(n log n) on every render

**File**: `src/hooks/useTrackMap.ts`  
**Severity**: Low  
**Description**: The `deriveLayoutOutline` path runs a convex hull algorithm on every render when static circuit geometry is unavailable. The result is stable and should be memoised.

**Recommendation**: Wrap the derivation in `useMemo` (or derive it inside the `useQuery` selector so it's cached by TanStack Query).

---

## 4. Positive Patterns Worth Preserving

| Pattern                                   | Location                              | Why it's good                                   |
| ----------------------------------------- | ------------------------------------- | ----------------------------------------------- |
| Typed arrays for interpolation            | `timeline/interpolate.ts`             | Zero GC alloc at 60 fps                         |
| Two-window rate limiter                   | `api/client.ts`                       | Matches documented API limits exactly           |
| `staleTime: Infinity` for historical data | `hooks/useSession.ts`                 | Prevents redundant re-fetches of immutable data |
| Pure `computeStandings`                   | `utils/standings.ts`                  | Fully testable without React                    |
| IndexedDB with no-op fallback             | `lib/queryPersister.ts`               | Graceful degradation in private browsing        |
| `MAX_FRAME_STEP_MS` clamp                 | `timeline/clock.ts`                   | Prevents playhead jump on tab refocus           |
| Session-relative `t` convention           | everywhere                            | Avoids timezone/offset bugs                     |
| `canonicalTeamName` + `teamColor`         | `utils/identity.ts`, `utils/color.ts` | Normalises inconsistent API strings             |

---

## 5. Test Coverage Assessment

Tests exist for:

- `timeline/events.test.ts` — toast event normalisation
- `timeline/interpolate.test.ts` — binary search + interpolation
- `timeline/raceControl.test.ts` — race control enrichment
- `hooks/useCarDataForLap.test.ts`, `useLocationChunks.test.ts`, `useTrackMap.test.ts`, etc.
- `utils/standings.test.ts`, `utils/color.test.ts`, `utils/identity.test.ts`, etc.

**Coverage gaps**:

- `api/client.ts` rate limiter is not unit tested (hard to test with real timers — use `vi.useFakeTimers`).
- `lib/queryPersister.ts` IndexedDB adapter is not tested (mock `indexedDB` in jsdom environment).
- Most component files have no render tests. This is acceptable given the data-driven nature of the app.

---

## 6. Security Notes

- No user input is ever sent to OpenF1 (read-only API). XSS surface is low.
- `normalizeRecordingUrl` upgrades `http://` → `https://` to avoid mixed-content — good.
- `VITE_OPENF1_API_KEY` is an optional bearer token. It is only used if set; it is never logged. ✅
- No `dangerouslySetInnerHTML` usage found in the audited files.
- `robots.txt` + `sitemap.xml` present for public deployment. ✅

---

## 7. Performance Notes

- Location chunks (5 min each) keep individual API responses under ~22k rows.
- `useCoarseTime` throttles expensive renders to avoid running at full 60 fps.
- `uPlot` is used for high-frequency telemetry (canvas-based, much faster than SVG/Recharts for dense time series).
- `gcTime: Infinity` on all queries prevents mid-session eviction of cached data. This means memory usage grows with session length — acceptable for a replay tool.

---

## 8. Dependency Notes

| Dep                     | Version | Notes                                           |
| ----------------------- | ------- | ----------------------------------------------- |
| `react`                 | ^18.3.1 | React 19 RC is available; no urgency to upgrade |
| `@tanstack/react-query` | ^5.62.7 | Up to date                                      |
| `react-router-dom`      | ^6.28.0 | v7 available; migration is straightforward      |
| `recharts`              | ^3.0.0  | Major version recently released; API is stable  |
| `uplot`                 | ^1.6.31 | Maintained; no upgrade needed                   |
| `zustand`               | ^5.0.2  | Latest                                          |
| `lucide-react`          | ^1.20.0 | Latest                                          |

---

## 9. Recommended Next Steps (Priority Order)

1. **Fix `inFlightJsonRequests` rejection path** (§3e) — verify or add `.finally()` cleanup.
2. **Deduplicate laps fetch in `useCarDataForLap`** (§3a) — read from query cache.
3. **Memoize convex hull fallback** (§3f) — `useMemo` around `deriveLayoutOutline`.
4. **Add `onError` to `<audio>` in TeamRadio component** (§3c) — suppress noisy browser errors.
5. **Rate limiter unit tests** (§5) — use `vi.useFakeTimers` for the sliding window logic.
