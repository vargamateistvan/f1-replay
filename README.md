# F1 Replay

An interactive Formula 1 session replay viewer powered by the free [OpenF1 API](https://openf1.org). Scrub through any race, qualifying, or sprint session from 2023 onwards — with a live track map, timing tower, telemetry charts, and broadcast-style overlays.

**[Live demo →](https://vargamateistvan.github.io/f1-replay/)**

---

## Features

### Race Weekend

- **Track map** — live car positions at 3.7 Hz, rendered on official circuit geometry with corner numbers, marshal-sector arcs, and start/finish marker; follow-cam for a focused driver
- **Live timing tower** — positions, gaps, intervals, sector times (purple/green/yellow), tyre compound, pit count, positions gained/lost from the starting grid, DRS indicator
- **Playback bar** — scrub, play at 1×/2×/4×/8×/16×, jump to next/previous lap, next pit stop, next flag, next overtake; keyboard shortcuts (Space, ←/→, ↑/↓, `[`/`]`)
- **Strategy** — per-driver stint bars with tyre compound colors and pit markers
- **Race control** — chronological flag/safety-car/penalty messages with color coding
- **Team radio** — timestamped clips with audio playback, synced to the playhead
- **Weather** — air/track temperature, humidity, wind speed, rainfall
- **Event toasts** — pop-up notifications for radio messages, flags, overtakes, pit stops, and fastest laps as the playhead crosses them
- **Key moments** — curated timeline of lead changes, safety cars, and other significant events
- **Catch-up summary** — "while you were away" digest when jumping the playhead forward

### Telemetry

- Up to three-driver lap comparison (speed, throttle, brake, DRS, gear)
- Sector-splits table with fastest-lap highlight
- Smoothing toggle (raw vs low-pass filtered)

### Standings

- Driver and constructor championship standings
- Points sourced from authoritative `session_result` data (DNF / DNS / DSQ handled)

### General

- **Shareable links** — year, meeting, session, focused driver, lap, and playhead position are all encoded in the URL
- **Persistent cache** — React Query persists fetched data to `localStorage` so replays feel instant on revisit
- Fully static — hosted on GitHub Pages, no backend required

---

## Stack

| Layer | Technology |
|---|---|
| Framework | React 18 + TypeScript (strict) |
| Build | Vite 6 |
| Routing | React Router v6 (HashRouter) |
| State | Zustand (RAF playback clock) |
| Data fetching | TanStack Query v5 + async-storage persister |
| Charts | uPlot (telemetry), Recharts (standings sparklines) |
| Styling | Tailwind CSS v3 |
| Testing | Vitest |
| CI | GitHub Actions (type-check + lint + test on every PR) |
| Hosting | GitHub Pages |

---

## Getting Started

### Prerequisites

- Node.js ≥ 18
- [Yarn](https://yarnpkg.com/)

### Install & run

```bash
git clone https://github.com/vargamateistvan/f1-replay.git
cd f1-replay
yarn install
yarn dev
```

Open [http://localhost:5173](http://localhost:5173).

### Other commands

```bash
yarn build        # production build (dist/)
yarn preview      # preview the production build locally
yarn test         # run Vitest test suite
yarn test:watch   # watch mode
yarn lint         # ESLint
```

---

## Configuration

Copy `.env.example` to `.env.local` and fill in any values you need:

```bash
cp .env.example .env.local
```

| Variable | Description |
|---|---|
| `VITE_OPENF1_API_KEY` | Optional OpenF1 bearer token. Historical data is free and requires no auth. Set this only if you have a subscription token and are hitting `401`/`403` responses. |

---

## Data source

All session data comes from the [OpenF1 API](https://openf1.org) — a free, no-auth-required API covering F1 sessions from 2023 onwards. The app fetches the following endpoints:

`meetings` · `sessions` · `drivers` · `location` · `car_data` · `laps` · `position` · `intervals` · `pit` · `stints` · `race_control` · `team_radio` · `weather` · `session_result` · `starting_grid` · `overtakes`

Circuit geometry (official track layouts, corner numbers, marshal sectors) is baked at build time from the [MultiViewer API](https://api.multiviewer.app) and committed as static JSON assets in `src/data/circuit-geometry/`. To regenerate or add new circuits:

```bash
node scripts/fetch-circuits.mjs
```

---

## Project structure

```
src/
├── api/          # OpenF1 client, endpoint definitions, types
├── components/   # UI components (TrackMap, LiveTiming, Strategy, …)
├── data/         # Static data — circuit geometry, compound colors, points tables
├── hooks/        # Data hooks (useDrivers, useTrackMap, useStandings, …)
├── pages/        # Route-level pages (RaceWeekend, Telemetry, Standings, Settings)
├── stores/       # Zustand stores (playback clock, settings)
├── timeline/     # Playback clock, event indexing, playhead utilities
└── utils/        # Pure helpers (interpolation, color, telemetry math, …)
scripts/
└── fetch-circuits.mjs   # Build-time circuit geometry fetcher
docs/                    # Architecture notes, design system, roadmap
```

---

## Contributing

1. Fork the repository and create a feature branch.
2. Run `yarn test` and `yarn lint` before opening a PR — the CI checks both.
3. The PR description should describe *what* changed and *why*.

---

## License

MIT
