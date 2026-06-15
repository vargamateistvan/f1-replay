# Map View Modes — 2D / 3D / Satellite

> Goal: let the user pick how the track map is rendered — the current flat **2D**
> vector map, a **3D** extruded circuit with real elevation, or a **Satellite**
> view that overlays the track on real-world aerial imagery — from a new Settings
> control. The existing 2D renderer stays the default and the always-available
> fallback.

## 1. Where we are today

The track map is a single **2D SVG** in
[TrackMap.tsx](src/components/TrackMap/TrackMap.tsx):

- Track shape comes from **baked official geometry** (`x[]`, `y[]`, `z[]`, corners,
  marshal sectors) per `circuit_key` — [circuitGeometry.ts](src/data/circuitGeometry.ts),
  baked by `scripts/fetch-circuits.mjs`. GPS fallback when a circuit has no baked file.
- Car dots come from OpenF1 `/location` (`x`, `y`, `z` @ ~3.7 Hz), interpolated to
  the timeline clock and drawn in the same F1 Cartesian space as the geometry
  (`locationToSvg` in [useTrackMap.ts](src/hooks/useTrackMap.ts)).
- All overlays (leaderboard, compound badges, battle rings, HUD, sector flags) are
  SVG layers gated by [settings](src/stores/settings.ts) flags.

**Two hard constraints any new mode must respect:**

1. **Fully static deploy.** Ships to GitHub Pages with Vite `base: /f1-replay/`. No
   server, no secrets at runtime. Anything needing an API key has to work with a
   free, client-side, referrer-restricted key (or a keyless tile source).
2. **Mobile-first + bundle size.** The app already runs a 60 Hz RAF clock and uPlot
   telemetry on phones. A 3D/WebGL renderer must be **lazy-loaded only when its mode
   is active** so the 2D-only user never pays for it.

