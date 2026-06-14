# F1 Replay — Code Review Findings (2026-06-14)

A fresh pass over the codebase after Milestones A–C of [ROADMAP.md](./ROADMAP.md) shipped.
This focuses on **new findings** from reading the actual code — concrete bugs, render-loop
performance problems, and feature ideas not already tracked. Where an item overlaps the
existing roadmap it is cross-referenced.

Severity: 🔴 bug · 🟠 perf/hardening · 🟢 quick win · 🔵 feature
Effort: S (<½ day) · M (~1 day) · L (multi-day)

---

## 1. Performance — the 60 fps render loop 🟠

This is the biggest lever and the headline finding. The app re-renders far more work
per animation frame than it needs to. Three concrete causes, in order of impact:

### 1.1 `useLocationChunks` returns a new array every call → per-frame index rebuild 🔴🟠 **(NEW)**
`src/hooks/useLocationChunks.ts:63-66`

```ts
const data = [
  ...(current.data ?? []),
  ...(next.data ?? []),
]
return { data, isPending: current.isPending }
```

`data` is a brand-new array reference on **every render**. `RaceWeekend` subscribes to `t`
(`useTimeline()`), so it re-renders ~60×/s, which means `location.data` changes identity
60×/s. `TrackMap` then takes that as `locationData` and feeds it to:

```ts
const locationIndexes = useMemo(() => { /* buildIndex per driver */ },
  [locationData, sessionStartMs])   // ← dependency changes every frame
```

So the typed-array index for **all 20 drivers is rebuilt every single frame**, completely
defeating the `// Rebuilds only when locationData changes` comment. With ~22k rows per
5-min chunk this is a large, sustained allocation + GC churn while playing.

- **Fix:** memoize the merged array in the hook on the *data identities*:
  ```ts
  const data = useMemo(
    () => [...(current.data ?? []), ...(next.data ?? [])],
    [current.data, next.data],
  )
  ```
  Now the reference is stable across frames and `locationIndexes` rebuilds only when a
  chunk actually arrives. Single highest-value fix in the file.
- **Effort:** S · **Impact:** High

### 1.2 `TrackMap` rebuilds the SVG path + overlays in the render body every frame 🟠 **(NEW, extends ROADMAP 5.1)**
`src/components/TrackMap/TrackMap.tsx:106-124` (path), `168-246` (sectors/DRS)

The Catmull-Rom→Bézier `pathData` string, the projected `svgPts`, and the sector/DRS
rectangles are all computed inline in the render body. Because the component re-renders
every frame, this whole geometry is recomputed 60×/s even though it **only depends on
`outline` + `circuitLayout`**, which change once per session.

- **Fix:** wrap path generation in `useMemo(() => …, [outline, circuitLayout])`. Only the
  `carPositions` interpolation and the dot `<g>` elements should recompute per frame.
- **Effort:** S–M · **Impact:** High

### 1.3 Whole page re-renders per frame via non-selector store reads 🟠 (ROADMAP 5.2)
`src/pages/RaceWeekend.tsx:95` — `const { t, setSessionStart } = useTimeline()`

Reading the store without a selector subscribes `RaceWeekend` (and therefore every panel
it renders: LiveTiming, StrategyBar, WeatherPanel, SessionInfoBar, …) to `t`, so the
entire tree reconciles 60×/s. Most of those panels only change their displayed value on a
**step** basis (current lap, current weather sample, gaps) — a few times per second at most.

- **Fix:** introduce a throttled / coarse time for step-based panels. Options:
  1. A second store value `tCoarse` updated ~4–10×/s from the RAF tick, consumed by panels
     that don't animate continuously; keep `t` only for `TrackMap`.
  2. Or `useTimeline(s => s.t)` selectors + `React.memo` on the heavy panels so they bail
     out when their *own* derived value is unchanged.
- **Effort:** M · **Impact:** High (compounds with 1.1/1.2)

### 1.4 `pulseDrivers` recomputed every frame 🟢 **(NEW)**
`src/pages/RaceWeekend.tsx:135-144` — the `useMemo` depends on `t`, so it allocates a new
array and scans all overtakes 60×/s. Cheap individually, but it forces a new prop into
`TrackMap` each frame (extra reconciliation) and the scan is O(overtakes) per frame.

- **Fix:** derive pulses from a coarse time (see 1.3), or precompute an interval index and
  look up active pulses with a step search instead of a full scan.
- **Effort:** S

---

## 2. Correctness bugs 🔴

### 2.1 `interpolateXY` divides by zero on duplicate timestamps 🔴 **(NEW)**
`src/timeline/interpolate.ts:53`

```ts
const alpha = (t - times[i]!) / (times[i + 1]! - times[i]!)
```

If two consecutive location samples share a timestamp (OpenF1 occasionally emits
duplicate-`date` rows), the denominator is `0` → `alpha` is `±Infinity`/`NaN`, and the car
dot jumps to `NaN` coordinates (disappears) for that segment.

- **Fix:** guard the degenerate interval:
  ```ts
  const dt = times[i + 1]! - times[i]!
  if (dt <= 0) return { x: xs[i]!, y: ys[i]! }
  const alpha = (t - times[i]!) / dt
  ```
- **Effort:** S · add a unit test alongside `interpolate.test.ts`.

