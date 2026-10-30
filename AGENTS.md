# F1 Replay — Agent Documentation

> Last updated: 2026-10-30
> The single source of truth for agents. Provides concise, agent-readable architecture notes, conventions, and guardrails. `docs/` holds mostly historical plans — see Section 12 before trusting one.

---

## 0. Quick Lookup — "where do I change X?"

| Task                                              | Start here                                                                                   |
| ------------------------------------------------- | -------------------------------------------------------------------------------------------- |
| Add/modify an OpenF1 call                         | `api/types.ts` → `api/endpoints.ts` → a hook in `hooks/useSession.ts` (never call `api.*` from a component) |
| Tune a number (speed, poll rate, size, timeout)   | `src/constants.ts` (grep the name; every magic number lives here)                            |
| Colour, font size, letter-spacing, z-index        | `src/designTokens.ts` (Tailwind tokens + light/dark values; Section 8 Styling)               |
| A button                                          | `components/Button` (`buttonClass()` for links, `<Button>`, `FOCUS_RING`)                    |
| Add a user setting                                | `stores/settings.ts` (`AppSettings`, defaults, `migrateSettings`) + `components/SettingsModal` |
| Main replay page layout / wiring                  | `pages/RaceWeekend.tsx` (very large — grep, don't read whole)                                 |
| Playback, seek, speed                             | `timeline/clock.ts` (`useTimeline`), `components/PlaybackBar`                                |
| Car positions on the map                          | `hooks/useLocationChunks.ts` → `timeline/interpolate.ts` → `components/TrackMap`             |
| Track outline / circuit geometry                  | `data/circuitGeometry.ts` (+ `circuit-geometry/<circuitKey>-<year>.json`), `hooks/useCircuitGeometry.ts`, `hooks/useTrackMap.ts` |
| 3D map                                            | `components/TrackMap3D/`, `utils/georef.ts`, `docs/TRACK_MAP_3D.md`                          |
| Ring view                                         | `components/TrackRing/`, `utils/lapProgress.ts`, `docs/RING_VIEW.md`                         |
| Toasts / catch-up                                 | `timeline/events.ts`, `hooks/useEventToasts.ts`, `hooks/useCatchupSummary.ts`                |
| Race control / flags                              | `timeline/raceControl.ts`, `utils/raceControlFlags.ts`                                       |
| Side-panel feeds (RC, radio, pits, passes…)       | `components/CommentaryPanels/` (tabs: `rc` `radio` `pits` `passes` `moments` `chapters` `weather`) |
| Live sessions                                     | `utils/live.ts`, polling in `hooks/useSession.ts`, MQTT push in `hooks/useOpenF1LiveMqtt.ts` |
| Tyre degradation / race pace                      | `utils/racePace.ts` (clean laps, per-stint fit), `components/TyreDeg` (tracker tab `deg`)    |
| Undercut / overcut                                | `utils/undercut.ts` (`detectPitBattles`), shown in `PitFeed` rows + `undercut` toast         |
| Season schedule / calendar                        | `pages/Schedule.tsx` (`/schedule`), `utils/schedule.ts` (`buildSeasonSchedule`), `useSeasonSessions` in `hooks/useSession.ts`; per-card track outline + facts in `components/CircuitSummary` (`utils/circuitInfo.ts`) |
| Standings / profiles                              | `hooks/useStandings.ts`, `utils/standings.ts`, `utils/championship.ts`, `pages/Standings.tsx` |
| Telemetry comparison                              | `pages/Telemetry.tsx`, `components/TelemetryChart`, `components/CornerAnalysis`, `utils/telemetry.ts` |
| SEO / new route                                   | `routes.tsx`, `seo-routes.json`, `components/Seo/seo.ts` (Pitfall 10)                        |
| Analytics event                                   | `lib/analytics.ts` (`trackEvent` → GA4 + Amplitude) + document it in `docs/ANALYTICS_EVENTS.md` |
| Errors / Sentry                                   | `lib/sentry.ts` (lazy facade), `utils/ignorableErrors.ts`, `components/ErrorBoundary`, `lib/staleChunkReload.ts` (post-deploy chunk 404s) |
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
| Styling           | Tailwind CSS v3, palette locked to `designTokens.ts`         |
| Charts            | Recharts (standings/gap charts), uPlot (high-freq telemetry) |
| 3D map            | Mapbox GL JS v3 (lazy chunk, opt-in, needs `VITE_MAPBOX_TOKEN`) |
| Icons             | Lucide React                                                 |
| Animation         | anime.js via `lib/motion.ts` (honours `prefers-reduced-motion`) |
| Guided tour       | react-joyride v3                                             |
| Live push         | `mqtt` over WSS (OpenF1 MQTT, optional credentials)          |
| Monitoring        | Sentry (`@sentry/react`, lazy-loaded), GA4 + Amplitude (`lib/analytics.ts`, `@amplitude/analytics-browser` lazy-loaded) |
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
  constants.ts          — ALL tunable magic numbers (speeds, chunk sizes, poll rates…); COMPOUND_COLORS / COMPOUND_LETTERS, FLAG_COLORS
  designTokens.ts       — Design tokens: themed colours (dark + light R G B → CSS vars via tailwind.config.ts), type scale, letter-spacing, z layers, TOKEN_HEX for canvas/SVG
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
    settings.ts         — Zustand persist store for all user preferences (AppSettings); ring pit-window outcomes are controlled by `mapRingShowPitWindowOutcomes` (default off)

  hooks/
    useSession.ts       — All session-scoped TanStack Query hooks; secondary feeds accept an optional enabled gate without changing cache keys
    useReplayStartup.ts — Replay readiness analytics and per-session secondary-feed release after essential requests and visible GPS settle (errors also release feeds)
    useLocationChunks.ts — 2-min chunked location streaming with prefetch/eviction; current window loads before adjacent/speculative chunks
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
    useReplayWelcome.ts — Optional first-use replay prompt, never an auto-opened tour; skips live/playing sessions, returning visitors and shared moment/focus/camera links
    useCircuitGeometry.ts — Lazy-loads baked circuit geometry JSON (static asset, bypasses the query cache)
    useOpenF1LiveMqtt.ts — Live sessions: OpenF1 MQTT topics → `setQueryData` into the polling queries' cache
    useAudioProgress.ts — 0–1 progress of an <audio> element (radio clips)
    useReleaseDate.ts   — Shared GitHub latest-release date (footer, About dialog)
    usePageSeo.ts       — Overrides route SEO defaults once a data-driven page (driver/team profile) has loaded
    queryKeys.ts        — Shared query-key builders (`lapsQueryKey`)

  utils/
    color.ts            — teamColor() normaliser (OpenF1 omits leading #)
    identity.ts         — canonicalTeamName() deduplication
    live.ts             — isSessionLive() with ±30 min buffer
    pit.ts              — pitStopTime() helper
    pitRejoin.ts        — Pit-loss parsing, gap-to-leader snapshot, pit rejoin position projection (`rankAtGap` for a car already in the pits), pit window rivals (`pitWindowRivals`)
    raceControlFlags.ts — Flag severity, safety-car phase classification
    retirement.ts       — Retirement detection from race control
    session.ts          — Session utility helpers
    circuitInfo.ts      — circuitStats() (centerline length, distinct turns, direction from shoelace sign; F1 frame is decimetres, Y-up), circuitThumbnail() (outline path oriented like the 2D map, start tick, direction arrow)
    schedule.ts         — buildSeasonSchedule(): meetings + sessions → numbered rounds (testing/cancelled unnumbered), per-session status, next round; scheduleFocusRound() (live weekend → latest finished → first upcoming; the page opens scrolled to it); formatCountdown()
    standings.ts        — computeStandings(), completed-session + wins/podiums tallies
    championship.ts     — Points progression, per-race results grid, title-outlook maths, teammate head-to-heads
    driverProfile.ts    — driverSeasonStats(), finishDistribution(), championshipPositions() for the driver profile
    constructorProfile.ts — constructorSeasonStats() (all cars per round), round points, constructorPath()
    telemetry.ts        — resampleToAxis, computeDelta, smooth (signal processing)
    lapProgress.ts      — Lap fraction by projecting onto an outline (windowed search), ring arcs, ring label layout
    corners.ts          — buildCornerZones(): braking→exit corner zones for telemetry charts
    cornerAnalysis.ts   — Per-corner metrics, lap alignment to timing lines, segment time deltas
    lapContext.ts       — tyreForLap(): compound + tyre age for a driver's lap
    undercut.ts         — detectPitBattles(): pairs a stop (from UNDERCUT_MIN_STOP_LAP) with the car directly ahead/behind within UNDERCUT_MAX_GAP_S that stays out ≤ UNDERCUT_MAX_LAG_LAPS; verdict after the rival's out-lap (position headline + seconds), pending never reveals the future
    racePace.ts         — cleanRaceLaps() (no lap 1, pit laps, SC/VSC/red, outliers, or laps past the playhead), fitStintPace() (s/lap deg), compoundPaceSummary(), neutralisedWindows()
    units.ts            — Metric/imperial conversion
    georef.ts           — F1 frame ↔ WGS84: similarity fit (Umeyama + ICP) and projection for the 3D map
    pitLane.ts          — Pit-lane path extraction from a GPS trace (used by scripts/fetch-pit-lanes.mjs)
    sortedTime.ts       — Binary-search helpers over time-sorted arrays (lastAtOrBefore, windowBoundsByValue)
    driverTimeIndex.ts  — buildDriverTimeIndex(): per-driver, time-sorted series for per-frame lookups
    lapLookup.ts        — buildLapLookup(): lap number at a given time
    ignorableErrors.ts  — Filters browser noise (opaque "Script error.", cross-origin frames) from logging
    intervals.ts        — parseIntervalSeconds() (OpenF1's mixed number / "+0.842" / "LAP" intervals), latestIntervalRows()
    battles.ts          — latestIntervalSeconds(), battlingFrom(), computeBattlingDrivers() (battle rings, 3D gap ribbons)
    finish.ts           — findLeaderFinishMs(), deriveFinishedDrivers(): who has taken the chequered flag (timed sessions: first crossing after the flag)
    lapDeletions.ts     — parseLapDeletions() / deletedLapKeys(): race-control lap-time deletions (track limits) and reinstatements, matched on driver + lap time (the message's LAP number is one ahead of OpenF1's)
    weather.ts          — weatherAtSessionTime()
    url.ts              — toSafeExternalUrl(), replaceHistorySearchParams(), replayPath() / roundReplayPath()

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
    Schedule.tsx        — /schedule — season calendar: round cards, session times (your time / track time via ?time=), replay links for started sessions, next round + countdown
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
    analytics.ts        — trackEvent() → GA4 + Amplitude (loaded when idle; events listed in docs/ANALYTICS_EVENTS.md)
    amplitude.ts        — Lazy Amplitude facade (SDK imported when idle; events queued until init; Session Replay is lazy-loaded at 10% sampling, controlled by `amplitudeSessionReplayEnabled`; inputs use medium masking)
    sentry.ts / sentrySdk.ts — Lazy Sentry facade (calls queued until the SDK chunk loads; no-op in dev/tests)
    appVersion.ts       — VITE_APP_VERSION formatting, GitHub releases URLs
    idle.ts             — runWhenIdle(), loadScriptOnce()
    staleChunkReload.ts — After a deploy, old tabs 404 on removed hashed chunks: reloads once on `vite:preloadError` (sessionStorage cooldown `STALE_CHUNK_RELOAD_COOLDOWN_MS` stops loops); `ErrorBoundary` shows "Loading the latest version…" meanwhile
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

| Component (folder, then export if different)      | Purpose                                                                                  |
| ------------------------------------------------- | ---------------------------------------------------------------------------------------- |
| `TrackMap`                                        | Animated SVG track map: driver blobs, sector flags, follow-cam, compass, weather overlay, status badges (start lights, SC/VSC, chequered flag), pit rejoin projection for the focused driver (baked `pitLoss`, races only). `TrackMap.tsx` orchestrates; memoized SVG layers in `layers/`, HTML overlays in `overlays/`, pure derivations in `trackGeometry.ts` / `statusBadges.ts` |
| `TrackRing`                                       | Ring view (third map mode, `mapViewMode: "ring"`): every circuit as a dial spaced by lap time (reference lap profile, `lapTimeProfile.ts`), start/finish at 12 o'clock; gap labels (to car ahead / leader / focused car, retaining numeric timing next to lap deficits), pit window band and named rejoin outcomes for the focused car (rivals in it highlighted, SC/VSC loss ticks; while it is in the pits a "REJOIN P{n}" ghost that moves with the field, via `findPitEntry` / `gapAtTimeFraction`), nearby-driver emphasis, hover gap measure, optional `?` legend, pit-lane cars on an inner arc. The centre keeps lap/status/reference in fixed positions without explanatory captions, then shows weather with compact icons when no driver is focused, or focused-driver position, gaps ahead/behind, tyre and available speed/gear instead. Nearby count is tuned by `RING_NEARBY_CARS_PER_SIDE` in `constants.ts`. Pure model in `ringModel.ts` (lap/pit paths, sector boundaries, corner ticks, `placeCar`, `toDisplay`, `layoutRingCars`, `nearbyRingDrivers`, `formatRingGap`, `formatFocusGap`, `timeArc`); SVG layers in `RingLayers.tsx`. Reuses the 2D map's outline, overlays and toolbar (`extraButtons` for gap mode / time spacing / flip / legend) |
| `TrackMap3D`                                      | Opt-in Mapbox 3D map (Standard style, optional terrain), desktop and mobile. `TrackMap3D.tsx` owns the map and one RAF loop (cars, trail, camera); pure builders: `mapFeatures.ts` (track, flags), `trackSurface.ts` (asphalt/verge/kerb/pit/start-grid polygons; layers in `surfaceLayers.ts`), `carLayers.ts` (2D-identical car icons drawn on canvas + CC0 3D models), `trackOverlays.ts` (start/finish, S1/S2, arrows, heat/delta/elevation gradients, pit ghost, trail), `atmosphere.ts` (sun-based light preset, rain), `cameraModes.ts` (follow / chase / orbit). Layers in `overlayLayers.ts`; gate with `availability.ts` (token + WebGL2). `?debug=map3d` logs per-frame cost |
| `LiveTiming`                                      | Real-time leaderboard: positions, intervals, mini-sectors, telemetry columns. Practice/qualifying rank on best laps, skipping race-control-deleted times and laps begun after the final chequered flag (the lap in progress at the flag still counts) |
| `PlaybackBar`                                     | Scrubber (race-control, race-start and chequered-flag markers) / speed controls / chips |
| `RaceControl`                                     | Race control message feed                                                                |
| `TeamRadio`                                       | Audio player for team radio clips                                                        |
| `RadioAudio`                                      | Shared radio `<audio>`: plays `public/sounds/radio-intro.mp3` chime, then the clip       |
| `TelemetryChart`                                  | uPlot-based telemetry overlay (speed/throttle/brake/RPM/gear)                            |
| `GapChart`                                        | Recharts gap-to-leader chart                                                             |
| `CornerAnalysis`                                  | Telemetry page: per-corner speeds/brake/throttle + time gained/lost per lap segment      |
| `LapChart`                                        | Lap time evolution chart                                                                 |
| `Strategy`                                        | Tyre strategy bar chart                                                                  |
| `TyreDeg`                                         | Tracker tab `deg`: per-compound field summary (`compoundPaceSummary`, noisy fits excluded), lap time vs tyre age scatter + fitted line per stint (dash style per selected driver), table grouped by driver in race order with deg bars; optional fuel correction (off by default) |
| `FinalClassification`                             | End-of-race classification table                                                         |
| `KeyMoments`                                      | Timeline of significant events                                                           |
| `RaceChapters`                                    | Lap-range navigation chips                                                               |
| `Overtakes`                                       | Overtake event list                                                                      |
| `FlagBanner`                                      | Full-screen flag overlay (Safety Car, Red Flag, etc.)                                    |
| `QualifyingBanner`                                | Qualifying session elimination indicator                                                 |
| `SessionInfoBar`                                  | Circuit name, session type, current lap                                                  |
| `SessionPicker`                                   | Year / meeting / session picker                                                          |
| `FocusedTelemetry`                                | Focused single-driver telemetry panel                                                    |
| `CatchupSummary`                                  | "You skipped X events" modal; rows reuse the commentary feeds' `CommentaryRow` (jump button replays from a few seconds earlier and closes the dialog) |
| `EventToast` (stack)                              | Bottom-right toast notifications                                                         |
| `SettingsModal`                                   | All user preferences                                                                     |
| `HowItWorksModal`                                 | Onboarding overlay; "Take the tour" starts `AppTour` (navigates to `/` first, keeping the session). Content is the `SECTIONS` / `SHORTCUTS` data; desktop gets a numbered contents column |
| `AppTour`                                         | react-joyride v3 guided tour of the replay page, lazy-mounted by `RaceWeekend` while `isTourOpen` and the session has loaded. Steps (`steps.ts`, `buildTourSteps`) differ for desktop/phone, races and 3D availability; targets are `data-tour` attributes named in `targets.ts` (`visibleTourTarget` for the map view buttons, which the hidden phone Track tab can also render); custom `TourTooltip`. Finishing/skipping saves `tourSeenVersion = TOUR_VERSION` (kept by settings reset). While open: playback paused (not live), toasts hidden, shortcuts off, view forced to Driver Tracker |
| `Nav` / `MobileNav`                               | Top nav bar / bottom mobile tabs                                                         |
| `ErrorBoundary` / `ErrorDisplay` / `ErrorMessage` | Error handling chain                                                                     |
| `DriverHeadshot`                                  | Lazy-loaded driver photo                                                                 |
| `AppLogo`                                         | Brand mark                                                                               |
| `Seo` / `RouteSeo`                                | Per-route `<head>` meta tags + JSON-LD from `seo-routes.json` (helpers in `Seo/seo.ts`); data-driven pages (driver/team profiles) override via `hooks/usePageSeo.ts` |
| `ResizeHandle`                                    | Drag handle for split-panel layouts                                                      |
| `Weather`                                         | Weather icon/badge overlay                                                               |
| `CircuitSummary`                                  | Schedule card strip: baked-geometry track outline (start/finish tick, red direction arrow) + length (unit setting), turns, direction, circuit type, pit loss (normal · SC). Geometry loads per card via `useCircuitGeometry` |
| `PointsProgression` (`PointsProgressionChart`)    | Cumulative championship points per round (Standings → Progression)                       |
| `TitleOutlook` (`TitleOutlookBanner`)             | "N drivers in contention / X clinched" summary above the standings tables                |
| `TeammateComparison`                              | Qualifying / race / points head-to-heads per team (Standings → Teammates)                |
| `ResultsGrid`                                     | Drivers × rounds finishing positions/points, colour-coded (Standings → Results)          |
| `DriverProfile`                                   | Driver profile page pieces: stat tiles, finish distribution, round-by-round results (quali → finish → championship position) |
| `MaybeLink`                                       | Router `Link` when `to` is set, plain `<span>` otherwise. Shared standings components take optional `driverHref` / `teamHref` / `href` / `raceHref` props and only link when given them (their tests need no router). `raceHref` uses `roundReplayPath()` (`utils/url.ts`) → `/?year&meeting&session&view=tracker&focus=` |
| `ConstructorProfile`                              | Team profile page pieces: stat tiles (1-2s, double points…), driver line-up with points share, per-car round results |
| `CommentaryPanels`                                | Tabbed side panel (`CommentaryTab`: rc / radio / pits / passes / moments / chapters / weather); lazy-loads each feed. `keyMoments.ts` builds Key Moments, `CommentaryJumpButton` seeks to an item. Every feed renders items with `CommentaryRow` (time + type badge left, team-coloured driver code + title, mono meta line, actions; upcoming items dimmed in "All" mode) and styles from `commentaryList.ts`; qualifying feeds group only into Q1/Q2/Q3 (untagged messages take the phase in effect) |
| `Pits` (`PitFeed`)                                | Pit stop feed (commentary "pits" tab); the first stopper's row shows its undercut/overcut battle (`pitBattles` prop from `RaceWeekend`) |
| `TyreChange`                                      | Old compound + laps → new compound + age; `compact` variant for inline text              |
| `LiveDataNotice`                                  | Dismissible notice that live timing needs paid OpenF1 access (`dismissal.ts` store)      |
| `AboutDialog`                                     | Mobile About dialog: version, release date, Privacy/Terms links                          |
| `DialogHeader`                                    | Shared modal header (Settings, How it works, About, catch-up) in the legal-page style: red eyebrow strip + mono meta, black uppercase title, square close button |
| `TooltipCard`                                     | Shared tooltip card styling                                                              |
| `Button`                                          | `buttonClass(variant, size)` (`primary` red fill / `secondary` bordered, red hover / `quiet` muted; `md` / `sm` / `block`) for buttons and `<Link>`s, `<Button>`, `FOCUS_RING` for custom controls |

---

## 6. State Architecture

### 6a. Zustand stores

| Store         | File                 | Persisted?                       | Purpose                                                   |
| ------------- | -------------------- | -------------------------------- | --------------------------------------------------------- |
| `useTimeline` | `timeline/clock.ts`  | No                               | Playback state: `t`, `playing`, `speed`, `sessionStartMs`, `realTimeWindow` (span forced to 1x, e.g. race start lights) |
| `useSettings` | `stores/settings.ts` | Yes (localStorage via `persist`) | All `AppSettings` flags; `amplitudeSessionReplayEnabled` opts out of Amplitude Session Replay; `mapRingShowPitWindowOutcomes` is a ring-only toggle, default off; `replayWelcomeSeen` remembers that the first-use prompt was offered and survives settings reset |

### 6b. TanStack Query keys (convention)

```
["meetings", year]
["latestMeeting"]
["latestSession"]
["sessions", meetingKey]
["sessions-year", year]   (useSeasonSessions — shared by schedule + standings)
["drivers", sessionKey]
["positions", sessionKey]
["intervals", sessionKey]
["laps", sessionKey, driverNumber?]
["stints", sessionKey]
["startingGrid", sessionKey, meetingKey]
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

- Sliding-window: `RATE_MAX_PER_SECOND` / `RATE_MAX_PER_MINUTE` (kept under OpenF1's free-tier 3 req/s, 30 req/min).
- Responses served from the proxy cache (`X-Cache: EDGE | KV`, exposed via CORS) give their slot back, so cached data isn't throttled; only misses count. The queue is FIFO — hooks subscribed first fetch first.
- Returning a cached slot reschedules a later queue timer immediately; every wake-up still checks both sliding windows and global 429 backoff.
- Concurrent identical GETs (same URL) are deduplicated via `inFlightJsonRequests` map.
- On HTTP 429 the client honours `Retry-After` with exponential backoff (up to `RATE_MAX_RETRIES`).
- Sentry distributions separate rate-limiter wait (`request_queue_time`), fetch-to-headers (`response_time`) and successful JSON body download/parsing (`response_body_time`); queue/body metrics carry the endpoint name.

### Toast event queue (`timeline/events.ts`, `hooks/useEventToasts.ts`)

- `buildToastEvents()` merges laps, pits, race control, overtakes, team radio and resolved pit battles (`undercut`, at the end of the rival's out-lap) into a single sorted `ToastEvent[]`. A new toast kind also needs `KIND_STYLES` in `CatchupSummary`, a toast component in `EventToastStack`, a `toast*` setting and the filter in `RaceWeekend`.
- `useEventToasts` advances forward through the array as `t` increases; on a backwards seek or large forward jump (`> TOAST_JUMP_THRESHOLD_MS`) the seen-set and queue are cleared.
- A `useCatchupSummary` hook fires when `t` jumps ≥ `CATCHUP_JUMP_THRESHOLD_MS`, collecting all crossed events into a summary modal.

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

### Ring view (`utils/lapProgress.ts`, `components/TrackRing/`) — details in `docs/RING_VIEW.md`

- A dial spaced by **time** (MultiViewer's "Circle of Doom"): the angle between two cars is their gap, a pit stop is a fixed slice.
- Cars are projected onto the 2D outline's nearest segment (windowed search, `RING_SEARCH_WINDOW`) → lap fraction; `lapTimeProfile.ts` turns distance into time from recent clean laps. `toDisplay` / `displayArc` (`ringModel.ts`) apply the profile and the flip to everything drawn.
- Pit-lane cars use the baked path (`data/pitLanes.ts`) on an inner arc. Only `RaceWeekend`'s position-timeline leader reads LEAD (OpenF1 reports stale 0 s intervals during pit cycles).

### 3D map (`components/TrackMap3D/`, `utils/georef.ts`) — details in `docs/TRACK_MAP_3D.md`

- Georef: each circuit's F1 frame is fitted (similarity + ICP) to a bacinger/f1-circuits trace at bake time (`scripts/fetch-georef.mjs` → `data/circuit-georef.json`); runtime projects with `f1ToLngLat` (Pitfall 13).
- `TrackMap3D.tsx` owns the map and a single RAF loop (cars, trail, camera); everything else is pure builders (`trackSurface.ts`, `trackOverlays.ts`, `carLayers.ts`, `cameraModes.ts`, `atmosphere.ts`).
- Car updates use back-pressure (`carSync.ts`), never a timer; the camera aims at the instant actually on screen (`cameraTime`). `?debug=map3d` logs per-frame cost and car latency.
- Settings are `mapView3d*` in `stores/settings.ts`. Each `new mapboxgl.Map` is a billed load — keep the map while the circuit is unchanged.
- Camera mode is in the URL (`?cam=`, owned by `RaceWeekend`); the TV camera (`timeline/director.ts`) never changes the app's focused driver.

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

- Tailwind utility classes only. No CSS-in-JS.
- **Design tokens** (`src/designTokens.ts`) are the only colours. `tailwind.config.ts` turns each into a CSS variable (`--color-*`, overridden under `html.light`) and replaces Tailwind's default palette, so `bg-red-500` generates nothing. ESLint rejects arbitrary hex classes (`bg-[#…]`), pixel font sizes (`text-[10px]`) and default-palette shades.
  - Neutrals: `fg` (text, white in dark mode — use `text-fg`, not `text-white`), `track` (page), `sunken` (map/chart wells), `surface` (cards), `panel` (controls, default border), `line` (strong border), `muted`, `faint`.
  - Tones `purple` `green` `yellow` `orange` `red` `blue` `teal`, each with `DEFAULT` (fills, F1 timing text), `-fg` (text), `-line` (chip border), `-tint` (chip/row background): a tinted chip is `border-orange-line bg-orange-tint text-orange-fg`. Brand: `f1red` (+ `f1red-hover`, `f1red-fg` for red text); `podium-gold/silver/bronze`.
  - `text-white` / `text-black` only on solid coloured fills (`bg-f1red`, `bg-purple`, `bg-yellow`…), where they must not flip with the theme.
  - Canvas, chart series, Mapbox paint and SVG attributes can't read CSS variables: use `TOKEN_HEX` (dark values) or a `constants.ts` colour map, never a new hex literal.
- Dark mode is the default; `light` class on `<html>` activates light mode (toggled by `LightModeGate` in `App.tsx`). Tokens handle it — don't branch on `lightMode` for class names. The `light:` variant exists for the rare light-only tweak (e.g. a softer shadow).
- Type scale (font-size only, set leading separately): `text-micro` 8px, `text-tiny` 9px, `text-caption` 10px, `text-small` 11px, `text-compact` 12px, `text-body` 13px, `text-stat` 22px; Tailwind `text-sm` and up above that. Uppercase letter-spacing: `tracking-wider` / `widest`, `tracking-caps` (0.12em, titles/buttons), `tracking-eyebrow` (0.16em), `tracking-spaced` (0.2em).
- Corners: `rounded-sm` (2px) for panels, buttons, chips and dialogs; `rounded-full` only for dots, avatars and pills. Layers: `z-10` / `z-20` inside panels, then `z-overlay` < `z-modal` < `z-tour` < `z-popover` < `z-tooltip`.
- Buttons come from `components/Button`; keyboard focus is a global brand-red `:focus-visible` outline (`index.css`), or `FOCUS_RING` on controls that draw their own.

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

- Use `refetchInterval` polling: `LIVE_POLL_FAST_MS` for timing-critical data (positions, intervals, laps), `LIVE_POLL_SLOW_MS` for the rest (weather, race control, radio, overtakes…).
- Skip IndexedDB persistence (`staleTime: 0` marks them stale on restore).
- Show real-time leaderboard updates.
- `useOpenF1LiveMqtt` (mounted by `RaceWeekend`) subscribes to OpenF1 MQTT topics (`v1/position`, `v1/intervals`, `v1/laps`, `v1/race_control`, `v1/team_radio`, `v1/weather`, `v1/overtakes`) and merges rows into the same query keys via `setQueryData` (capped at `LIVE_MQTT_MAX_ROWS`). Needs `VITE_OPENF1_MQTT_*` credentials; polling remains the fallback. MQTT-only data is not persisted (Pitfall 7).

Historical sessions:

- All queries have `staleTime: Infinity` — data never re-fetched once cached.
- Cache is persisted to IndexedDB (`QUERY_PERSIST_MAX_AGE_MS`).
- Full replay scrubbing is available.

Replay startup is progressive: metadata, drivers, current visible GPS, positions,
intervals, laps and race control load first. Stints, pits, grid, results, overtakes,
radio, weather and all-driver telemetry follow once essential requests and the
visible GPS window settle. A failed essential request also releases secondary
feeds; seeks and view changes do not re-disable them after release. Loading
status never covers the entire replay, and failed requests have an explicit retry
action. `useReplayStartup.ts` reports data-readiness milestones (not map paint);
see `docs/ANALYTICS_EVENTS.md`.

First-use activation: the tour is opt-in via "Take a tour" in the dismissible
welcome dialog or Help. The dialog uses `DialogHeader`, traps keyboard focus,
locks background scrolling and closes via Escape, backdrop or its close button.
The primary welcome action loads the destination GPS
window, then switches to the tracker (map tab on phones), seeks to the start-light
lead-in and plays at 1x. Non-race sessions or unavailable race-start timing use
"Play replay" from session start. Empty/error GPS responses leave playback paused
and offer retry; session switches/unmounts invalidate pending welcome playback.
The introductory seek skips its catch-up summary (`useCatchupSummary.skipNextSeek`)
so a second dialog does not interrupt the preview; later user seeks behave normally.
The prompt is offered only once (`replayWelcomeSeen`, retained on reset), and
never interrupts returning visitors, live playback or shared moment/focus/camera
links. It does not mark the optional tour completed.

Map HUDs, map lap telemetry and `FocusedTelemetry` share the same startup gate
through their optional `telemetryEnabled` prop (default true for other callers);
`useCarDataWindow` and `useCarDataForLap` accept an optional enabled gate while
retaining canonical query keys.

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
| `VITE_AMPLITUDE_API_KEY`                                                 | Amplitude key override (public; default built into `lib/amplitude.ts`) |
| `VITE_APP_VERSION`                                                       | Release string (set by CI from `versioning.yml`)                 |

Source maps are uploaded to Sentry only from GitHub Actions (`disable: !env.GITHUB_ACTIONS` in `vite.config.ts`), so local and pre-commit builds never upload. Don't remove that gate — `.env.sentry-build-plugin` holds a real token.

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
14. **Coarse time must stay trailing-edge**: `useCoarseTime` delivers the last value after a throttled burst. A leading-edge-only throttle leaves every `tSlow`-driven panel (flags, badges) stuck after a paused seek (e.g. restoring `?t=`).
15. **App tour targets**: tour steps find elements by `data-tour` (`TOUR_TARGET` in `components/AppTour/targets.ts`, never class names). Desktop and phone layouts are both in the DOM, so each layout has its own target. When you move or remove a toured element, move its attribute and update `steps.ts`; bump `TOUR_VERSION` (`constants.ts`) when the tour meaningfully changes. Tours are opt-in, never automatically opened.

---

## 12. Other Docs — what is current

Read the code over any plan below; most `docs/` files are snapshots from mid-2026 whose work has shipped.

| File                                   | Status / use                                                                |
| -------------------------------------- | --------------------------------------------------------------------------- |
| `docs/ANALYTICS_EVENTS.md`             | **Current reference** — every GA4 event; update when adding `trackEvent()` calls |
| `docs/TRACK_MAP_3D.md`, `docs/RING_VIEW.md` | **Current reference** — 3D map and ring view internals (update with those components) |
| `docs/OPENF1_LIVE_API_USAGE.md`        | **Current reference** — querying OpenF1 directly, mapping to `api/`         |
| `proxy/README.md`                      | **Current reference** — proxy TTLs, cache warming, KV maintenance           |
| `docs/DESIGN.md`                       | **Current reference** for design intent, tokens and component patterns (values live in `src/designTokens.ts`) |
| `docs/DESIGN_REWORK_V2.md`, `docs/MOBILE_DESIGN.md` | Design intent (rework, mobile layout); visual reference only — their hex values predate the tokens |
| `docs/TRACK_RENDERING_PLAN.md`         | Background on baked circuit geometry (shipped)                              |
| `docs/PLAN.md`, `ROADMAP.md`, `FEATURES_ROADMAP.md`, `REMAINING_PLAN.md`, `REPLAY_FEATURE_PLAN.md`, `OPENF1_*_PLAN.md`, `TRACK_SECTOR_FLAG_VISUALIZATION_PLAN.md` | Historical plans — mostly shipped; don't treat as a to-do list |
| `docs/CODE_REVIEW_*.md`                | June 2026 review snapshots; findings may already be fixed                   |
| `.claude/debug-session-notes.md`       | Notes from one debugging session (URL churn from `useTimelineUrlSync`)      |

**Keeping this file current**: when you add a module, component, query key, setting group, env var or workflow, add a line here in the same change (Section 0 for new "where do I…" entry points, Section 3 for files, Section 5 for components) and bump "Last updated". `src/agentsDoc.test.ts` fails when a file in `hooks/`, `utils/`, `lib/`, `timeline/`, `stores/` or `data/` (or a `components/` folder) isn't mentioned here.