The geometry already carries `z[]` (elevation) and the f1-circuits dataset (noted as
a fallback source in [TRACK_RENDERING_PLAN.md](TRACK_RENDERING_PLAN.md#L58)) carries
real **WGS84 lat/lng** — so the data needed for both new modes is within reach.

## 2. The setting

Replace the implicit single-renderer with an explicit **view mode**, plus mode-scoped
sub-options. New fields in [`AppSettings`](src/stores/settings.ts):

```ts
// Track Map — view mode
mapViewMode: "2d" | "3d" | "satellite";   // default "2d"

// 3D options (only meaningful when mapViewMode === "3d")
map3dElevation: boolean;        // use z[] for elevation, default true
map3dElevationScale: number;    // exaggeration multiplier 1–8, default 3
map3dAutoRotate: boolean;       // slow idle orbit when paused, default false

// Satellite options (only meaningful when mapViewMode === "satellite")
satelliteOpacity: number;       // track ribbon opacity over imagery 0.3–1, default 0.85
satelliteLabels: boolean;       // show place/road labels layer, default false
```

Add matching entries to `SETTINGS_DEFAULTS`. They persist automatically via the
existing `partialize` (it spreads all non-action fields), so no store plumbing beyond
the new keys.

### UI (SettingsControls)

The view mode is a **3-way segmented control**, not a toggle. Add a `SegmentedControl`
component beside the existing `Toggle`/`SpeedSelector` in
[SettingsControls.tsx](src/components/SettingsModal/SettingsControls.tsx), styled like
`SpeedSelector` (active = `bg-f1red`). Under the new **"Map View"** section header:

```
MAP VIEW
  View mode            [ 2D ] [ 3D ] [ Satellite ]     ← segmented
  ── 3D (shown only when mode = 3D) ──
  Elevation                                    (toggle)
  Elevation exaggeration   [1×][2×][4×][8×]    (selector)
  Auto-rotate when paused                      (toggle)
  ── Satellite (shown only when mode = Satellite) ──
  Track opacity            [slider 30–100%]
  Map labels                                   (toggle)
```

Sub-options render conditionally on `mapViewMode` (mirror the existing
`disabled={!settings.toastsEnabled}` pattern, but hide rather than disable since they
belong to different modes). This appears in both surfaces that render `SettingsBody`:
the [SettingsModal](src/components/SettingsModal/SettingsModal.tsx) and the
[Settings page](src/pages/Settings.tsx).

## 3. Rendering architecture

Introduce a thin renderer-selector so `TrackMap` doesn't balloon. The page
([RaceWeekend.tsx](src/pages/RaceWeekend.tsx)) keeps passing the same props; a new
`TrackMapView` switches on `mapViewMode`:

```
TrackMapView (reads mapViewMode from settings)
├── "2d"        → <TrackMap/>            (existing SVG, unchanged)
├── "3d"        → <TrackMap3D/>          (lazy, React.lazy + Suspense)
└── "satellite" → <TrackMapSatellite/>  (lazy, React.lazy + Suspense)
```

Both new renderers are `React.lazy()` so their WebGL/map deps are a separate chunk.
Suspense fallback = the 2D map (instant, already has the data), so switching modes
never shows a blank box. If a lazy chunk fails to load (offline, blocked CDN), an
error boundary falls back to 2D and the segmented control shows a note.

**Shared position pipeline.** All three modes consume the *same* interpolated car
positions and overlay state. Extract the per-frame position computation from
`TrackMap` into a hook (`useCarPositions`) returning `{ num, x, y, z, color, ... }[]`
in F1 Cartesian space, so each renderer only differs in projection:

- 2D: `(x, y) → SVG` via `locationToSvg` (today's path).
- 3D: `(x, y, z) → THREE.Vector3` on the extruded ribbon.
- Satellite: `(x, y) → (lng, lat) → map pixel` via a per-circuit affine fit.

### 3a. 3D mode

**Library:** `@react-three/fiber` + `three` (+ `@react-three/drei` for `OrbitControls`).
react-three-fiber is the idiomatic React wrapper, integrates with the existing render
loop, and tree-shakes well. Lazy-loaded, it stays out of the main bundle.

**Scene:**
- **Track ribbon** — build a `THREE.Shape`/extruded geometry from the baked
  `x[]`,`y[]` centerline, offset to a real width, with vertices lifted by
  `z[] * map3dElevationScale` when `map3dElevation` is on. Elevation is normalized to
  the track's own z-range so flat circuits don't look broken.
- **Car markers** — instanced billboards/spheres in team colors, positioned by
  interpolating the same location stream and sampling ribbon height at each car's arc
  position (reuse the speed→arc-length mapping already built for the heat overlay).
- **Camera** — `OrbitControls`; follow-driver mode tracks the focused car. Optional
  slow `map3dAutoRotate` orbit while paused.
- **Overlays** — leaderboard / HUD / toasts stay as the existing 2D HTML/SVG layers
  positioned *over* the canvas (no need to rebuild them in 3D). Corner numbers and
  start/finish can be `Text`/sprites in-scene later.

**Perf:** cap DPR (`dpr={[1, 2]}`), instanced meshes for cars, `frameloop="demand"`
when paused. Reuses the existing chunked location data — no new fetches.

### 3b. Satellite mode

**The crux: OpenF1/MultiViewer geometry is an arbitrary F1 Cartesian frame — it is not
geo-referenced.** Satellite tiles need WGS84 lat/lng. So we need a per-circuit
**Cartesian → lat/lng** transform, computed once and baked (not at runtime).

**Map library:** **MapLibre GL JS** (open-source, no token) over **keyless raster
satellite tiles** — Esri "World Imagery" works without a key and is the safe default
for a static site; MapTiler/Mapbox satellite (free tier, referrer-restricted key in
client config) is an optional upgrade. Lazy-loaded.

**Geo-referencing (bake-time, extends `scripts/fetch-circuits.mjs`):**
1. Pull the matching circuit from **bacinger/f1-circuits** (GeoJSON, WGS84), already
   identified as a source in [TRACK_RENDERING_PLAN.md](TRACK_RENDERING_PLAN.md#L58).
2. Fit a **similarity/affine transform** between the baked F1-Cartesian centerline and
   the f1-circuits lat/lng centerline (same Umeyama/phase-align machinery the rendering
   plan already specs in `src/geometry/align.ts`).
3. Store the resulting `{ a,b,c,d,e,f }` affine (or the 4-point control set) per
   `circuit_key` in the baked geometry JSON.

**Runtime:** apply the baked affine to each interpolated car position → `[lng, lat]`,
render the track centerline as a GeoJSON line layer and cars as a symbol/circle layer
or HTML markers. `satelliteOpacity` controls the ribbon layer's `paint` opacity;
`satelliteLabels` toggles a labels raster/vector layer. Circuits without a baked
affine simply **don't offer satellite mode** (segmented control disables it with a
tooltip) and stay on 2D/3D.

## 4. Why this over the alternatives

| Option | Verdict |
|--------|---------|
| **Segmented mode + lazy renderers + baked transforms** (recommended) | 2D users pay nothing; 3D/satellite load on demand; geo-referencing baked at build time keeps the deploy static and the runtime keyless. Reuses existing geometry, location pipeline, and the `align.ts` machinery. |
| One mega-`TrackMap` with `if (mode)` branches | Bloats the hot 2D path, bundles three.js + maplibre for everyone, hard to test. Rejected. |
| 3D via raw WebGL / no framework | Less code shipped but far more to maintain; loses react-three-fiber's React integration with our render loop. Rejected. |
| Mapbox GL as primary (vs MapLibre) | Requires a token even on free tier → secret management on a static site. Keep as optional upgrade only. |
| Runtime geo-referencing | Repeats an expensive fit every session and adds a runtime dependency on f1-circuits. Bake it. Rejected. |

## 5. Implementation phases

**Phase 0 — Settings + plumbing (no new deps):**
- Add the new fields to `AppSettings` / `SETTINGS_DEFAULTS`
  ([settings.ts](src/stores/settings.ts)).
- Add `SegmentedControl` + the "Map View" section to
  [SettingsControls.tsx](src/components/SettingsModal/SettingsControls.tsx).
- Extract `useCarPositions` from `TrackMap`; add `TrackMapView` switch that renders
  only `"2d"` for now (other modes show "Coming soon"). Ship this first — it's safe
  and reviewable on its own.

**Phase 1 — 3D mode:**
- Add `@react-three/fiber`, `three`, `@react-three/drei` (lazy chunk).
- Build `TrackMap3D`: extruded ribbon from baked geometry + `z`, instanced car
  markers, OrbitControls, follow-cam, elevation/auto-rotate settings.
- Verify chunk is absent from the main bundle (`yarn build` + bundle inspect).

**Phase 2 — Satellite geo-referencing (bake):**
- Extend `scripts/fetch-circuits.mjs` to fetch f1-circuits GeoJSON and fit the
  Cartesian→lat/lng affine via `src/geometry/align.ts`; write it into the baked JSON.
- Type the affine in [circuitGeometryTypes.ts](src/data/circuitGeometryTypes.ts).

**Phase 3 — Satellite render:**
- Add MapLibre GL (lazy chunk); `TrackMapSatellite` with Esri imagery, ribbon +
  car layers, opacity/labels settings. Disable the mode for circuits lacking an affine.

**Phase 4 — Polish + verify:**
- Error boundary → 2D fallback on lazy-load failure.
- `yarn test && yarn build`; check both new chunks lazy-load and the 2D path is
  byte-for-byte unchanged for default settings.
- Update project memory + roadmap.

## 6. Files touched

- [src/stores/settings.ts](src/stores/settings.ts) — `mapViewMode` + 3D/satellite fields
- [src/components/SettingsModal/SettingsControls.tsx](src/components/SettingsModal/SettingsControls.tsx) — `SegmentedControl`, "Map View" section
- `src/components/TrackMap/TrackMapView.tsx` *(new)* — mode switch + lazy + error boundary
- `src/components/TrackMap/TrackMap3D.tsx` *(new)* — react-three-fiber renderer
- `src/components/TrackMap/TrackMapSatellite.tsx` *(new)* — MapLibre renderer
- `src/hooks/useCarPositions.ts` *(new)* — shared interpolated car positions
- [src/components/TrackMap/TrackMap.tsx](src/components/TrackMap/TrackMap.tsx) — consume `useCarPositions` (2D path otherwise unchanged)
- `scripts/fetch-circuits.mjs` — also fetch f1-circuits + bake the lat/lng affine
- [src/data/circuitGeometryTypes.ts](src/data/circuitGeometryTypes.ts) — affine type
- `src/geometry/align.ts` — reused for the Cartesian→lat/lng fit
- [src/pages/RaceWeekend.tsx](src/pages/RaceWeekend.tsx) — render `TrackMapView` instead of `TrackMap`
- [src/constants.ts](src/constants.ts) — 3D ribbon width, elevation defaults, tile URLs

## 7. Open decisions

- **Satellite tiles**: keyless Esri World Imagery (zero config, recommended default)
  vs MapTiler/Mapbox satellite (sharper, needs a referrer-restricted client key).
- **3D library weight**: react-three-fiber + three is ~150 KB gzipped lazy — acceptable
  on-demand, but confirm mobile GPU perf before defaulting any user to 3D (we don't —
  default stays 2D).
- **Per-mode follow-cam**: share one `focusDriver` across modes (recommended) vs
  independent camera state per mode.
- **Mode availability**: hide unsupported modes per-circuit (no affine → no satellite)
  vs always show and fall back. Lean: disable with a tooltip.
- **`z` trust**: OpenF1 docs note GPS "lacks lateral placement"; validate baked `z[]`
  gives sane elevation before enabling exaggeration > 1 by default.
```