### 2.2 Track outline depends solely on `drivers[0]` 🟠 **(NEW)**
`src/components/TrackMap/TrackMap.tsx:36-40` + `src/hooks/useTrackMap.ts`

The outline is derived from a clean lap of **only the first driver**. If that driver
retired early, started from the pits, or has sparse location data, `useTrackOutline`
returns `null` and the entire map renders *"No location data available for this session"* —
even though 19 other drivers have perfectly good data.

- **Fix:** try the first few drivers (or the pole-sitter) until one yields a valid outline;
  or pick the driver with the most laps. Keep it to 1–2 fallback fetches to respect the
  rate limiter.
- **Effort:** M

### 2.3 `queryPersister` opens IndexedDB at module load with no fallback 🟠 **(NEW)**
`src/lib/queryPersister.ts:16` — `const dbPromise = openDb()` runs on import. In private-mode
Safari / environments where IndexedDB is blocked, the rejected promise surfaces as an
unhandled rejection and cache persistence silently breaks the provider.

- **Fix:** wrap `openDb()` in try/catch and fall back to an in-memory (or no-op) storage
  adapter when IndexedDB is unavailable; swallow/log the rejection.
- **Effort:** S

---

## 3. Code quality & cleanup 🟢

### 3.1 Stray `react-is@^19.2.7` dependency in a React 18 app 🟢 **(NEW)**
`package.json` pins `react-is` at v19 while the app is on React 18.3. It's a transitive dep
of Recharts and shouldn't be a direct dependency — a version skew waiting to bite.
- **Fix:** remove it from `dependencies` and let Recharts resolve its own; verify build.
- **Effort:** S

### 3.2 Magic colors duplicated inline 🟢
`TrackMap.tsx:189` defines `const colors = {1,2,3}` inside the map callback (re-allocated per
render); sector/DRS palette and `#10101a`/`#15151e` backgrounds are scattered as literals.
Hoist to `constants.ts` (or the Tailwind theme) next to `SECTOR_*`.
- **Effort:** S

### 3.3 `effectiveDuration` fallback magic number 🟢
`RaceWeekend.tsx:146` — `durationMs || 7_200_000` (2 h) is an inline literal; move to
`constants.ts` as `DEFAULT_SESSION_MS`.
- **Effort:** S

---

## 4. New feature ideas 🔵

Not in the roadmap (or explicitly deferred there):

### 4.1 Telemetry track-position heat overlay 🔵 (ROADMAP 5.5 — deferred)
Color the track path by a chosen driver's speed/throttle/brake at each point (the one heavy
deferred item). Needs a distance→track-position mapping: integrate speed from `car_data`
(already done in `useCarDataForLap`) and bin onto the outline points.
- **Effort:** L

### 4.2 "Follow driver" map camera 🔵 **(NEW)**
When a driver is focused, smoothly pan/zoom the SVG `viewBox` to keep their dot centred —
turns the static map into a broadcast-style chase cam. Reuses the existing focus state.
- **Effort:** M

### 4.3 Battle / DRS-range highlighter 🔵 **(NEW)**
Using `intervals` (already fetched), highlight pairs of cars within ~1.0 s on track and on
the timing tower — surfaces "who's fighting" at a glance. Pair with overtake pulses.
- **Effort:** M

### 4.4 Gap-to-leader over time chart 🔵 **(NEW)**
A line chart (one line per driver) of gap-to-leader across the race — the classic "race
shape" view. Reuses `intervals`/`position` already loaded; complements the lap chart.
- **Effort:** M

### 4.5 Tyre-age tint on track dots 🔵 **(NEW)**
Tint or ring each car dot by stint tyre compound + age (data already in `stints`), so the
map reads strategy at a glance without opening the strategy bar.
- **Effort:** S–M

### 4.6 Shareable snapshot image 🔵 **(NEW)**
"Export current frame" → render the track map + timing to a PNG (canvas) for sharing.
Complements the existing URL-state deep links.
- **Effort:** M

---

## 5. Suggested execution order

**Quick correctness + perf wins (do first — all S, high payoff):**
1. 🔴🟠 1.1 Memoize merged location array — *single biggest perf fix*
2. 🔴 2.1 Guard zero-length interpolation interval (+ test)
3. 🟠 1.2 Memoize TrackMap path/overlays
4. 🟠 2.3 IndexedDB fallback

**Then the structural perf work:**
5. 🟠 1.3 Coarse/throttled time for step-based panels (+ 1.4 pulses)

**Robustness:**
6. 🟠 2.2 Track outline driver fallback
7. 🟢 3.1–3.3 cleanup pass

**Depth (pick by appetite):**
8. 🔵 4.2 follow-cam · 4.3 battle highlighter · 4.5 tyre-age dots (all M or less)
9. 🔵 4.1 telemetry heat overlay (the L item) · 4.4 gap chart · 4.6 snapshot export

---

## 6. Top 3 if time is short

1. **1.1 — memoize the merged location array.** One-line-ish change that stops a full
   20-driver typed-array rebuild every frame. Biggest bang for the buck in the whole app.
2. **2.1 — interpolation divide-by-zero guard.** Real, reproducible crash-to-NaN on dirty
   data; trivial fix + test.
3. **1.2 — memoize the TrackMap path/overlays.** Stops recomputing the entire circuit
   geometry 60×/s. Together with #1 this should drop idle-playback CPU dramatically.
</content>
</invoke>
