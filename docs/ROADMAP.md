# F1 Replay — Improvements & Feature Roadmap

A prioritized backlog of improvements, new features, and technical hardening for the
f1-replay app. Each item lists **why**, **what**, **touched files**, and a rough
**effort** (S = <½ day, M = ~1 day, L = multi-day).

Status legend: 🟢 quick win · 🔵 feature · 🟠 hardening · 🔴 known bug

---

## 0. Snapshot of current state

**Pages:** Race Weekend (track map + live timing + strategy + race control + radio + weather, scrubable),
Telemetry (A/B driver lap comparison), Standings (driver + constructor championship).

**Wired OpenF1 endpoints (13):** meetings, sessions, drivers, location, car_data, laps,
position, intervals, pit, stints, race_control, team_radio, weather.

**Not yet used (3):** `session_result`, `starting_grid`, `overtakes`.

**Stack:** React 18 · TS (strict) · Vite · Zustand (RAF clock) · React Query · uPlot · Recharts ·
Tailwind · HashRouter · GitHub Pages.

---

## 1. Known bugs & correctness 🔴

### 1.1 Rate-limit queue does not actually rate-limit 🔴 — `src/api/client.ts`
The comment says "max 3 requests per second" but the queue only caps **concurrency** at 3.
OpenF1's free tier is **3 req/s + 30 req/min**, enforced with `429`. At 16× scrub with
chunk prefetch, bursts can exceed this and there is **no `429`/`Retry-After` handling and no backoff**.

- **What:** Add a token-bucket / sliding-window limiter (≤3 starts per rolling second), detect `429`,
  read `Retry-After`, and exponentially back off + retry. Distinguish retryable (429/5xx) from fatal (4xx).
- **Effort:** M

### 1.2 Standings derived from `position` instead of `session_result` 🔴 — `src/hooks/useStandings.ts`
Final classification is reconstructed from the last `position` row per driver. This misses DNFs,
DSQs, fastest-lap points (where applicable), and is N extra fetches per race.

- **What:** Switch to the `session_result` endpoint (one call per session) for authoritative
  finishing order + status; keep the position-scrape as a fallback for sessions lacking results.
- **Effort:** M · **Depends on:** 2.1

### 1.3 Unsafe non-null assumptions — multiple files
`driverByNumber.get(...)` results are used without null guards in several render paths; a session
with sparse data can throw. ErrorBoundary catches it but the panel dies.

- **What:** Default-and-skip missing drivers; render a muted "—" rather than crashing.
- **Effort:** S

### 1.4 RAF clock has no drift / tab-throttle correction 🟠 — `src/timeline/clock.ts`
Background tabs throttle `requestAnimationFrame`; large deltas on refocus cause a playhead jump that
can skip a whole location chunk.

- **What:** Clamp per-frame delta (e.g. cap at 250 ms × speed) and/or pause when `document.hidden`.
- **Effort:** S

---

## 2. New data / endpoints 🔵

### 2.1 `session_result` — authoritative classification
Enables correct standings (1.2), a post-session results table on Race Weekend, and DNF/DSQ badges
in Live Timing.
- **Files:** `api/types.ts`, `api/endpoints.ts`, `hooks/useSession.ts`, new `components/ResultsTable`.
- **Effort:** M

### 2.2 `starting_grid` — grid order
Show grid slot next to each driver; compute **positions gained/lost** vs current order (a great
glanceable race-story metric).
- **Files:** types, endpoints, a `useStartingGrid` hook, Live Timing column.
- **Effort:** M

### 2.3 `overtakes` — pass events
Overlay overtake markers on the timeline/strategy bar and a "key moments" feed; pulse the two cars
on the track map at the overtake timestamp.
- **Files:** types, endpoints, `useOvertakes`, TrackMap + StrategyBar overlays.
- **Effort:** L

### 2.4 DRS / brake / throttle mini-bars in Live Timing
`car_data` already fetched for telemetry — surface a live DRS indicator and throttle bar per driver
at the playhead (interpolated like location).
- **Effort:** M

---

## 3. Feature ideas 🔵

### 3.1 URL state persistence (shareable replay links) — **highest UX leverage**
Selections (year, meeting, session, driver A/B, lap, playhead `t`, speed) are lost on reload and
**cannot be shared**. Encode them in the hash route query (e.g. `/#/race?session=9472&t=1830000`).
- **What:** A `useUrlState` hook syncing Zustand + page state ↔ `URLSearchParams`. Debounce `t`.
- **Files:** `routes.tsx`, `pages/*`, `timeline/clock.ts`, new `hooks/useUrlState.ts`.
- **Effort:** M · **Impact:** High

### 3.2 Dynamic year list from API 🟢
`YEARS = [2024, 2023, 2022]` is hardcoded in 4 places. Derive the available range from
meetings, or at minimum hoist to one `constants.ts`.
- **Effort:** S

### 3.3 Jump-to-event playback controls
Buttons to jump the playhead to: next/prev lap, next pit, next flag/SC, next overtake. Optional
"pause on red flag / SC" toggle.
- **Files:** `PlaybackBar.tsx`, clock store, event indexes.
- **Effort:** M

### 3.4 Driver focus / spotlight
Click a driver in Live Timing → highlight their dot on the map, dim others, pin their telemetry.
- **Effort:** M

