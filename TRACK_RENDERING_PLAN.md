# Track Rendering — A Better Approach

> Goal: render circuits accurately, instantly, and for **every** track — replacing
> the per-session, GPS-derived outline with baked official circuit geometry, while
> keeping live car dots positioned correctly.

## 1. Where we are today

The track outline is **derived live from GPS** every session
([useTrackMap.ts](src/hooks/useTrackMap.ts) → [trackPath.ts](src/geometry/trackPath.ts)):

1. Fetch a candidate driver's laps, pick a few clean/fast ones.
2. Fetch `/location` (x, y, z @ ~3.7 Hz) for each lap window.
3. `rejectOutliers` → `trimToLoop` → `resampleClosed` → `averageLaps` → `smoothPoints`.
4. Render as a centripetal Catmull-Rom spline ([TrackMap.tsx](src/components/TrackMap/TrackMap.tsx)).

Sectors and DRS zones are **hardcoded GPS bounding-box rectangles** for only 8
circuits in [circuits.ts](src/data/circuits.ts).

### Problems

| Area | Issue |
|------|-------|
| **Reliability** | Multi-lap blending is fragile: `trimToLoop` guards, `alignToReference` phase window, outlier `k`-thresholds all tuned by hand. A driver with no clean laps triggers the blank-map fallback loop ([TrackMap.tsx:104-120](src/components/TrackMap/TrackMap.tsx#L104-L120)). |
| **Cold start** | Several serialized API calls (laps → N location windows) before *anything* draws, all under a 3 req/s rate limit. |
| **Accuracy** | ~3.7 Hz GPS bunches in corners, spreads on straights, has an arbitrary origin, and "lacks lateral placement" (per OpenF1 docs). Output is an approximation of one racing line, not the track. |
| **Coverage** | Sectors/DRS exist for 8 circuits only, as coarse rectangles — poor flag localization. |
| **Fidelity** | Just a thin spline: no true width, no corner numbers, no marshal sectors, no start/finish marker, `z` unused. |

The OpenF1 API itself offers **no circuit-geometry endpoint** — only `location`
telemetry. So a better track *shape* must come from somewhere other than OpenF1.

## 2. Recommended approach — bake official geometry, align GPS to it

**Source the track shape from official F1 circuit maps, ship it as a static asset,
and fit the live OpenF1 GPS cloud onto it with a one-time transform per session.**

### 2a. Geometry source: MultiViewer circuit API (baked at build time)

`https://api.multiviewer.app/api/v1/circuits/{circuit_key}/{year}` returns the
**official F1 track-map data** in the same coordinate family as the F1 timing feed
that OpenF1 `location` is derived from:

- `x[]`, `y[]` — clean official centerline points
- `corners[]` — `{ number, angle, length, trackPosition: {x, y} }` (corner labels!)
- `marshalSectors[]`, `marshalLights[]` — `{ number, trackPosition: {x, y} }`
- `rotation` — orient the map to broadcast convention
- `candidateLap` — session/lap metadata

OpenF1 `Session.circuit_key` is the **same key** MultiViewer uses, so a baked file
keyed by `circuit_key` (+ year for layout changes) maps 1:1.

> **Bake at build time, do not call MultiViewer at runtime** — avoids CORS, a
> runtime third-party dependency, and keeps the GH Pages build fully static. A
> `scripts/fetch-circuits.mjs` node script pulls every circuit_key we care about
> and writes `src/data/circuit-geometry/{circuit_key}.json` (or one bundled file).

**Fallback geometry source:** [bacinger/f1-circuits](https://github.com/bacinger/f1-circuits)
(MIT, GeoJSON, WGS84 lat/lng, keyed by F1 circuit `id`) for any circuit MultiViewer
lacks. Requires a local projection step before alignment — secondary, not primary.

**Last-resort fallback:** the existing GPS-derived outline, kept for any
`circuit_key` with no baked geometry (e.g. a brand-new track mid-season).

### 2b. The technical crux: aligning OpenF1 GPS → baked geometry

Car dots come from OpenF1 `location`; the track comes from MultiViewer. Both are
believed to share the F1 coordinate system up to a **similarity transform**
(uniform scale + rotation + translation, possibly a Y-axis flip — MultiViewer's own
renderer divides by 10). We must not hardcode it; compute it **once per session**:

1. Take one clean lap of OpenF1 GPS points (we already fetch these).
2. Resample both that loop and the official outline to N points; find the best
   rotational phase offset (reuse `alignToReference` from [trackPath.ts](src/geometry/trackPath.ts)).
3. Solve the **Umeyama/Kabsch similarity transform** (least-squares scale+rot+trans)
   on the corresponding point pairs.
4. Apply that transform to every live car position before rendering.

If empirical testing shows the transform is a fixed constant (e.g. ×0.1, flip Y),
we can simplify — but the least-squares fit is robust either way and self-correcting
per session. **This must be validated against real data first (see §4, Phase 0).**

### 2c. Rendering upgrades (independent of source)

- **Track ribbon**: keep the layered-stroke ribbon, add rounded kerb edges; optional
  true-width offset polygons later.
- **Start/finish line** marker from the geometry.
- **Corner numbers** from `corners[]` — toggleable.
- **Marshal-sector arcs** replace the rectangle sector boxes → precise flag tinting
  (the `activeSectorFlag` overlay in [TrackMap.tsx:301-327](src/components/TrackMap/TrackMap.tsx#L301-L327) gets far more accurate).
- **`rotation`** applied so the map matches the broadcast.
- Optional later: elevation shading from `z`, true DRS zones from geometry.

## 3. Why this over the alternatives

| Option | Verdict |
|--------|---------|
| **Bake official geometry + align GPS** (recommended) | Accurate for all circuits, instant cold-start (shape ships with the app), removes fragile blending, real corners/sectors. One-time alignment fit is the only new runtime cost. |
| **Keep GPS-derived, just polish rendering** | Doesn't fix reliability, cold-start, coverage, or accuracy. Lipstick on the noisy source. |
| **f1-circuits GeoJSON as primary** | Accurate shapes but lat/lng needs projection *and* alignment to OpenF1's arbitrary cartesian — strictly harder than MultiViewer, which is already in-family. Use only as fallback. |

## Status: IMPLEMENTED (June 2026)

All phases complete. Run `node scripts/fetch-circuits.mjs` once to bake circuit data, then commit `src/data/circuit-geometry/*.json`.

## 4. Implementation phases

**Phase 0 — Validate (do first, blocks everything):**
- `curl` MultiViewer for 2-3 `circuit_key`s present in our sessions; confirm field
  shapes and that `circuit_key` aligns with OpenF1's.
- Overlay one session's raw OpenF1 GPS cloud against the official outline in a
  scratch script; measure the actual scale/rotation/flip. Confirm a similarity
  transform aligns them cleanly. *(Decides whether 2b is a constant or a per-session fit.)*

**Phase 1 — Bake geometry:**
- `scripts/fetch-circuits.mjs` → `src/data/circuit-geometry/`.
- Type the geometry; extend [circuits.ts](src/data/circuits.ts) /
  `getCircuitLayout` to load baked corners + marshal sectors instead of hardcoded rects.

**Phase 2 — Alignment + render:**
- New `src/geometry/align.ts`: Umeyama similarity fit + phase search.
- `useTrackOutline` returns baked geometry + the per-session transform (falls back to
  GPS derivation when no baked file exists).
- `TrackMap` renders official path; apply transform to car positions; add start/finish,
  corner numbers, marshal-sector arcs, rotation.

**Phase 3 — Cleanup:**
- Demote GPS derivation to fallback-only; keep `trackPath.ts` for that path.
- Update [circuits.ts](src/data/circuits.ts) rectangles → remove once baked sectors cover all circuits.
- `yarn test && yarn build`; update the project memory + roadmap.

## 5. Open decisions

- **Bundle format**: one `circuit-geometry.json` (simpler import) vs per-circuit files
  (lazy-loaded, smaller initial bundle). Lean per-circuit + dynamic import.
- **Year handling**: key by `circuit_key` only, or `circuit_key/year` for layout
  changes (e.g. circuits that were re-profiled). Lean on `{key}/{year}` with
  newest-≤-session fallback.
- **Transform**: per-session least-squares (robust, recommended) vs a validated
  global constant (cheaper) — settled by Phase 0.

## 6. Files touched

- `scripts/fetch-circuits.mjs` *(new)* — build-time geometry bake
- `src/data/circuit-geometry/*.json` *(new)* — baked official geometry
- `src/geometry/align.ts` *(new)* — GPS→geometry similarity transform
- [src/hooks/useTrackMap.ts](src/hooks/useTrackMap.ts) — serve baked geometry + transform, GPS fallback
- [src/components/TrackMap/TrackMap.tsx](src/components/TrackMap/TrackMap.tsx) — render official path, corners, marshal sectors, start/finish, rotation
- [src/data/circuits.ts](src/data/circuits.ts) — corners/marshal sectors from baked data; retire hardcoded rects
- [src/constants.ts](src/constants.ts) — geometry/render tunables
- [src/geometry/trackPath.ts](src/geometry/trackPath.ts) — retained for fallback path
