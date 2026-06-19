# F1 Replay — Agent Documentation

> Last updated: 2026-06-19  
> Companion document to the existing docs in `docs/`. Provides concise, agent-readable architecture notes, conventions, and guardrails.

---

## 1. Project Overview

**f1-replay** is a React + TypeScript SPA that streams live and historical Formula 1 telemetry from the [OpenF1 public API](https://openf1.org/) and renders an interactive replay timeline. The app is deployed as a static site (Vite build → GitHub Pages via `CNAME`).

**Core value proposition**: scrub through any F1 session like a replay video — track map with animated car positions, live timing leaderboard, race control messages, telemetry comparison, and standings.

---

## 2. Tech Stack

| Layer             | Choice                                                       |
| ----------------- | ------------------------------------------------------------ |
| UI framework      | React 18                                                     |
| Language          | TypeScript 5.6 (strict)                                      |
| Routing           | React Router v6                                              |
| Server state      | TanStack Query v5                                            |
| Cache persistence | TanStack Query Persist Client → IndexedDB                    |
| Client state      | Zustand v5                                                   |
| Styling           | Tailwind CSS v3                                              |
| Charts            | Recharts (standings/gap charts), uPlot (high-freq telemetry) |
| Icons             | Lucide React                                                 |
| Build             | Vite 6                                                       |
| Testing           | Vitest + Testing Library + jsdom                             |

---

## 3. Repository Layout

```
src/
  App.tsx               — QueryClient setup, global gates (light mode, coffee widget)
  routes.tsx            — BrowserRouter + top-level route tree
  constants.ts          — ALL tunable magic numbers (speeds, chunk sizes, poll rates…)
  main.tsx              — ReactDOM.createRoot entry point

  api/
    client.ts           — fetchEndpoint, OpenF1Error, rate-limiter (3 req/s, 30 req/min)
    endpoints.ts        — Typed api.* surface for every OpenF1 endpoint
    types.ts            — Pure TypeScript interfaces mirroring the OpenF1 schema
    circuitFactsLookup.ts — Static circuit metadata keyed by circuit_key

  timeline/
    clock.ts            — RAF-based playback clock (Zustand store: useTimeline)
    events.ts           — Toast event normalisation (radio, flag, pit, overtake…)
    interpolate.ts      — Typed-array binary search + linear interpolation for location
    raceControl.ts      — Race control event enrichment and flag-state machine

  stores/
    settings.ts         — Zustand persist store for all user preferences (AppSettings)

  hooks/
    useSession.ts       — All session-scoped TanStack Query hooks
    useLocationChunks.ts — 5-min chunked location streaming with prefetch/eviction
    useTrackMap.ts      — Track outline derivation (GPS → SVG coordinate transform)
    useEventToasts.ts   — Playhead-driven toast queue
    useCatchupSummary.ts — "You skipped X events" catchup overlay
    useStandings.ts     — Season standings aggregation hook
    useCarDataWindow.ts — Sliding car-data window for leaderboard telemetry
    useAllCarDataWindow.ts — All-driver variant of the above
    useCarDataForLap.ts — Per-lap telemetry for the comparison page
    useCoarseTime.ts    — Throttled playhead for expensive renders
    useKeyboardShortcuts.ts — Global keyboard bindings
    useMediaQuery.ts    — Responsive breakpoint hook
    useSearchParamState.ts — URL search param ↔ React state bridge
    useTimelineUrlSync.ts — Keeps ?t= query param in sync with playhead
    useVerticalResize.ts — Drag-to-resize panels

  utils/
    color.ts            — teamColor() normaliser (OpenF1 omits leading #)
    identity.ts         — canonicalTeamName() deduplication
    live.ts             — isSessionLive() with ±30 min buffer
    pit.ts              — pitStopTime() helper
    raceControlFlags.ts — Flag severity, safety-car phase classification
    retirement.ts       — Retirement detection from race control
    session.ts          — Session utility helpers
    standings.ts        — computeStandings() pure function (testable)
    telemetry.ts        — resampleToAxis, computeDelta, smooth (signal processing)
    units.ts            — Metric/imperial conversion

  data/
    (circuit geometry and layout data files)

  pages/
    RaceWeekend.tsx     — Main page: track map + leaderboard + timeline
    Telemetry.tsx       — Lap telemetry comparison page
    Standings.tsx       — Season championship standings page
    Settings.tsx        — Redirect to settings modal
    NotFound.tsx, AppCrash.tsx

  components/
    (see Section 5)

  lib/
    queryPersister.ts   — IndexedDB-backed TanStack Query persister

  test/
    (shared test helpers / setup)
```

---

## 4. Data Flow

```
OpenF1 API
    ↓
api/client.ts (rate-limited fetch, dedup in-flight requests)
    ↓
api/endpoints.ts (typed wrappers)
    ↓
TanStack Query (staleTime:Infinity for historical, live-poll for active sessions)
    ↓  (cache persisted to IndexedDB between sessions)
hooks/ (useSession, useLocationChunks, useCarDataWindow…)
    ↓
timeline/ (clock advances t, events derived, interpolation applied)
    ↓
components/ (render to DOM; read settings from Zustand)
```

**Key invariant**: the playhead `t` is a _session-relative millisecond offset_ (not a UTC timestamp). UTC time = `sessionStartMs + t`. Everything in `timeline/` and the hooks works in session-relative ms to keep comparisons cheap.

---

## 5. Component Catalogue

| Component                                         | Purpose                                                                                  |
| ------------------------------------------------- | ---------------------------------------------------------------------------------------- |
| `TrackMap`                                        | Animated SVG track map: driver blobs, sector flags, follow-cam, compass, weather overlay |
| `LiveTiming`                                      | Real-time leaderboard: positions, intervals, mini-sectors, telemetry columns             |
| `PlaybackBar`                                     | Scrubber / speed controls / event chips                                                  |
| `RaceControl`                                     | Race control message feed                                                                |
| `TeamRadio`                                       | Audio player for team radio clips                                                        |
| `TelemetryChart`                                  | uPlot-based telemetry overlay (speed/throttle/brake/RPM/gear)                            |
| `GapChart`                                        | Recharts gap-to-leader chart                                                             |
| `LapChart`                                        | Lap time evolution chart                                                                 |
| `Strategy`                                        | Tyre strategy bar chart                                                                  |
| `FinalClassification`                             | End-of-race classification table                                                         |
| `KeyMoments`                                      | Timeline of significant events                                                           |
| `RaceChapters`                                    | Lap-range navigation chips                                                               |
| `Overtakes`                                       | Overtake event list                                                                      |
| `FlagBanner`                                      | Full-screen flag overlay (Safety Car, Red Flag, etc.)                                    |
| `QualifyingBanner`                                | Qualifying session elimination indicator                                                 |
| `StartingLights`                                  | Animated race-start lights sequence                                                      |
| `SessionInfoBar`                                  | Circuit name, session type, current lap                                                  |
| `SessionPicker`                                   | Year / meeting / session picker                                                          |
| `FocusedTelemetry`                                | Focused single-driver telemetry panel                                                    |
| `CatchupSummary`                                  | "You skipped X events" modal                                                             |
| `EventToast` (stack)                              | Bottom-right toast notifications                                                         |
| `SettingsModal`                                   | All user preferences                                                                     |
| `HowItWorksModal`                                 | Onboarding overlay                                                                       |
| `Nav` / `MobileNav`                               | Top nav bar / bottom mobile tabs                                                         |
| `ErrorBoundary` / `ErrorDisplay` / `ErrorMessage` | Error handling chain                                                                     |
| `DriverHeadshot`                                  | Lazy-loaded driver photo                                                                 |
| `AppLogo`                                         | Brand mark                                                                               |
| `Seo` / `RouteSeo`                                | Per-route `<head>` meta tags                                                             |
| `ResizeHandle`                                    | Drag handle for split-panel layouts                                                      |
| `Weather`                                         | Weather icon/badge overlay                                                               |

---

## 6. State Architecture

### 6a. Zustand stores

| Store         | File                 | Persisted?                       | Purpose                                                   |
| ------------- | -------------------- | -------------------------------- | --------------------------------------------------------- |
| `useTimeline` | `timeline/clock.ts`  | No                               | Playback state: `t`, `playing`, `speed`, `sessionStartMs` |
| `useSettings` | `stores/settings.ts` | Yes (localStorage via `persist`) | All `AppSettings` flags                                   |

### 6b. TanStack Query keys (convention)

```
["meetings", year]
["sessions", meetingKey]
["sessions-year", year]
["drivers", sessionKey]
["positions", sessionKey]
["intervals", sessionKey]
["laps", sessionKey, driverNumber?]
["stints", sessionKey]
["startingGrid", sessionKey]
["raceControl", sessionKey]
["teamRadio", sessionKey]
["weather", sessionKey]
["overtakes", sessionKey]
["sessionResult", sessionKey]
["championshipDrivers", sessionKey]
["championshipTeams", sessionKey]
["location-chunk", sessionKey, chunkIndex]
["car-data-window", sessionKey, dateGte, dateLte]
["car-data-all-window", sessionKey, dateGte, dateLte]
```

**Rules**: `staleTime: Infinity` for historical sessions; `staleTime: 0` + `refetchInterval: LIVE_POLL_FAST_MS | LIVE_POLL_SLOW_MS` for active sessions. Never manually invalidate historical queries.

---

## 7. Key Algorithms

### Location interpolation (`timeline/interpolate.ts`)

- GPS samples arrive at ~3.7 Hz from OpenF1.
- `buildIndex()` converts raw `{t, x, y}` points to typed arrays (`Float64Array` / `Float32Array`) — **zero heap alloc on every frame**.
- `interpolateXY(idx, t)` does a binary bisect + lerp, called at 60 fps × 20 drivers.
- `buildStepIndex` / `stepAt` serve discrete-update data (positions, intervals, weather).

### Chunked location streaming (`hooks/useLocationChunks.ts`)

- Session GPS is split into **5-minute chunks** (`CHUNK_MS = 300_000 ms`).
- Current + next chunk are always loaded; prefetch starts 60 s before the boundary.
- Eviction radius: 4 chunks either side of current position are retained; older chunks are garbage-collected.

### Rate limiter (`api/client.ts`)

- Sliding-window: max **3 req/s** and **30 req/min** (OpenF1 free tier limits).
- Concurrent identical GETs (same URL) are deduplicated via `inFlightJsonRequests` map.
- On HTTP 429 the client honours `Retry-After` with exponential backoff (up to `RATE_MAX_RETRIES`).

### Toast event queue (`timeline/events.ts`, `hooks/useEventToasts.ts`)

- `buildToastEvents()` merges laps, pits, race control, overtakes, team radio into a single sorted `ToastEvent[]`.
- `useEventToasts` advances forward through the array as `t` increases; on a backwards seek or large forward jump (`> JUMP_THRESHOLD_MS = 5 s`) the seen-set and queue are cleared.
- A `useCatchupSummary` hook fires when `t` jumps > 60 s, collecting all crossed events into a summary modal.

### Standing computation (`utils/standings.ts`)

- Pure function `computeStandings(sessions, results, info)` — deterministic, fully unit-tested.
- Trusts `SessionResult.points` when present (API value); derives from position table otherwise.
- Handles Sprint sessions with a separate `SPRINT_POINTS` table.

### Track map geometry (`hooks/useTrackMap.ts`)

- Preferred: static `circuitGeometry` data keyed by `circuit_key` (pre-processed SVG paths).
- Fallback: derive from first clean lap's GPS trace via convex hull + polyline simplification.
- Final transform: normalise coordinates into `TRACK_SVG_W × TRACK_SVG_H = 600 × 400` SVG viewport with `TRACK_SVG_PAD = 24` padding.

---

## 8. Conventions & Rules

### File conventions

- **Constants**: every magic number lives in `src/constants.ts`. Never inline a bare `300_000` — import the named constant.
- **API types**: never extend or re-define `api/types.ts` interfaces in component files. Derive local types via `Pick` / `Omit` / mapped types.
- **Pure utils**: functions in `utils/` and `timeline/` must be pure (no React imports). They are unit-tested in `*.test.ts` files alongside them.
- **Hooks**: all data-fetching hooks live in `hooks/`. Component files must not call `api.*` directly — always go through a hook.

### Naming

- Hook files: `useXxx.ts` (data hooks) or `useXxx.tsx` (when JSX is needed in tests only).
- Components: `PascalCase/PascalCase.tsx` under `components/`.
- Tests: co-located `*.test.ts` / `*.test.tsx` next to the module under test.

### Typing

- `strict: true` is enabled. Avoid `any` — prefer `unknown` + type guards.
- The `Driver.country_code` field is deprecated (use the JSDoc `@deprecated` tag for new deprecated fields).
- `Pit.pit_duration` is deprecated; prefer `lane_duration` then `stop_duration`.

### Styling

- Tailwind utility classes only. No CSS-in-JS. Custom tokens live in `tailwind.config.ts`.
- Dark mode is the default; `light` class on `<html>` activates light mode (toggled by `LightModeGate` in `App.tsx`).

### Testing

- Run: `yarn test` (Vitest + coverage). Watch mode: `yarn test:watch`.
- Pure utility functions must have unit tests. UI components use Testing Library.
- Coverage output goes to `coverage/`.

### Build

```bash
yarn dev          # Vite dev server
yarn build        # sitemap generation → tsc → vite build → route shells
yarn lint         # ESLint
yarn test         # Vitest with coverage
```

---

## 9. Live vs Historical Sessions

`isSessionLive(session)` returns `true` when `now` falls within `[date_start - 30 min, date_end + 30 min]`.

Live sessions:

- Use `refetchInterval` polling (fast: 15 s for timing-critical data, slow: 30 s for weather/radio).
- Skip IndexedDB persistence (`staleTime: 0` marks them stale on restore).
- Show real-time leaderboard updates.

Historical sessions:

- All queries have `staleTime: Infinity` — data never re-fetched once cached.
- Cache is persisted to IndexedDB (30-day window).
- Full replay scrubbing is available.

---

## 10. API Surface (OpenF1)

Base URL: `https://api.openf1.org/v1`

Endpoints used (all GET, JSON array response):

| Endpoint                | Key params                                        |
| ----------------------- | ------------------------------------------------- |
| `/meetings`             | `year`                                            |
| `/sessions`             | `meeting_key` or `year`                           |
| `/drivers`              | `session_key`                                     |
| `/location`             | `session_key`, `driver_number?`, `date>`, `date<` |
| `/car_data`             | `session_key`, `driver_number?`, `date>`, `date<` |
| `/laps`                 | `session_key`, `driver_number?`, `position>=`     |
| `/position`             | `session_key`                                     |
| `/intervals`            | `session_key`                                     |
| `/pit`                  | `session_key`                                     |
| `/stints`               | `session_key`                                     |
| `/race_control`         | `session_key`                                     |
| `/team_radio`           | `session_key`                                     |
| `/weather`              | `session_key`                                     |
| `/session_result`       | `session_key`                                     |
| `/starting_grid`        | `session_key`                                     |
| `/overtakes`            | `session_key`                                     |
| `/championship_drivers` | `session_key`                                     |
| `/championship_teams`   | `session_key`                                     |

Authentication: optional bearer token via `VITE_OPENF1_API_KEY` env var (`.env.local`). API is free-tier without a key.

---

## 11. Common Pitfalls for Agents

1. **Don't call `api.*` from components.** Use the hooks in `hooks/useSession.ts` (or create a new hook). Direct API calls bypass rate limiting and caching.
2. **`t` is session-relative ms, not UTC.** To get UTC: `sessionStartMs + t`. Mixing the two causes off-by-many-hours bugs in date filters.
3. **`team_colour` from OpenF1 lacks a `#` prefix.** Always use `teamColor()` from `utils/color.ts`.
4. **`team_name` from OpenF1 is not canonical** (varies across sessions). Use `canonicalTeamName()` from `utils/identity.ts` before grouping/comparing.
5. **`pit_duration` is deprecated** for sessions after the 2024 US GP. Use `lane_duration ?? pit_duration`.
6. **Rate limiter is automatic** — do not add manual `setTimeout` delays around API calls. The client queue handles ordering.
7. **IndexedDB persister serialises the full query cache.** Avoid storing non-serialisable values (functions, class instances) in query data.
8. **`Float32Array` coords in `LocationIndex`** have reduced precision vs JS `number`. This is intentional for performance. Do not convert back to `number[]` arrays in hot paths.
9. **`SPEEDS`** (`[1,2,4,8,16]`) and `MAX_FRAME_STEP_MS` (`250`) are the only safe values for playback. Do not introduce arbitrary speed multipliers.
10. **SEO routes** are generated at build time from `seo-routes.json`. Add new deep-linkable pages to this file and run `yarn generate:sitemap`.