### 3.5 Telemetry upgrades
- 3+ driver comparison (currently A/B only).
- Throttle/brake/DRS **track-position heat overlay** on the map.
- Delta-to-fastest-lap and sector split table under the charts.
- Light smoothing toggle (raw vs low-pass) for noisy speed traces.
- **Effort:** L

### 3.6 Mini standings sparkline
Per-driver points progression across rounds (Recharts line) on the Standings page.
- **Effort:** M

### 3.7 Lap chart (position-by-lap)
Classic F1 "spaghetti" chart: position on Y, lap on X, one line per driver. Reuses `position` data
already loaded.
- **Effort:** M

### 3.8 Keyboard shortcuts
Space = play/pause, ←/→ = scrub, ↑/↓ = speed, `[`/`]` = prev/next lap.
- **Effort:** S

---

## 4. UX, accessibility & polish 🟢🟠

### 4.1 Colorblind-safe indicators 🟠
Flags (Race Control) and sector colors (Live Timing) are **color-only**. Add a glyph/letter
(e.g. `▮Y`, `P/G/Y` sector tag) alongside color.
- **Effort:** S

### 4.2 Skeleton loaders 🟢
Replace text "Loading…" placeholders with skeleton rows for tables/panels.
- **Effort:** S–M

### 4.3 Empty / cancelled-session states 🟢
Explicit messaging for cancelled or data-less sessions (currently can render blank panels).
- **Effort:** S

### 4.4 Keyboard nav + ARIA on custom controls 🟠
Speed chips, tabs, and the scrubber need focus rings, roles, and arrow-key support.
- **Effort:** M

### 4.5 Readability pass 🟢
Several `text-[10px]` values are below comfortable reading size on large displays; audit and bump
where density allows.
- **Effort:** S

---

## 5. Performance 🟠

### 5.1 Decouple 60 fps render from React
Every timeline subscriber re-renders each frame. Move car-dot positioning to direct DOM/SVG
attribute writes (ref + imperative update in the RAF loop) so only the map mutates per frame, not
the whole panel tree.
- **Files:** `TrackMap.tsx`, `clock.ts`.
- **Effort:** M

### 5.2 Selector-scoped Zustand subscriptions
Subscribe to `t` via a selector so components that only need `speed`/`playing` don't re-render on
every tick.
- **Effort:** S

### 5.3 Chunk cache eviction
`LocationIndex` objects accumulate as the playhead moves; cap retained chunks (LRU around the
playhead) to bound memory on long races.
- **Effort:** M

### 5.4 Bundle: `vendor-charts` is 404 kB (129 kB gzip)
Recharts + uPlot dominate. Consider dropping Recharts in favour of a small custom SVG bar/line
(standings are simple) — would remove the largest dep.
- **Effort:** M–L

---

## 6. Engineering / infra 🟠

### 6.1 Tests (none today)
Add **Vitest + Testing Library**. Priorities:
- Pure logic: `interpolate.ts` (binary search + lerp), `useStandings` points math, `color.ts`,
  `live.ts`, distance integration in `useCarDataForLap`.
- Component smoke tests for each page with mocked query data.
- **Effort:** L · **Impact:** High (these are the most logic-dense, regression-prone areas)

### 6.2 Centralize constants 🟢
`constants.ts` for `CHUNK_MS`, `BUFFER_MS`, `LIVE_POLL_MS`, `SPEEDS`, SVG dims, sector thresholds,
points tables.
- **Effort:** S

### 6.3 CI: type-check + lint + test on PR 🟠
Current workflow only builds on push to `main`. Add a PR job running `tsc`, `eslint`, `vitest`.
- **Effort:** S

### 6.4 Runtime data validation (optional)
Light Zod schemas at the API boundary to fail loudly on unexpected OpenF1 shape changes.
- **Effort:** M

### 6.5 PWA / offline cache (optional)
Service worker to cache immutable historical data — replays work offline once loaded.
- **Effort:** L

---

## 7. Suggested execution order

**Milestone A — Correctness & trust (do first)**
1. 1.1 Real rate limiter + 429 backoff 🔴
2. 1.3 Null-safety guards 🔴
3. 1.4 Clock drift clamp 🟠
4. 6.2 Constants file 🟢 · 3.2 dynamic years 🟢

**Milestone B — Shareability & data quality**
5. 3.1 URL state persistence 🔵 (highest UX leverage)
6. 2.1 `session_result` → 1.2 correct standings
7. 2.2 `starting_grid` (positions gained/lost)

**Milestone C — Depth & delight**
8. 3.3 jump-to-event + 3.8 keyboard shortcuts
9. 3.4 driver spotlight · 2.4 live DRS/throttle
10. 2.3 overtakes + 3.7 lap chart
11. 3.5 telemetry upgrades

**Milestone D — Hardening**
12. 6.1 Vitest suite (logic first)
13. 5.1 / 5.2 render-loop perf
14. 4.x accessibility pass
15. 6.3 CI PR checks · 5.4 bundle trim

---

## 8. Top 5 if time is short

1. **URL state persistence (3.1)** — turns the app into something you can *share*.
2. **Real rate limiter + 429 backoff (1.1)** — prevents silent failures under load.
3. **`session_result` for standings (2.1 + 1.2)** — correctness on the data that matters.
4. **Vitest on the math (6.1)** — locks in the interpolation/standings logic.
5. **Jump-to-event + keyboard shortcuts (3.3 + 3.8)** — biggest feel-quality jump for replay.
