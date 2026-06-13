# F1 Replay — Implementation Plan

## Stack

| Concern | Choice |
|---|---|
| Build | Vite + React 18 + TypeScript |
| Package manager | Yarn |
| Styling | Tailwind CSS |
| State | Zustand (timeline / playback state) |
| Data fetching | TanStack React Query (cache + polling) |
| Charts | uPlot for telemetry (fast, 100k+ points) · Recharts v3 for standings |
| Track map | Custom SVG derived from `location` data |
| Routing | React Router — HashRouter (GitHub Pages safe) |
| Deploy | GitHub Pages via GitHub Actions |

---

## Data Source

All data comes from the public [OpenF1 API](https://api.openf1.org/v1) — no auth required.

**Rate limits (free tier):** 3 req/s · 30 req/min. The API client (`src/api/client.ts`) enforces a max-3-concurrent queue.

**Available endpoints used:**

| Endpoint | Data |
|---|---|
| `meetings` | Season rounds — name, circuit, country, dates |
| `sessions` | FP1/FP2/FP3/Q/Race per meeting |
| `drivers` | Name, acronym, team, colour, headshot |
| `location` | Car x/y/z Cartesian coords @ 3.7 Hz |
| `car_data` | Speed, throttle, brake, RPM, gear, DRS @ 3.7 Hz |
| `position` | Race position per driver (step, ~4 s updates) |
| `intervals` | Gap to leader + interval between cars |
| `laps` | Sector times, speed traps, lap duration |
| `stints` | Compound, lap range, tyre age per stint |
| `pit` | Pit stop timing per lap |
| `race_control` | Flags, SC/VSC, incidents, messages |
| `team_radio` | Audio clip URLs per driver |
| `weather` | Track/air temp, humidity, wind, rain |

---

## Key Architectural Decisions

### Track map — derived from `location` data

OpenF1's `location` endpoint returns `{x, y, z}` Cartesian coordinates (arbitrary origin, arbitrary scale). No external SVG circuit assets are needed:

- **Track outline**: fetch one car's `location` points over one clean lap → render as an SVG `<path>`. Auto-fit `viewBox` to min/max of x/y across the session.
- **Car dots**: at each timeline tick, place every driver at their interpolated `(x, y)` for the current timestamp, coloured by team.

### Timeline engine — single session-relative clock

Every data stream is normalised onto one clock: **milliseconds from session start** (UTC `date` → `new Date(date).getTime() - sessionStartMs`).

| Stream | Access pattern |
|---|---|
| `location` / `car_data` | Time-series → binary search + linear interpolation |
| `position` / `intervals` / `weather` | Step function — last known value ≤ `t` |
| `race_control` / `team_radio` / `pit` | Discrete events placed on the timeline |

The Zustand store (`src/timeline/clock.ts`) holds `{ t, playing, speed, sessionStartMs }`. A `requestAnimationFrame` loop (started once in `App.tsx`) advances `t` while `playing === true`.

---

## Pages

### Race Weekend (main — `/`)

Full-session dashboard. Layout:

```
┌─────────────────────────────┬──────────────┐
│                             │ Live Timing  │
│         Track Map           │ P  DRV  GAP  │
│    (SVG — animated cars)    ├──────────────┤
│                             │   Weather    │
│                             ├──────────────┤
│                             │ Race Control │
├─────────────────────────────┴──────────────┤
│            Tyre Strategy strip             │
└─────────────────────────────────────────────┘
│         Playback bar  ▶ ──●────── 1× 2× 4×  │
```

**Panels:**
- **Track Map** — SVG circuit outline + animated driver dots coloured by team
- **Live Timing** — position, driver acronym, gap to leader, interval
- **Weather** — track/air temp, humidity, wind speed/direction, rain flag
- **Race Control** — flags (green/yellow/red/SC/VSC), incident messages, lap-anchored
- **Tyre Strategy** — compound colour bars per driver across laps (Soft=red · Medium=yellow · Hard=white · Inter=green · Wet=blue)
- **Playback bar** — scrubber, play/pause, speed multiplier (1× 2× 4× 8× 16×)

### Telemetry (`/telemetry`)

Driver-vs-driver comparison. Pick 1–N drivers + a lap; overlay:

- Speed · Throttle · Brake · Gear · RPM · DRS on a **shared distance axis** (using `car_data`)
- Delta-time channel between two selected drivers

Chart engine: uPlot (handles 100k+ telemetry points without frame drops).

### Standings (`/standings`)

- Driver championship table + bar chart
- Constructor championship table + bar chart
- Computed from session `position` results across the season

---

## Folder Structure

```
src/
  api/
    types.ts          All OpenF1 response types
    client.ts         Fetch wrapper + rate-limit queue
    endpoints.ts      Typed API calls for every endpoint
  timeline/
    clock.ts          Zustand store + RAF playback loop
    interpolate.ts    Binary search, linear interp, step-at
  hooks/
    useSession.ts     React Query hooks (meetings, sessions, drivers, etc.)
    useTrackMap.ts    Track outline derivation hook
  components/
    Nav.tsx
    SessionPicker.tsx
    PlaybackBar.tsx
    TrackMap/
    LiveTiming/
    RaceControl/
    Weather/
    Strategy/
  pages/
    RaceWeekend.tsx
    Telemetry.tsx
    Standings.tsx
  routes.tsx          HashRouter + route definitions
  App.tsx             QueryClient + clock lifecycle
  main.tsx
```

---

## Performance Plan

| Challenge | Approach |
|---|---|
| Full race = 100k+ location rows per driver | Fetch in time-windowed chunks around the playhead; lazy-load on demand |
| Binary search on every RAF tick | Pre-sort streams by time once on load; typed `Float64Array` for timestamps |
| Rate limit (3 req/s) | Concurrent-request queue in `client.ts`; React Query caches immutable historical data forever (`staleTime: Infinity`) |
| uPlot telemetry rendering | Only render visible time window; no React re-renders in the RAF loop |

---

## GitHub Pages Deploy

- `vite.config.ts` — `base: '/f1-replay/'`
- `HashRouter` — URLs like `/#/telemetry` — no 404 issues on GH Pages refresh
- `.github/workflows/deploy.yml`:
  1. `yarn install --frozen-lockfile`
  2. `yarn build`
  3. Upload `dist/` → deploy via `actions/deploy-pages`
- Trigger: push to `main` (or manual `workflow_dispatch`)

---

## Phase Roadmap

| Phase | Scope | Status |
|---|---|---|
| 1 | Scaffold · config · folder structure · GH Actions pipeline | ✅ Done |
| 2 | Session picker live · all React Query hooks wired · API tested | ✅ Done |
| 3 | Timeline engine · playback bar · binary search / interp verified | ✅ Done |
| 4 | Track map — derive outline · animate car dots against clock | — |
| 5 | Live timing · race control · weather · team radio · tyre strategy panels | — |
| 6 | Telemetry page — uPlot driver comparison charts | — |
| 7 | Standings page — driver + constructor championship | — |
| 8 | Polish — loading/error states · mobile layout · live session polling | — |
