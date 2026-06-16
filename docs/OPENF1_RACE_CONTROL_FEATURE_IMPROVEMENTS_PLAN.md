# F1 Replay - OpenF1 Race Control Feature and Improvement Plan

## Goal

Use OpenF1 `race_control` data as a first-class event stream so replay feels like a live broadcast, while also improving reliability and discoverability across the app.

Primary reference checked: https://openf1.org/docs/#race-control

## What the Race Control API Gives Us

Endpoint: `GET /v1/race_control`

Important fields:

- `category`: event type (SessionStatus, CarEvent, Drs, Flag, SafetyCar, ...)
- `date`: UTC event timestamp
- `driver_number`: optional, driver-specific incidents
- `flag`: GREEN, YELLOW, DOUBLE YELLOW, CHEQUERED, BLACK AND WHITE, ...
- `lap_number`: race lap for anchoring events
- `message`: human-readable event text
- `qualifying_phase`: Q1/Q2/Q3 support
- `scope`: Track, Driver, Sector, ...
- `sector`: mini-sector (when available)
- `session_key`, `meeting_key`

API filtering advantages we should leverage:

- Attribute filtering (for example by `category`, `flag`, `driver_number`)
- Time range filtering (`date>=...&date<...`) for chunked playback loading

## Product Opportunities for f1-replay

### 1) High-Impact Quick Wins (1-3 days)

1. Event severity badges in Race Control feed

- Map `category/flag/message` to severity: info, warning, critical.
- Improves scan speed during scrubbing.

2. Smart event filters

- Toggles for `Flags`, `Safety Car`, `Penalties`, `Session status`, `Driver-specific`.
- Add search over `message`.

3. Timeline markers from race control

- Add colored markers on playback bar for major events.
- Click marker to jump playhead to event time.

4. Driver-centric view

- Clicking a driver in live timing filters race-control events to that driver.
- Great for focused replays and incident analysis.

### 2) Mid-Range Features (3-7 days)

1. Track-sector incident overlays

- Use `scope` + `sector` + existing track rendering to show where yellows/incidents happened.
- Add short-lived pulse animation when event is crossed by playhead.

2. Session phase intelligence

- Use `category=SessionStatus` and `qualifying_phase` to show Q1/Q2/Q3 phase banners.
- Improve Qualifying replay UX significantly.

3. Auto-generated incident summaries

- Build lap-based grouped summaries:
  - "Lap 21: Double yellow sector 2, car 44 noted"
  - "Lap 35: Safety car deployed"
- Feed into existing catch-up/key moments UI.

4. Penalty and investigation tracker

- Parse `message` into structured states: `Noted -> Investigated -> Penalty`.
- Surface per-driver disciplinary timeline.

### 3) Advanced Features (1-2 weeks)

1. Contextual event intelligence

- Correlate race control with:
  - `position` (who gained/lost around incidents)
  - `intervals` (compression around SC/VSC)
  - `pit` (incident-triggered strategy pivots)
  - `overtakes` (passes around restarts)

2. "What changed" cards after major events

- After SC/VSC end or red-flag restart, auto-show:
  - top gainers/losers
  - strategic winners (short stop_duration, undercut windows)

3. Replay chaptering from race control

- Build chapters from event clusters:
  - Start sequence
  - First yellow/incident window
  - Mid-race strategy window
  - SC/restart window
  - Finish

## Technical Improvements Needed

### A) Robust event normalization layer

Create a typed parser that converts raw race_control rows into normalized internal events.

Suggested normalized shape:

- `id`
- `ms` (session-relative timestamp)
- `kind` (flag, safety_car, penalty, session_status, drs, other)
- `severity` (info, warning, critical)
- `driverNumber?`
- `lapNumber?`
- `sector?`
- `title`
- `description`
- `raw`

Why:

- Avoid UI components duplicating parsing logic.
- Safer handling of inconsistent message text.

### B) Event dedup and ordering guarantees

- Sort by `date`, then stable tie-breaker.
- Deduplicate potential duplicates by `(date, category, message, driver_number)` hash.

### C) Resilient missing-data behavior

`driver_number`, `sector`, `lap_number`, and `qualifying_phase` can be null.

- Always render fallbacks.
- Never block event rendering due to optional-field absence.

### D) Query strategy tuned for replay performance

- For historical replay loads, request event chunks by time window.
- Cache by `session_key + range`.
- Preload around playhead (for example +/- 2-5 minutes).

## Concrete API Query Patterns to Add

1. All critical race-control events in a session:

- `/v1/race_control?session_key={sessionKey}&category=SafetyCar`
- `/v1/race_control?session_key={sessionKey}&flag=RED`

2. Driver incident history:

- `/v1/race_control?session_key={sessionKey}&driver_number={driverNumber}`

3. Time-window chunking for replay:

- `/v1/race_control?session_key={sessionKey}&date>={startIso}&date<{endIso}`

4. Qualifying-phase scoped insights:

- `/v1/race_control?session_key={sessionKey}&qualifying_phase=1`

## Prioritized Delivery Plan

### Phase 1 - Foundation (must-have)

- Build race-control normalization utility.
- Add severity mapping and UI badges.
- Add timeline markers + jump-to-event.
- Add defensive null-safe rendering.

Definition of done:

- No runtime crashes with null optional fields.
- Event markers visible and clickable on playback bar.
- Severity style is consistent in feed and toasts.

### Phase 2 - UX and Storytelling

- Add event filters and message search.
- Add driver-focused event mode.
- Add incident summary cards grouped by lap/time windows.

Definition of done:

- User can isolate incidents quickly by event class or driver.
- Summary cards stay accurate while scrubbing.

### Phase 3 - Cross-Endpoint Intelligence

- Correlate race_control with `pit`, `position`, `intervals`, `overtakes`.
- Ship "what changed" cards for SC/VSC/restart windows.
- Add replay chaptering from clustered events.

Definition of done:

- App explains consequence, not only raw event.
- User can jump directly to strategic turning points.

## Suggested Success Metrics

- Time-to-insight: reduce clicks/time required to understand key incidents.
- Event interaction rate: marker clicks, filter usage, chapter jumps.
- Replay retention: longer average session duration after feature launch.
- Reliability: zero race-control related render crashes.

## Risks and Mitigations

1. Message format drift from upstream API

- Mitigation: parser with tolerant regex and safe fallback labels.

2. Rate-limit pressure during aggressive scrubbing

- Mitigation: chunk cache and prefetch windows using existing throttled API client.

3. Overloaded UI with too many markers/toasts

- Mitigation: collapse minor events and expose importance filter.

## Optional Next Extensions

- Add race-control export (`csv=true`) for power users.
- Build "Incident Replay Mode" that auto-plays only event windows.
- Add weekend-level stewards dashboard using `meeting_key` scoped queries.
