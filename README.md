# F1 Replay

> Interactive Pit Wall: Formula 1 race replays with real-time telemetry, strategy analysis, and live data visualization — powered by the OpenF1 API.

![F1 Replay](https://img.shields.io/badge/version-0.1.0-blue) ![License](https://img.shields.io/badge/license-MIT-green) ![Built with React](https://img.shields.io/badge/built%20with-React%2018-61dafb) ![TypeScript](https://img.shields.io/badge/TypeScript-5.6-3178c6)

## Overview

F1 Replay is a web-based application that allows you to explore Formula 1 race data in an interactive, time-synced environment. Watch replays of F1 sessions available through OpenF1 (historical coverage from 2023 onwards), visualize car telemetry in real-time, analyze overtakes, pit strategies, tire compounds, and relive key moments—all powered by the public [OpenF1 API](https://api.openf1.org/v1).

The app features a broadcast-style experience with:

- **Interactive Race Playback** — scrub through sessions with fine-grained control
- **Live Track Map** — watch cars move across the circuit in real-time with position overlays
- **Telemetry Visualization** — high-frequency speed, throttle, brake, RPM, gear, and DRS data with multi-driver comparison
- **Tire Strategy Analysis** — pit stops, compound changes, tire age tracking, and stint longevity
- **Track Information** — circuit layout, turn names, DRS zones, and real-time sector performance
- **Gap & Interval Views** — race standings, gaps to leader, and head-to-head comparisons
- **Lap Charts** — sector times, speed traps, lap progression
- **Team Radio & Race Control** — driver communications and official race events
- **Weather Data** — track conditions at any point in time
- **Mobile Responsive** — optimized for desktop and tablet use

## Features

### Core Playback

- **Session Picker** — browse circuits, events, and session types (FP1/FP2/FP3/Q/Race)
- **Playback Controls** — play/pause, speed adjustment, timestamp seek
- **Time-Synced Events** — toasts for overtakes, radio messages, race control flags as the playhead advances

### Telemetry & Performance

- **Multi-Driver Comparison** — side-by-side telemetry traces for detailed performance analysis across drivers
- **Comprehensive Telemetry Metrics** — high-frequency (3.7 Hz) speed, throttle, brake, RPM, gear, DRS activation, and brake temperature data
- **Tire Temperature & Wear** — real-time tire surface temperatures and compound wear progression during stints
- **Gap Chart** — real-time gaps to leader and interval between adjacent cars
- **Focused Telemetry Overlay** — zoom into any driver's data with full-screen telemetry analysis

### Strategy & Race Analysis

- **Strategy View** — comprehensive pit stop timeline, tire compound tracking, stint lengths, and tire age monitoring
- **Tire Compound Visualization** — color-coded tire compounds (soft, medium, hard, intermediate, wet) across all stints
- **Pit Stop Analysis** — exact pit timings, strategy calls, and tire change sequences
- **Overtake Tracker** — every overtake annotated with driver, lap, position gain, and context
- **Lap Chart** — lap times, sector times, speed traps per driver with performance trends
- **Live Timing** — current race position, intervals, lap counts, pit status, and stint progression
- **Final Classification** — championship standings, session results, and completed stints

### Track Information & Convenience

- **Track Map** — visual circuit layout with turn names, DRS zones, and sector divisions
- **Sector Performance** — real-time sector times and speed trap data
- **Circuit Facts** — circuit name, length, lap count, and key track characteristics
- **Driver Spotlight** — focus on a single driver, auto-follow radio and key events
- **Session Info Bar** — always-visible race clock, weather, flags, and track status
- **Responsive Mobile Layout** — mobile navigation, optimized touch controls

## Tech Stack

| Layer                | Technology                                               |
| -------------------- | -------------------------------------------------------- |
| **Framework**        | React 18, TypeScript 5.6                                 |
| **Build**            | Vite 6                                                   |
| **Styling**          | Tailwind CSS 3, PostCSS                                  |
| **State Management** | Zustand (playback timeline)                              |
| **Data Fetching**    | TanStack React Query 5 (with persistence)                |
| **Charts**           | uPlot (high-frequency telemetry), Recharts 3 (standings) |
| **Track Rendering**  | Custom SVG from OpenF1 location data                     |
| **Routing**          | React Router 6 (HashRouter for GitHub Pages)             |
| **Testing**          | Vitest, React Testing Library, jsdom                     |
| **Linting**          | ESLint 9, TypeScript strict mode                         |
| **Deploy**           | GitHub Pages (Vite static build)                         |

## Getting Started

### Prerequisites

- **Node.js** 18+
- **Yarn** 1.22+

### Installation

1. **Clone the repository:**

   ```bash
   git clone https://github.com/vargamateistvan/f1-replay.git
   cd f1-replay
   ```

2. **Install dependencies:**

   ```bash
   yarn install
   ```

3. **Start the development server:**
   ```bash
   yarn dev
   ```
   The app will be available at `http://localhost:5173`

### Building for Production

```bash
yarn build
```

Output goes to the `dist/` folder. To preview locally:

```bash
yarn preview
```

## Usage

### Exploring Sessions

1. Open the app and use the **Session Picker** to select a circuit and session
2. Tap or click a session card to load its data

### Playback & Navigation

- **Play/Pause** — toggle playback
- **Scrub Timeline** — click or drag the playback bar to jump to any time
- **Speed Control** — adjust playback speed (0.5×, 1×, 2×, etc.)
- **Keyboard:** Arrow keys to frame-step, Space to toggle play

### Analyzing Telemetry

- **Telemetry View** — select one or more drivers to compare real-time traces
- **Hover over chart** — inspect exact values at any point in time
- **Zoom & Pan** — interactive chart controls for detailed inspection

### Strategy & Race Events

- **Strategy Tab** — see pit stops and tire compounds per driver on a timeline
- **Overtakes Tab** — sorted list of all overtakes with context
- **Live Timing** — current standings and gaps updated as playback progresses

## Project Structure

```
src/
├── api/
│   ├── client.ts           # OpenF1 API client (rate-limited queue)
│   ├── endpoints.ts        # Endpoint definitions and types
│   └── types.ts            # API response types
├── components/
│   ├── PlaybackBar.tsx     # Timeline scrubber & playback controls
│   ├── LiveTiming/         # Race position table & gaps
│   ├── TelemetryChart/     # uPlot telemetry visualization
│   ├── TrackMap/           # SVG circuit map with car positions
│   ├── Strategy/           # Pit stops & tire stints timeline
│   ├── RaceControl/        # Flags, messages, incidents
│   ├── TeamRadio/          # Driver radio messages
│   ├── LapChart/           # Lap times & progression
│   ├── Overtakes/          # Overtake list & visualization
│   ├── Weather/            # Track conditions display
│   ├── EventToast/         # Time-synced notifications
│   └── SettingsModal/      # User preferences (display, data density)
├── pages/
│   ├── RaceWeekend.tsx     # Main replay layout & orchestration
│   ├── Standings.tsx       # Championship standings
│   ├── Telemetry.tsx       # Focused telemetry analysis
│   └── Settings.tsx        # Global app settings
├── stores/
│   ├── playback.ts         # Playback state (play/pause, time, speed)
│   ├── settings.ts         # User preferences
│   └── [other stores]      # UI state, cache
├── hooks/
│   ├── useCoarseTime.ts    # Interpolated playback time
│   ├── useCarDataForLap.ts # Telemetry windowing
│   └── [other hooks]       # Custom React hooks
├── lib/
│   ├── queryPersister.ts   # TanStack Query cache serialization
│   └── [utilities]         # Formatting, math, etc.
├── data/
│   ├── circuits.ts         # Circuit metadata
│   └── circuitGeometry.ts  # Pre-computed track map coords
├── timeline/
│   ├── clock.ts            # Playback timing engine
│   └── events.ts           # Event time extraction
└── App.tsx                 # Root component & routing
```

## API Integration

All data comes from the public **[OpenF1 API](https://api.openf1.org/v1)** — no authentication required.

### Rate Limits

- **Free tier:** 3 requests/second, 30 requests/minute
- **Client-side enforcement:** The `api/client.ts` queue ensures max 3 concurrent requests

### Key Endpoints Used

- `meetings` — season rounds, circuits, dates
- `sessions` — FP1/FP2/FP3/Q/Race metadata
- `drivers` — driver info, colors, headshots
- `location` — car x/y/z position @ 3.7 Hz
- `car_data` — speed, throttle, brake, RPM, gear, DRS @ 3.7 Hz
- `position` — race position (live updates, ~4 s intervals)
- `intervals` — gap to leader, inter-car intervals
- `laps` — sector times, lap duration, speed traps
- `stints` — tire compound, lap range, tyre age
- `pit` — pit stop timing per lap
- `race_control` — flags, SC/VSC, incidents
- `team_radio` — audio URLs and driver messages
- `weather` — track/air temp, humidity, wind, rain
- `championship_drivers` — live/post-race driver championship standings
- `championship_teams` — live/post-race constructor championship standings

CSV export is available directly from Race Control, Team Radio, Overtakes, and Weather panels, and can be toggled from Settings.

## Development

### Running Tests

```bash
# Run all tests once
yarn test

# Watch mode
yarn test:watch

# Generate coverage report
yarn test -- --coverage
```

Tests use **Vitest** and **React Testing Library**. Coverage reports are in `coverage/`.

### Linting

```bash
yarn lint
```

Uses **ESLint** with React and TypeScript rules.

### TypeScript Compilation

```bash
tsc -b
```

Validates `tsconfig.json`, `tsconfig.app.json`, and `tsconfig.node.json` in build mode.

### Circuit Facts Source

Track facts are fetched from API sources at runtime inside the app (no prefetched circuit facts dataset committed in the repository).

## Configuration Files

- **`vite.config.ts`** — Vite build & dev server setup
- **`vitest.config.ts`** — Test runner configuration
- **`tailwind.config.ts`** — Tailwind CSS theme customization
- **`tsconfig.json`** — TypeScript compiler base config
- **`eslint.config.js`** — ESLint rules and plugins
- **`postcss.config.js`** — CSS processing (Tailwind, Autoprefixer)

## Browser Support

- Chrome/Edge 90+
- Firefox 88+
- Safari 14+

The app uses ES2020+ features. Modern browser APIs (IndexedDB for query cache persistence, ResizeObserver for responsive charts, etc.) are assumed.

## Performance Considerations

- **uPlot for Telemetry** — renders 100k+ points smoothly; much faster than Recharts for high-frequency data
- **Query Cache Persistence** — React Query automatically persists fetched data to IndexedDB; sessions resume instantly
- **Debounced Chart Updates** — playhead updates are throttled to avoid excessive re-renders
- **SVG Track Map** — derived dynamically from location data; no asset loading

## Contributing

1. Fork the repository
2. Create a feature branch (`git checkout -b feature/your-feature`)
3. Make your changes and ensure tests pass (`yarn test`)
4. Lint your code (`yarn lint`)
5. Open a pull request

Please follow the existing code style and add tests for new features.

## Roadmap

- **Event Toast System** — transient, time-synced notifications for radio, overtakes, race control events
- **Catch-Up Replays** — instant highlight compilation of key moments
- **Comparison Mode** — frame-by-frame comparison of two drivers/laps
- **Advanced Telemetry Overlays** — cornering G-force, brake temperatures, aerodynamic balance
- **Track Limits Visualization** — overtakes and track-limit violations highlighted
- **Live Timing Push Updates** — real-time race data during live sessions

See [`docs/FEATURES_ROADMAP.md`](docs/FEATURES_ROADMAP.md) for detailed feature planning.

## License

This project is open source and available under the MIT License.

## Acknowledgments

- **[OpenF1](https://api.openf1.org/)** — public F1 data API
- **Formula 1** — for inspiring data and context
- **React, Vite, Tailwind, and the broader open-source community**

---

**Questions or issues?** Open a GitHub issue or check existing docs in the `docs/` folder.

Happy replaying! 🏁
