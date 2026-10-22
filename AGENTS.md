# F1 Replay — Agent Documentation

> Last updated: 2026-10-22  
> The single source of truth for agents. Provides concise, agent-readable architecture notes, conventions, and guardrails. `docs/` holds mostly historical plans — see Section 12 before trusting one.

---

## 0. Quick Lookup — "where do I change X?"

| Task                                              | Start here                                                                                   |
| ------------------------------------------------- | -------------------------------------------------------------------------------------------- |
| Add/modify an OpenF1 call                         | `api/types.ts` → `api/endpoints.ts` → a hook in `hooks/useSession.ts` (never call `api.*` from a component) |
| Tune a number (speed, poll rate, size, timeout)   | `src/constants.ts` (grep the name; every magic number lives here)                            |
| Add a user setting                                | `stores/settings.ts` (`AppSettings`, defaults, `migrateSettings`) + `components/SettingsModal` |
| Main replay page layout / wiring                  | `pages/RaceWeekend.tsx` (~3000 lines — grep, don't read whole)                               |
| Playback, seek, speed                             | `timeline/clock.ts` (`useTimeline`), `components/PlaybackBar`                                |
| Car positions on the map                          | `hooks/useLocationChunks.ts` → `timeline/interpolate.ts` → `components/TrackMap`             |
| Track outline / circuit geometry                  | `data/circuitGeometry.ts` (+ `circuit-geometry/<circuitKey>-<year>.json`), `hooks/useCircuitGeometry.ts`, `hooks/useTrackMap.ts` |
| 3D map                                            | `components/TrackMap3D/` (Section 7 "3D map rendering"), `utils/georef.ts`                   |
| Ring view                                         | `components/TrackRing/`, `utils/lapProgress.ts`                                              |
| Toasts / catch-up                                 | `timeline/events.ts`, `hooks/useEventToasts.ts`, `hooks/useCatchupSummary.ts`                |
| Race control / flags                              | `timeline/raceControl.ts`, `utils/raceControlFlags.ts`                                       |
| Side-panel feeds (RC, radio, pits, passes…)       | `components/CommentaryPanels/` (tabs: `rc` `radio` `pits` `passes` `moments` `chapters` `weather`) |
| Live sessions                                     | `utils/live.ts`, polling in `hooks/useSession.ts`, MQTT push in `hooks/useOpenF1LiveMqtt.ts` |
| Standings / profiles                              | `hooks/useStandings.ts`, `utils/standings.ts`, `utils/championship.ts`, `pages/Standings.tsx` |
| Telemetry comparison                              | `pages/Telemetry.tsx`, `components/TelemetryChart`, `components/CornerAnalysis`, `utils/telemetry.ts` |
| SEO / new route                                   | `routes.tsx`, `seo-routes.json`, `components/Seo/seo.ts` (Pitfall 10)                        |
| Analytics event                                   | `lib/analytics.ts` (`trackEvent`) + document it in `docs/ANALYTICS_EVENTS.md`                |
| Errors / Sentry                                   | `lib/sentry.ts` (lazy facade), `utils/ignorableErrors.ts`, `components/ErrorBoundary`        |
| App tour                                          | `components/AppTour/` (`steps.ts`, `targets.ts`), `TOUR_VERSION` (Pitfall 15)                |
| Proxy cache behaviour                             | `proxy/src/index.ts`, `proxy/README.md` (TTL table)                                          |
| Circuit data refresh                              | `scripts/*.mjs`, `.github/workflows/update-circuits.yml` (Pitfall 13)                        |

Tests sit next to the module (`foo.ts` → `foo.test.ts`); broad smoke/coverage tests are in `components/__tests__/`.

---

## 1. Project Overview

**f1-replay** is a React + TypeScript SPA that streams live and historical Formula 1 telemetry from the [OpenF1 public API](https://openf1.org/) and renders an interactive replay timeline. The app is deployed as a static site (Vite build → GitHub Pages, domain `f1replay.app` via `public/CNAME`). API requests go through a Cloudflare Worker proxy (`proxy/`, `https://proxy.f1replay.app/v1`) that caches OpenF1 responses in KV.

**Core value proposition**: scrub through any F1 session like a replay video — track map with animated car positions, live timing leaderboard, race control messages, telemetry comparison, and standings.

---

## 2. Tech Stack

| Layer             | Choice                                                       |
| ----------------- | ------------------------------------------------------------ |
| UI framework      | React 18                                                     |
| Language          | TypeScript 5.6 (strict)                                      |
| Routing           | React Router v6                                              |
| Server state      | TanStack Query v5                                            |
| Cache persistence | TanStack per-query persister (`experimental_createQueryPersister`) → IndexedDB |
| Client state      | Zustand v5                                                   |
| Styling           | Tailwind CSS v3                                              |
| Charts            | Recharts (standings/gap charts), uPlot (high-freq telemetry) |
| 3D map            | Mapbox GL JS v3 (lazy chunk, opt-in, needs `VITE_MAPBOX_TOKEN`) |
| Icons             | Lucide React                                                 |
| Animation         | anime.js via `lib/motion.ts` (honours `prefers-reduced-motion`) |
| Guided tour       | react-joyride v3                                             |
| Live push         | `mqtt` over WSS (OpenF1 MQTT, optional credentials)          |
| Monitoring        | Sentry (`@sentry/react`, lazy-loaded), GA4 (`lib/analytics.ts`) |
| Fonts             | Fontsource Inter + JetBrains Mono                            |
| API proxy         | Cloudflare Worker + KV (`proxy/`, deployed with wrangler)    |
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
    client.ts           — fetchEndpoint, OpenF1Error, rate-limiter (RATE_MAX_PER_SECOND / _PER_MINUTE), base URL from VITE_OPENF1_API_BASE
    endpoints.ts        — Typed api.* surface for every OpenF1 endpoint
    types.ts            — Pure TypeScript interfaces mirroring the OpenF1 schema
    circuitFactsLookup.ts — Static circuit metadata keyed by circuit_key

  timeline/
    clock.ts            — RAF-based playback clock (Zustand store: useTimeline)
    events.ts           — Toast event normalisation (radio, flag, pit, overtake…)
    interpolate.ts      — Typed-array binary search + linear interpolation for location
    raceControl.ts      — Race control event enrichment and flag-state machine
    startLights.ts      — Start-light sequence state for the track-map badge
    director.ts         — TV-camera shot picker for the 3D map (overtake > pit > battle > leader)

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
    useStartLightsSound.ts — Race-start light beeps (public/sounds/start-light.mp3, synth fallback)
    useVerticalResize.ts — Drag-to-resize panels
    useAutoStartTour.ts — Opens the app tour on a first visit (per `TOUR_VERSION`, never on `?t=` links)
    useCircuitGeometry.ts — Lazy-loads baked circuit geometry JSON (static asset, bypasses the query cache)
    useOpenF1LiveMqtt.ts — Live sessions: OpenF1 MQTT topics → `setQueryData` into the polling queries' cache
    useAudioProgress.ts — 0–1 progress of an <audio> element (radio clips)
    useReleaseDate.ts   — Shared GitHub latest-release date (footer, About dialog)
    queryKeys.ts        — Shared query-key builders (`lapsQueryKey`)

  utils/
    color.ts            — teamColor() normaliser (OpenF1 omits leading #)
    identity.ts         — canonicalTeamName() deduplication
    live.ts             — isSessionLive() with ±30 min buffer
    pit.ts              — pitStopTime() helper
    pitRejoin.ts        — Pit-loss parsing, gap-to-leader snapshot, pit rejoin position projection
    raceControlFlags.ts — Flag severity, safety-car phase classification
    retirement.ts       — Retirement detection from race control
    session.ts          — Session utility helpers
    standings.ts        — computeStandings(), completed-session + wins/podiums tallies
    championship.ts     — Points progression, per-race results grid, title-outlook maths, teammate head-to-heads
    driverProfile.ts    — driverSeasonStats(), finishDistribution(), championshipPositions() for the driver profile
    constructorProfile.ts — constructorSeasonStats() (all cars per round), round points, constructorPath()
    telemetry.ts        — resampleToAxis, computeDelta, smooth (signal processing)
    lapProgress.ts      — Lap fraction by projecting onto an outline (windowed search), ring arcs, ring label layout
    corners.ts          — buildCornerZones(): braking→exit corner zones for telemetry charts
    cornerAnalysis.ts   — Per-corner metrics, lap alignment to timing lines, segment time deltas
    lapContext.ts       — tyreForLap(): compound + tyre age for a driver's lap
    units.ts            — Metric/imperial conversion
    georef.ts           — F1 frame ↔ WGS84: similarity fit (Umeyama + ICP) and projection for the 3D map
    pitLane.ts          — Pit-lane path extraction from a GPS trace (used by scripts/fetch-pit-lanes.mjs)
    sortedTime.ts       — Binary-search helpers over time-sorted arrays (lastAtOrBefore, windowBoundsByValue)
    driverTimeIndex.ts  — buildDriverTimeIndex(): per-driver, time-sorted series for per-frame lookups
    lapLookup.ts        — buildLapLookup(): lap number at a given time
    ignorableErrors.ts  — Filters browser noise (opaque "Script error.", cross-origin frames) from logging

  data/
    circuitGeometry.ts  — Loader for circuit-geometry/<circuitKey>-<year>.json (import.meta.glob, lazy; generated by scripts/fetch-circuits.mjs)
    circuitGeometryTypes.ts — CornerInfo, MarshalSector, MarshalLight, PitLoss types
    circuits.ts         — Coarse fallback layouts (sectors, DRS zones) via getCircuitLayout()
    circuit-georef.json — Baked F1-frame → lng/lat fit per geometry file (`node scripts/fetch-georef.mjs`)
    circuitGeoref.ts    — getCircuitGeoref(): lookup matching the resolved geometry year
    pit-lanes.json      — Baked pit-lane paths (F1 frame) per circuit_key (`node --use-system-ca scripts/fetch-pit-lanes.mjs`)
    pitLanes.ts         — getPitLane(circuitKey)

  pages/
    RaceWeekend.tsx     — Main page: track map + leaderboard + timeline
    Telemetry.tsx       — Lap telemetry comparison page
    Standings.tsx       — Season championship standings page
    DriverProfile.tsx   — /standings/driver/:driverNumber — one driver's season (keeps ?year/&session)
    ConstructorProfile.tsx — /standings/team/:teamName (canonical name, `constructorPath()`) — one team's season
    Settings.tsx        — Redirect to settings modal
    Privacy.tsx, Terms.tsx — Static legal pages
    NotFound.tsx, AppCrash.tsx

  components/
    (see Section 5)

  lib/
    queryPersister.ts   — Per-query IndexedDB persister (lazy restore, structured clone, idle GC)
    queryPersistencePolicy.ts — shouldPersistQueryKey(): which keys are persisted (not location/car-data windows)
    audio.ts            — Shared Web Audio context, beep(), and cached loadSample()/playSample()
    analytics.ts        — GA4 trackEvent() (loaded when idle; events listed in docs/ANALYTICS_EVENTS.md)
    sentry.ts / sentrySdk.ts — Lazy Sentry facade (calls queued until the SDK chunk loads; no-op in dev/tests)
    appVersion.ts       — VITE_APP_VERSION formatting, GitHub releases URLs
    idle.ts             — runWhenIdle(), loadScriptOnce()
    motion.ts           — anime.js presets (fadeUp, modal, tab swap…), prefersReducedMotion()

  test/
    setup.ts            — Vitest/jsdom setup
```

Outside `src/`:

```
proxy/                  — Cloudflare Worker: OpenF1 proxy + KV cache (own package.json, wrangler.toml; TTL table in proxy/README.md)
scripts/                — Node build/bake scripts: sitemap + route shells + SEO validation, circuit/georef/pit-lane bakes,
                          warm-proxy-cache.mjs, resolve-release-version.mjs
public/                 — Static assets: sounds/, models/f1-car.glb, og-cover.png/svg, CNAME
seo-routes.json         — Route list for sitemap, shells and <head> meta
.github/workflows/      — ci (validate SEO, tsc, lint, test, build on PRs/main), deploy (GitHub Pages), deploy-proxy (Worker),
                          versioning (tags + release notes), warm-cache (hourly on race weekends), update-circuits (weekly)
.husky/pre-commit       — runs `yarn lint && yarn test && yarn build` (slow; expect it on every commit)
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
| `TrackMap`                                        | Animated SVG track map: driver blobs, sector flags, follow-cam, compass, weather overlay, status badges (start lights, SC/VSC, chequered flag), pit rejoin projection for the focused driver (baked `pitLoss`, races only). `TrackMap.tsx` orchestrates; memoized SVG layers in `layers/`, HTML overlays in `overlays/`, pure derivations in `trackGeometry.ts` / `statusBadges.ts` |
| `TrackRing`                                       | Ring view (third map mode, `mapViewMode: "ring"`): every circuit as a dial spaced by lap time (reference lap profile, `lapTimeProfile.ts`), start/finish at 12 o'clock; gap labels, pit window for the focused car, pit-lane cars on an inner arc, lap/status/reference lap in the centre. Pure model in `ringModel.ts` (lap/pit paths, sector boundaries, corner ticks, `placeCar`, `toDisplay`, `layoutRingCars`, `formatRingGap`); SVG layers in `RingLayers.tsx`. Reuses the 2D map's outline, overlays and toolbar (`extraButtons` for gap mode / time spacing / flip) |
| `TrackMap3D`                                      | Opt-in Mapbox 3D map (Standard style, optional terrain), desktop and mobile. `TrackMap3D.tsx` owns the map and one RAF loop (cars, trail, camera); pure builders: `mapFeatures.ts` (track, flags), `trackSurface.ts` (asphalt/verge/kerb/pit/start-grid polygons; layers in `surfaceLayers.ts`), `carLayers.ts` (2D-identical car icons drawn on canvas + CC0 3D models), `trackOverlays.ts` (start/finish, S1/S2, arrows, heat/delta/elevation gradients, pit ghost, trail), `atmosphere.ts` (sun-based light preset, rain), `cameraModes.ts` (follow / chase / orbit). Layers in `overlayLayers.ts`; gate with `availability.ts` (token + WebGL2). `?debug=map3d` logs per-frame cost |
| `LiveTiming`                                      | Real-time leaderboard: positions, intervals, mini-sectors, telemetry columns             |
| `PlaybackBar`                                     | Scrubber (race-control, race-start and chequered-flag markers) / speed controls / chips |
| `RaceControl`                                     | Race control message feed                                                                |
| `TeamRadio`                                       | Audio player for team radio clips                                                        |
| `RadioAudio`                                      | Shared radio `<audio>`: plays `public/sounds/radio-intro.mp3` chime, then the clip       |
| `TelemetryChart`                                  | uPlot-based telemetry overlay (speed/throttle/brake/RPM/gear)                            |
| `GapChart`                                        | Recharts gap-to-leader chart                                                             |
| `CornerAnalysis`                                  | Telemetry page: per-corner speeds/brake/throttle + time gained/lost per lap segment      |
| `LapChart`                                        | Lap time evolution chart                                                                 |
| `Strategy`                                        | Tyre strategy bar chart                                                                  |
| `FinalClassification`                             | End-of-race classification table                                                         |
| `KeyMoments`                                      | Timeline of significant events                                                           |
| `RaceChapters`                                    | Lap-range navigation chips                                                               |
| `Overtakes`                                       | Overtake event list                                                                      |
| `FlagBanner`                                      | Full-screen flag overlay (Safety Car, Red Flag, etc.)                                    |
| `QualifyingBanner`                                | Qualifying session elimination indicator                                                 |
| `SessionInfoBar`                                  | Circuit name, session type, current lap                                                  |
| `SessionPicker`                                   | Year / meeting / session picker                                                          |
| `FocusedTelemetry`                                | Focused single-driver telemetry panel                                                    |
| `CatchupSummary`                                  | "You skipped X events" modal                                                             |
| `EventToast` (stack)                              | Bottom-right toast notifications                                                         |
| `SettingsModal`                                   | All user preferences                                                                     |
| `HowItWorksModal`                                 | Onboarding overlay; "Take the tour" starts `AppTour` (navigates to `/` first, keeping the session) |
| `AppTour`                                         | react-joyride v3 guided tour of the replay page, lazy-mounted by `RaceWeekend` while `isTourOpen` and the session has loaded. Steps (`steps.ts`, `buildTourSteps`) differ for desktop/phone, races and 3D availability; targets are `data-tour` attributes named in `targets.ts` (`visibleTourTarget` for the map view buttons, which the hidden phone Track tab can also render); custom `TourTooltip`. Finishing/skipping saves `tourSeenVersion = TOUR_VERSION` (kept by settings reset). While open: playback paused (not live), toasts hidden, shortcuts off, view forced to Driver Tracker |
| `Nav` / `MobileNav`                               | Top nav bar / bottom mobile tabs                                                         |
| `ErrorBoundary` / `ErrorDisplay` / `ErrorMessage` | Error handling chain                                                                     |
| `DriverHeadshot`                                  | Lazy-loaded driver photo                                                                 |
| `AppLogo`                                         | Brand mark                                                                               |
| `Seo` / `RouteSeo`                                | Per-route `<head>` meta tags + JSON-LD from `seo-routes.json` (helpers in `Seo/seo.ts`); data-driven pages (driver/team profiles) override via `hooks/usePageSeo.ts` |
| `ResizeHandle`                                    | Drag handle for split-panel layouts                                                      |
| `Weather`                                         | Weather icon/badge overlay                                                               |
| `PointsProgressionChart`                          | Cumulative championship points per round (Standings → Progression)                       |
| `TitleOutlookBanner`                              | "N drivers in contention / X clinched" summary above the standings tables                |
| `TeammateComparison`                              | Qualifying / race / points head-to-heads per team (Standings → Teammates)                |
| `ResultsGrid`                                     | Drivers × rounds finishing positions/points, colour-coded (Standings → Results)          |
| `DriverProfile`                                   | Driver profile page pieces: stat tiles, finish distribution, round-by-round results (quali → finish → championship position) |
| `MaybeLink`                                       | Router `Link` when `to` is set, plain `<span>` otherwise. Shared standings components take optional `driverHref` / `teamHref` / `href` / `raceHref` props and only link when given them (their tests need no router). `raceHref` uses `roundReplayPath()` (`utils/url.ts`) → `/?year&meeting&session&view=tracker&focus=` |
| `ConstructorProfile`                              | Team profile page pieces: stat tiles (1-2s, double points…), driver line-up with points share, per-car round results |
| `CommentaryPanels`                                | Tabbed side panel (`CommentaryTab`: rc / radio / pits / passes / moments / chapters / weather); lazy-loads each feed. `keyMoments.ts` builds Key Moments, `CommentaryJumpButton` seeks to an item |
| `Pits` (`PitFeed`)                                | Pit stop feed (commentary "pits" tab)                                                    |
| `TyreChange`                                      | Old compound + laps → new compound + age; `compact` variant for inline text              |
| `LiveDataNotice`                                  | Dismissible notice that live timing needs paid OpenF1 access (`dismissal.ts` store)      |
| `AboutDialog`                                     | Mobile About dialog: version, release date, Privacy/Terms links                          |
| `TooltipCard`                                     | Shared tooltip card styling                                                              |

---

## 6. State Architecture

### 6a. Zustand stores

| Store         | File                 | Persisted?                       | Purpose                                                   |
| ------------- | -------------------- | -------------------------------- | --------------------------------------------------------- |
| `useTimeline` | `timeline/clock.ts`  | No                               | Playback state: `t`, `playing`, `speed`, `sessionStartMs`, `realTimeWindow` (span forced to 1x, e.g. race start lights) |
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
["pits", sessionKey]
["carDataWindow", sessionKey, driverNumber, windowIndex]
["allCarDataWindow", sessionKey, windowIndex]
["carDataForLap", sessionKey, driverNumber, lapNumber]
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

- Sliding-window: `RATE_MAX_PER_SECOND` / `RATE_MAX_PER_MINUTE` (currently 2 req/s, 25 req/min — under OpenF1's free-tier 3/30).
- Responses served from the proxy cache (`X-Cache: EDGE | KV`, exposed via CORS) give their slot back, so cached data isn't throttled; only misses count. The queue is FIFO — hooks subscribed first fetch first.
- Concurrent identical GETs (same URL) are deduplicated via `inFlightJsonRequests` map.
- On HTTP 429 the client honours `Retry-After` with exponential backoff (up to `RATE_MAX_RETRIES`).

### Toast event queue (`timeline/events.ts`, `hooks/useEventToasts.ts`)

- `buildToastEvents()` merges laps, pits, race control, overtakes, team radio into a single sorted `ToastEvent[]`.
- `useEventToasts` advances forward through the array as `t` increases; on a backwards seek or large forward jump (`> JUMP_THRESHOLD_MS = 5 s`) the seen-set and queue are cleared.
- A `useCatchupSummary` hook fires when `t` jumps > 60 s, collecting all crossed events into a summary modal.

### Corner analysis (`utils/cornerAnalysis.ts`, `components/CornerAnalysis`)

- Telemetry distance is integrated from speed, so it drifts per lap. `alignLap()` anchors each lap at the timing lines it crosses (lap start extrapolated from the first sample, official S1/S2 lines, finish) and rescales piecewise onto the reference lap (Driver A = chart axis). Segment deltas therefore sum exactly to the official lap-time gap.
- `buildLapSegments()` tiles the lap into straights + corner zones (from `buildCornerZones`); `segmentDeltas()` gives time gained/lost per segment (+ = slower than reference).
- `analyzeCornerZone()` reports entry/min/exit speed, braking point (short brake-signal dropouts bridged, `CORNER_BRAKE_GAP_M`) and return to full throttle, relative to the reference lap's slowest point.
- Clicking a corner calls `focusTelemetryCharts()` (`components/TelemetryChart/sync.ts`) to zoom every chart.

### Standing computation (`utils/standings.ts`)

- Pure function `computeStandings(sessions, results, info)` — deterministic, fully unit-tested.
- Trusts `SessionResult.points` when present (API value); derives from position table otherwise.
- Handles Sprint sessions with a separate `SPRINT_POINTS` table.
- `useStandings` only considers finished Race/Sprint sessions, fetches one `session_result` per round (shared `["sessionResult", key]` cache) for wins/podiums and the progression chart, and fetches main-qualifying results only when the Teammates tab is open.
- Title outlook (`utils/championship.ts`): remaining points = 25 per GP (+1 fastest lap up to `FASTEST_LAP_POINT_LAST_YEAR`) and 8 per Sprint (double the top-two slots for teams). A rival who can only draw level stays a contender (countback).

### Ring view (`utils/lapProgress.ts`, `components/TrackRing/`)

Inspired by MultiViewer's "Circle of Doom": a dial spaced by **time**, so the angle between two cars is their gap and a pit stop is a fixed slice of the circle.

- Each car's interpolated position is projected onto the nearest outline *segment* (not vertex) of the 2D map's outline → lap (distance) fraction 0–1. The last matched segment per car is the next search hint (±`RING_SEARCH_WINDOW` segments), which also keeps cars on their own stretch where a track crosses itself; a match further than `RING_OFF_TRACK_M` falls back to a full scan.
- Time spacing (`mapRingTimeScale`, default on; `lapTimeProfile.ts`): every `RING_REF_REFRESH_MS` of playhead, each car's last `RING_REF_TRACE_WINDOW_MS` is traced and its latest full lap (two start-line crossings, no pit samples or data gaps) kept; laps within `RING_REF_LAP_SPREAD` of the fastest are averaged into a distance → time-fraction profile. A much slower new profile (safety car) doesn't replace the last good one nearby in time. Before the first full lap the dial is spaced by distance. `toDisplay` / `displayArc` (`ringModel.ts`) apply the profile and the flip (`mapRingReverse`) to everything drawn: cars, corners, sectors, pit lane.
- Pit lane: a car more than 5 m off the line and closer to the baked pit-lane path (`data/pitLanes.ts`) than to the track goes on the inner arc, at `entry + laneFraction × span`. Without a baked path, cars > `RING_OFF_TRACK_M` off the line drop to a dashed inner circle. Never on the coarse `layout` fallback outline (not to scale).
- Races: labels carry the gap to the car ahead or the leader (`mapRingGapMode`, toolbar toggle; `formatRingGap`). Only `RaceWeekend`'s current leader (position timeline) reads LEAD — OpenF1 reports several cars at 0 s during pit cycles, and those stale zeros are also dropped before the pit rejoin projection.
- Pit window (focused car, races, `mapShowPitRejoin`): ghost at the car's time fraction − pit loss / reference lap, with the projected position from `pitRejoinView`.
- Centre: lap counter, track status chip, reference lap time.
- Labels are spread with 1D cluster merging (`layoutRingLabels`), cut at the widest empty stretch so 12 o'clock isn't special; pit cars' labels go inside.
- Sector 2/3 start at their first marshal post (as the 3D map), equal thirds without posts.
- `mapViewMode` (`"2d" | "3d" | "ring"`) replaced the `mapView3d` boolean; `migrateSettings` (persist v1) maps old values.

### 3D map georeferencing (`utils/georef.ts`, `scripts/fetch-georef.mjs`)

- The F1 frame is decimetres, roughly east/north, but each circuit is turned by up to ±2.5° — a fixed transform is 2–7× worse than a per-circuit fit.
- The bake fits each centerline onto a bacinger/f1-circuits trace — picked automatically as the best quick fit among traces of similar length (±20 %) — via best cyclic shift × direction × Y-flip, then ICP. Default is a pinned bacinger commit; `--latest` (scheduled job) uses master, and the file is only rewritten when a fit changes. Fits over 6 m RMS / 25 m max are dropped (3D hidden for that circuit). Current fits: 1.2–5.1 m RMS.
- Runtime: `[e, n] = scale·R(rotation)·[x, ±y] + t`, then a local equirectangular step to lng/lat. Map bearing for the broadcast view = baked `rotation` + frame rotation.

### 3D map rendering (`components/TrackMap3D/`)

- Cars match the 2D `CarMarker`: every size is in 2D SVG units × the 2D map's own px/unit (`carScaleFor`, ×3 while following like the 2D follow cam). Icons are canvas-drawn per look (`ensureCarIcons`) and rendered as symbols so 3D buildings never hide them; from zoom 15 a team-tinted 3D model takes over. Icons get a blurred ground shadow (`CAR_SHADOW_LAYER`, map-aligned circle, `MAP3D_CAR_SHADOW_*`) that fades out with them; the models cast real shadows from the Standard style's light.
- Car updates use back-pressure (`carSync.ts`): a new `setData` goes out only once the previous one is on screen (a car-source tile `sourcedata` event, or `MAP3D_CAR_SYNC_TIMEOUT_MS`), never on a timer — each update takes two worker round trips, and timed sends queued up into late, bursty cars. The camera aims at the instant actually on screen (`cameraTime`), not the playhead or the last send, so the followed car doesn't shake (and at 16× the chase camera can't overtake it). `?debug=map3d` logs car updates/s and latency. Smoothing uses `frameAlpha` so slow devices don't trail.
- The track surface is real-width polygons built by offsetting the centerline in metres (`trackSurface.ts`): 15 m asphalt, 2.4 m verge, 6 m pit lane, 2.5 m kerbs in 2 m red/white blocks on the inside of every stretch that turns (`kerbRuns`: heading change over ±40 m, smoothed ±30 m, > 14°), a 0.4 m white edge line inside each asphalt edge, 18 m gravel run-off beyond the verge on the outside of every kerb run (±30 m, same-side runs merged by `runoffRuns`; none on the street circuits in `MAP3D_NO_RUNOFF_CIRCUITS`), and a 6×3 chequered start grid. Edge directions are averaged over ±12 m so offsets don't kink where the 5 m-spaced source line bends. Flags are painted onto the asphalt (`buildFlagZones`, one polygon per marshal post, feature state shared with the zoomed-out line glow), plus the 2D map's sector flag colours (`buildSectorZones` + `surfaceLayers.addSectorLayers`): a condition ribbon under the asphalt per timing sector (green 0.24 when clear, flag colour 0.5; enhanced visuals only) and a flag wash on flagged sectors, both driven by `projectToTimingSectors`. Sector extents come from the marshal posts via `timingSectorForMarshalPost` (equal thirds without posts), and the S1/S2 markers sit on those boundaries. Every strip polygon is checked and split if it would self-intersect (`stripPolygons`); inside offsets are capped at 90 % of the local turn radius. Colours and emissive strength follow the light preset (`MAP3D_TRACK_PALETTE`, values from formula1dashboard.com's Standard-style setup). Below zoom 13.5 the line track shows instead (`fadeIn`/`fadeOut`).
- 3D settings live in their own "3D Map" section (`mapView3d*` in `stores/settings.ts`): flag colours on track (also needs the shared `mapShowSectorFlags`), sector condition ribbon, weather effects (rain from the `weather` prop, independent of the weather panel), session time-of-day lighting, 3D buildings (`show3dObjects`), 3D car models (off keeps 2D-style markers at every zoom), terrain. The weather panel and track clock are shared with 2D (`mapShowWeather`, `mapShowClock`).
- Terrain is off by default (setting `mapView3dTerrain`, true-scale when on): the DEM is ~10 m/cell, so at street zoom buildings and the draped track look melted over it.
- The map container has its own ResizeObserver → `map.resize()`; Mapbox alone can keep a canvas size measured mid-layout.
- The focused car's 8 s trail is coloured by speed (2D speed-heat colours; setting `mapView3dSpeedTrail`): `speedLookup` turns the focused car-data window (shared with the HUD) into a typed-array lookup once per data change, and the RAF loop rebuilds `trailSpeedGradient` with each 10 Hz trail refresh. Samples with no car data nearby (`MAP3D_TRAIL_SPEED_MAX_GAP_MS`, e.g. just after a chunk boundary) take the team colour.
- Battle gap ribbons (races, setting `mapView3dBattleGaps`): `RaceWeekend` pairs each car within 1 s with the car ahead (`battlePairs` + `battleGaps` on `latestIntervalSeconds`, the same parse that feeds the battle rings) and passes `battleGaps`; the RAF loop redraws `buildGapRibbons` with the 10 Hz trail refresh — a gold line along the centerline from chaser to car ahead with the interval at its middle. Focused car: only its battles. Ribbons over `MAP3D_GAP_RIBBON_MAX_M` are dropped.
- Telemetry overlays reuse the 2D builders via `buildArcPolyline` (lng/lat in `svgPts`) and render as one `line-gradient` line each (no per-segment joints).
- Lighting follows the sun at the circuit (`lightPresetAt`, setting `mapView3dSessionLighting`), so night races are night even in light theme.
- Camera modes cycle follow → chase → onboard → orbit (→ TV in races). Onboard (`onboardPose`, `MAP3D_ONBOARD_*`) is a T-cam 7 m behind / 3 m up looking 45 m ahead, with its heading taken over a window centred on the camera instant so it points into corners. Close-up modes (chase/onboard with a focused car, and TV) show a `MiniMap` inset bottom-right (`miniMapProjection.ts`: same Y-flip + −`rotation` as the 2D map).
- The camera mode is in the URL as `?cam=` (with `?focus=` and `?t=`, a link opens the same view); `RaceWeekend` owns the param and passes `initialCameraMode` / `onCameraModeChange`. `?cam=tv` before the director data loads (or outside a race) just follows the focused car.
- Rain (`mapView3dWeatherEffects`) also darkens the asphalt (`MAP3D_TRACK_WET_PALETTE`, more emissive = wet sheen under floodlights) and replaces the style's fog with a haze that closes in with intensity (`rainFogFor`, `MAP3D_RAIN_FOG*`); the style's own fog is saved and restored when it dries.
- TV camera (races only): `timeline/director.ts` picks the shot — overtake (cut 10 s before it's recorded) > pit stop > front-most battle (< 1 s) > leader — and `TrackMap3D` follows it with chase (overtake/battle) or follow (pit/leader), cutting instead of panning; each cut flashes a black veil that fades out over `MAP3D_DIRECTOR_FADE_MS` (DOM-driven, skipped for `prefers-reduced-motion`). Shots are held ≥ `DIRECTOR_MIN_SHOT_MS` of *wall-clock* time (so 16× doesn't strobe) and long battle/leader shots rotate after `DIRECTOR_MAX_SHOT_MS`. It never changes the app's focused driver (no extra car-data fetches); picking a car switches back to follow.
- Each `new mapboxgl.Map` is a billed load (`trackmap3d_map_load`); the map is kept while the circuit stays the same.
- The car model is Kenney's CC0 Car Kit `race.glb` with its texture packed in: `public/models/f1-car.glb` (licence alongside).

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
- `useOpenF1LiveMqtt` (mounted by `RaceWeekend`) subscribes to OpenF1 MQTT topics (`v1/position`, `v1/intervals`, `v1/laps`, `v1/race_control`, `v1/team_radio`, `v1/weather`, `v1/overtakes`) and merges rows into the same query keys via `setQueryData` (capped at `LIVE_MQTT_MAX_ROWS`). Needs `VITE_OPENF1_MQTT_*` credentials; polling remains the fallback. MQTT-only data is not persisted (Pitfall 7).

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

### Environment variables (`.env.example` → copy to `.env.local`)

| Variable                                                                 | Purpose                                                          |
| ------------------------------------------------------------------------ | ---------------------------------------------------------------- |
| `VITE_OPENF1_API_BASE`                                                   | API base; unset = `api.openf1.org/v1`, production = the proxy    |
| `VITE_OPENF1_API_KEY`                                                    | Optional bearer token                                            |
| `VITE_OPENF1_MQTT_WSS_URL` / `VITE_OPENF1_MQTT_USERNAME` / `VITE_OPENF1_MQTT_TOKEN` | Live MQTT push (optional)                             |
| `VITE_MAPBOX_TOKEN`                                                      | Public Mapbox token; unset hides the 3D map                      |
| `VITE_SENTRY_DSN`                                                        | Sentry (disabled on localhost regardless)                        |
| `VITE_GA_MEASUREMENT_ID`                                                 | GA4 (see `docs/ANALYTICS_EVENTS.md`)                             |
| `VITE_APP_VERSION`                                                       | Release string (set by CI from `versioning.yml`)                 |

A local `yarn build` uploads source maps to Sentry when `.env.sentry-build-plugin` is present — use `yarn test` / `tsc -b` to verify changes instead of building.

---

## 11. Common Pitfalls for Agents

1. **Don't call `api.*` from components.** Use the hooks in `hooks/useSession.ts` (or create a new hook). Direct API calls bypass rate limiting and caching.
2. **`t` is session-relative ms, not UTC.** To get UTC: `sessionStartMs + t`. Mixing the two causes off-by-many-hours bugs in date filters.
3. **`team_colour` from OpenF1 lacks a `#` prefix.** Always use `teamColor()` from `utils/color.ts`.
4. **`team_name` from OpenF1 is not canonical** (varies across sessions). Use `canonicalTeamName()` from `utils/identity.ts` before grouping/comparing.
5. **`pit_duration` is deprecated** for sessions after the 2024 US GP. Use `lane_duration ?? pit_duration`.
6. **Rate limiter is automatic** — do not add manual `setTimeout` delays around API calls. The client queue handles ordering.
7. **Each query is persisted to IndexedDB individually** (structured clone, restored lazily inside its queryFn; `queryPersistencePolicy.ts` excludes location/car-data windows). Query data must be structured-cloneable (no functions). Data written only via `setQueryData` is not persisted. Bump `CACHE_BUSTER` in `queryPersister.ts` after an API shape change.
8. **`Float32Array` coords in `LocationIndex`** have reduced precision vs JS `number`. This is intentional for performance. Do not convert back to `number[]` arrays in hot paths.
9. **`SPEEDS`** (`[1,2,4,8,16]`) and `MAX_FRAME_STEP_MS` (`250`) are the only safe values for playback. Do not introduce arbitrary speed multipliers.
10. **SEO routes** are generated at build time from `seo-routes.json`. Add new deep-linkable pages to this file and run `yarn generate:sitemap`. Parametrised routes go in `PATTERN_ROUTES` (`Seo/seo.ts`) and call `usePageSeo` once their data loads. Social images must be PNG (`public/og-cover.png`, rasterised from `og-cover.svg`) — SVG `og:image` is ignored by X/Facebook/Slack. Route shells rewrite the crawlable `#shell-title` / `#shell-description` in `index.html`, and the `#route-jsonld` script id is shared by `index.html`, the shells and `RouteSeo` so it's replaced, never duplicated.
11. **Start-light sounds** play `public/sounds/start-light.mp3` as each light comes on (synthesized beep if it's missing); lights out is silent. Only commit audio you have the rights to. Light pacing is `START_LIGHT_INTERVAL_MS` / `START_LIGHTS_HOLD_MS` in `constants.ts`. The sequence always plays at 1x: the clock drops to 1x when it enters `realTimeWindow` and restores the previous speed at lights out.
12. **Team radio playback** (panel, toasts, catch-up) must go through `RadioAudio`, which plays the `public/sounds/radio-intro.mp3` chime and starts the clip after `RADIO_INTRO_LEAD_MS`. Don't render a bare `<audio autoPlay>` for radio.
13. **3D map coordinates**: never hand raw OpenF1 x/y to Mapbox — project with `f1ToLngLat(getCircuitGeoref(...), x, y)`. Circuit data is kept current by `.github/workflows/update-circuits.yml` (weekly + manual): `fetch-circuits.mjs` (MultiViewer) → `bake-gps-circuits.mjs` (venues MultiViewer lacks, from the newest session's fastest clean lap, so from FP1; `source: "openf1-gps"`, no corners/marshal sectors; replaced automatically once MultiViewer has the venue) → `fetch-georef.mjs --latest` (bacinger trace matched automatically by length + best fit; `BACINGER_OVERRIDES` only if it picks wrong) → `fetch-pit-lanes.mjs` (missing circuits only; `--all` to rebuild). It runs type-check + tests and opens a PR on `bot/update-circuits`. Locally the same scripts need `node --use-system-ca` behind TLS inspection (Node ≥ 23.8). Tests fail if a geometry file has no georef or a surface polygon self-intersects. `mapbox-gl` must only be imported from the lazy `TrackMap3D` chunk (type-only imports elsewhere are fine); production needs the `VITE_MAPBOX_TOKEN` repo variable/secret.
14. **Coarse time is trailing-edge**: `useCoarseTime` now delivers the last value after a throttled burst. Before, a paused seek (e.g. restoring `?t=`) could leave every `tSlow`-driven panel (flags, badges) stuck at t = 0.
15. **App tour targets**: tour steps find elements by `data-tour` (`TOUR_TARGET` in `components/AppTour/targets.ts`, never class names). Desktop and phone layouts are both in the DOM, so each layout has its own target. When you move or remove a toured element, move its attribute and update `steps.ts`; bump `TOUR_VERSION` (`constants.ts`) when the tour changes enough that returning users should see it again.

---

## 12. Other Docs — what is current

Read the code over any plan below; most `docs/` files are snapshots from mid-2026 whose work has shipped.

| File                                   | Status / use                                                                |
| -------------------------------------- | --------------------------------------------------------------------------- |
| `docs/ANALYTICS_EVENTS.md`             | **Current reference** — every GA4 event; update when adding `trackEvent()` calls |
| `docs/OPENF1_LIVE_API_USAGE.md`        | **Current reference** — querying OpenF1 directly, mapping to `api/`         |
| `proxy/README.md`                      | **Current reference** — proxy TTLs, cache warming, KV maintenance           |
| `docs/DESIGN.md`, `docs/DESIGN_REWORK_V2.md`, `docs/MOBILE_DESIGN.md` | Design intent (F1.com-inspired look, mobile layout); visual reference only |
| `docs/TRACK_RENDERING_PLAN.md`         | Background on baked circuit geometry (shipped)                              |
| `docs/PLAN.md`, `ROADMAP.md`, `FEATURES_ROADMAP.md`, `REMAINING_PLAN.md`, `REPLAY_FEATURE_PLAN.md`, `OPENF1_*_PLAN.md`, `TRACK_SECTOR_FLAG_VISUALIZATION_PLAN.md` | Historical plans — mostly shipped; don't treat as a to-do list |
| `docs/CODE_REVIEW_*.md`                | June 2026 review snapshots; findings may already be fixed                   |
| `.claude/debug-session-notes.md`       | Notes from one debugging session (URL churn from `useTimelineUrlSync`)      |

**Keeping this file current**: when you add a module, component, query key, setting group, env var or workflow, add a line here in the same change (Section 0 for new "where do I…" entry points, Section 3 for files, Section 5 for components) and bump "Last updated".
