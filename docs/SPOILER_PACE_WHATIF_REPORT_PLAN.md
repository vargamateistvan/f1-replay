# F1 Replay — Spoiler-free mode, Stint pace, What-if simulator, Race report (2026-10-21)

Four features, built in this order because each one leans on the one before:

| # | Feature | Size | Depends on |
| - | ------- | ---- | ---------- |
| A | Spoiler-free mode | M | — |
| B | Tyre degradation & stint pace | M | — |
| C | Undercut / "what if" simulator | L | B (pace model), `utils/pitRejoin.ts` |
| D | Auto race report | L | A (gating), B (strategy section) |

A and B can be built in parallel. C needs B's model. D comes last because it is the biggest spoiler of all and must respect A from day one.

Every new magic number goes in `src/constants.ts`; every new derivation is a pure, unit-tested function in `utils/`.

---

## A. Spoiler-free mode 🔵 M

**Goal**: someone watching a race days later can open the app without learning the result before they've replayed it.

### What leaks today

The replay panels are already safe: `LiveTiming`, `GapChart`, `LapChart`, `StrategyBar`, `PitFeed`, `OvertakeFeed` and `KeyMoments` are all cut off at the playhead (`sessionTimeMs`), and `FinalClassificationDialog` only unlocks after the chequered flag. The leaks are elsewhere:

| Surface | Leak |
| ------- | ---- |
| `pages/Standings.tsx` (all tabs), `TitleOutlookBanner`, `PointsProgressionChart`, `ResultsGrid`, `TeammateComparison` | Results of every finished round |
| `pages/DriverProfile.tsx`, `pages/ConstructorProfile.tsx` | Round-by-round results |
| `PlaybackBar` | The chequered-flag marker and the scrubber length show when the race ends (minor; e.g. a red-flagged race that never restarts) |
| `?t=` share links | Can drop you after the finish |
| Race report (feature D) | The whole result |

### Design

- **Setting** `spoilerFreeMode: boolean` (default `false`) in `AppSettings`, under a new "Spoilers" group in `SettingsModal`. Like `tourSeenVersion`, it survives a settings reset.
- **Watched sessions**: a new persisted Zustand store `stores/watched.ts` (`useWatched`, localStorage), kept separate from settings so the map doesn't bloat `AppSettings`:
  ```ts
  interface WatchedState {
    watched: Record<number, number>; // sessionKey → epoch ms marked watched
    markWatched(sessionKey: number): void;
    unmark(sessionKey: number): void;
  }
  ```
  Capped at `WATCHED_SESSIONS_MAX` entries (drop the oldest).
- **When a session counts as watched** (pure `utils/spoilers.ts`):
  - Race / Sprint: the playhead passes `chequeredMs` (already computed in `RaceWeekend`).
  - Other sessions: the playhead reaches the last `SPOILER_WATCHED_TAIL_MS` before `date_end`.
  - Live sessions are always "watched" (you're watching them live).
  - Manual: a "Reveal results" button wherever content is hidden (asks to confirm), and "Mark as watched" in the session picker.
- **`isSpoilerHidden(session, { enabled, watched, now })`** in `utils/spoilers.ts` is the single rule every surface calls, plus a `useSpoilerGate(session)` hook wrapping it.

### Surface behaviour

- **Standings and profiles**: rather than blurring everything, show the championship **as of the last round you've watched in order** ("Standings after Round 14 — 3 newer rounds hidden"). `useStandings` gets an optional `throughRound` cut-off and drops sessions after it before calling `computeStandings`, so every tab (progression, results grid, teammates, title outlook) stays consistent automatically. Profiles use the same cut-off. Hidden rounds show as a locked column with a "Reveal" button.
- **Session picker**: unchanged. Session names give nothing away.
- **PlaybackBar**: while hidden, drop the chequered-flag marker and snap the visible scrubber end to `max(playhead + SPOILER_SCRUB_LOOKAHEAD_MS, last watched point)`, so neither the length nor the marker shows when the race ends. Dragging past the end still works; the bar just grows as you go.
- **`?t=` links**: if a link lands after the finish of a hidden session, show a "This link starts after the finish — reveal / start from the beginning" prompt instead of seeking.
- **Race report**: see D.

### Tests

- `utils/spoilers.test.ts`: watched rule per session type, live override, cut-off round selection with gaps (watched R12 and R14 but not R13 → cut-off is R12).
- `useStandings` with `throughRound`.
- `Standings.test.tsx`: locked rounds render, Reveal unlocks.
- `PlaybackBar`: no chequered marker while hidden.

### Open questions (default chosen in brackets)

1. Should the next-race banner in `Nav` be hidden too? [No, it only shows the schedule]
2. Should practice/quali results count as spoilers on the standings pages? [No, standings only use races and sprints]

---

## B. Tyre degradation & stint pace 🔵 M

**Goal**: see how fast each driver was on each stint and how quickly their tyres dropped off.

### Model — `utils/stintPace.ts` (pure)

```ts
interface StintPaceLap { lap: number; tyreAge: number; seconds: number; corrected: number; clean: boolean; reason?: ExcludeReason }
interface StintPace {
  driverNumber: number; stintNumber: number; compound: Stint["compound"];
  lapStart: number; lapEnd: number;
  laps: StintPaceLap[];
  cleanLaps: number;
  avgPaceS: number | null;     // mean of clean, fuel-corrected laps
  degSPerLap: number | null;   // least-squares slope vs tyre age; null under STINT_MIN_CLEAN_LAPS
  interceptS: number | null;   // fitted pace at tyre age 0 (used by C)
}
buildStintPace(laps, stints, pits, raceControl, sessionStartMs, { cutoffMs, fuelCorrect }): StintPace[]
compoundSummary(stintPaces): Map<compound, { medianDeg, medianIntercept, stints }>
```

- **Tyre age** per lap = `tyre_age_at_start + (lap - lap_start)`, the same maths as `utils/lapContext.ts` `tyreForLap` (reuse it).
- **Dropped laps** (`reason`, shown as hollow dots in the chart): lap 1, pit-out laps (`is_pit_out_lap`), in-laps (`Pit.lap_number`), `lap_duration === null`, laps overlapping SC / VSC / red-flag phases (`getSafetyControlPhase` against each lap's `[date_start, date_start + duration]`), and outliers over `STINT_OUTLIER_PCT` (107 %) of the stint median, which catches traffic and mistakes.
- **Fuel correction** (on by default): `corrected = seconds + FUEL_EFFECT_S_PER_LAP × (lapsRemaining)`, with `FUEL_EFFECT_S_PER_LAP ≈ 0.03`. This takes the "car gets lighter" effect out so the slope reflects the tyres. Total laps come from the race's lap count.
- **Playhead cut-off**: only laps finished by `sessionStartMs + t` count, like every other replay panel (no spoilers, and it updates live).

### UI

- Inside the existing **Strategy** tracker tab (`ttab=strategy`), add a segmented toggle `Stints | Pace | What if` (C fills the third), stored as `?stab=` with `useStringParam`. No new top-level tab, so `MobileNav` stays the same.
- **Pace view** (Recharts, which is already used by `GapChart`/`LapChart`, lazy chunk):
  - Scatter of lap time (y) against lap number or tyre age (x toggle), coloured by compound (reuse the `StrategyBar` compound colours, moved to a shared module), with the fitted line drawn over each stint.
  - Defaults to the focused driver plus the car ahead and behind; a driver multi-select (max `STINT_PACE_MAX_DRIVERS`).
  - A table below: driver · stint · compound · laps (clean/total) · avg pace · deg s/lap · Δ to the field's median on that compound.
  - A compound summary strip: field median deg per compound ("Soft +0.11 s/lap, Medium +0.06, Hard +0.03").
- Races and sprints only; practice long runs are a later follow-up (same model, different lap filter).

### Tests

`stintPace.test.ts`: tyre age with used tyres, every drop reason, SC overlap, outliers, fit on synthetic linear data, `null` under the minimum, cut-off, fuel correction sign. A component test for the toggle and table.

---

## C. Undercut / "what if" simulator 🔵 L

**Goal**: "If Norris pits on lap 18, does he come out ahead of Leclerc once Leclerc stops on lap 21?" Answered from where the replay is now, with the data known at that moment.

### Model — `utils/strategySim.ts` (pure)

Lap-by-lap simulation from the current lap to the end of both pit cycles (+ `SIM_EXTRA_LAPS`):

```ts
interface SimCar { driverNumber: number; gapToLeaderS: number; compound; tyreAge; pitLap: number | null; newCompound }
interface SimResult {
  laps: Array<{ lap: number; gapS: number }>; // A minus B, + = A behind
  finalGapS: number;
  verdict: "a-ahead" | "b-ahead" | "too-close"; // |gap| < SIM_TOO_CLOSE_S
  rejoin: PitRejoinProjection | null;          // A's rejoin position, from projectPitRejoin
}
simulateStrategies(a: SimCar, b: SimCar, pace: PaceModel, pitLoss: PitLossSeconds, track, opts): SimResult
```

- **Lap time** for a car = `intercept(driver, compound) + deg(compound) × tyreAge − fuelEffect × lap`:
  - Current tyres: the driver's own current stint from B (`interceptS`, `degSPerLap`), falling back to the field median for that compound when the stint has too few clean laps.
  - New tyres: the field median for the new compound from `compoundSummary`, shifted by the driver's pace offset to the field (so a fast car stays fast). Default when nobody has run the compound yet: `SIM_COMPOUND_DEFAULT_DELTA_S` (Soft −0.6 / Medium 0 / Hard +0.4 vs Medium) with `SIM_COMPOUND_DEFAULT_DEG`.
  - Out-lap warm-up penalty: `SIM_OUT_LAP_PENALTY_S`.
- **Pit lap** adds the baked pit loss: `pitLossFor(parsePitLoss(geometry.pitLoss), track)`, so it is cheaper under SC/VSC (the simulator takes an "assume SC" toggle).
- **Start gap**: `latestGapsToLeader(intervals, nowUtc)`, the same function the rejoin projection uses.
- **Out of scope (stated in the UI as "ignores traffic & dirty air")**: traffic, DRS trains, dirty air. A later version could add a flat `SIM_TRAFFIC_PENALTY_S` when the rejoin projection puts the car within 1 s of another.

### UI — Strategy tab → "What if"

- Driver A = the focused driver (or first battle pair); Driver B = the car ahead by default (a swap button and pickers).
- Per driver: a pit lap stepper and new-compound chips. Defaults: A pits next lap, B pits 3 laps later. B never defaults to their real next stop, because that would leak future data.
- Output: a big verdict ("Undercut works: NOR ahead by 1.4 s after LEC stops"), a small gap-over-laps line chart, and A's rejoin position plus who they rejoin behind (reuse the `PitRejoinGhost` wording).
- "Show on map": hands the chosen pit lap to the existing pit-window ghost.
- **Hindsight check** (only once the playhead has passed both actual stops, so no spoilers): "Prediction vs reality: predicted +1.4 s, actual +0.9 s." This doubles as the tuning loop for the constants.
- Races only (as the pit rejoin projection), hidden when the circuit has no baked `pitLoss`.

### Tests

`strategySim.test.ts`: equal cars → pitting first wins by roughly `deg × lapsOffset + tyre delta`; SC pit loss; fallback to field median and to defaults; rejoin delegation; too-close band. Plus a regression test against one real race fixture (a well-known undercut) to keep the constants honest.

---

## D. Auto race report 🔵 L

**Goal**: a written recap of a race or sprint, made from templates (no AI), where every line links back to the moment in the replay.

### Route & data

- **Route**: `/report?year=&meeting=&session=`, the same query shape as the replay, so `replayPath` stays the source of truth. A new `pages/RaceReport.tsx` (lazy) and a `reportPath()` helper in `utils/url.ts`. `replayPath` gets an optional `t`.
- **Hook** `hooks/useRaceReport.ts` composes the existing `useSession.ts` hooks: drivers, laps, positions, pits, stints, race control, overtakes, `session_result`, `starting_grid`, plus `["sessionResult", qualiKey]` for pole. It's about 10 requests, but all with `staleTime: Infinity` and usually already cached from the replay. No new endpoints.
- **SEO**: add `/report` to `seo-routes.json` (noindex until it proves useful) and call `usePageSeo` with "<Race name> <year> — race report" once the data loads.

### Builder — `utils/raceReport.ts` (pure)

```ts
interface ReportLine { text: string; t?: number; drivers?: number[]; kind: ReportKind }
interface RaceReport {
  headline: string;            // "Verstappen wins the Dutch GP by 4.2 s from Norris"
  facts: { winner; marginS; pole; fastestLap; laps; scPeriods; dnfs };
  sections: Array<{ title: string; lines: ReportLine[] }>;
}
buildRaceReport(input): RaceReport
```

Sections, each built only when there's something to say:

1. **Summary**: winner, margin, podium, pole → win conversion ("won from P3").
2. **The start**: places gained or lost on lap 1 (`starting_grid` vs the end-of-lap-1 positions); the biggest gain and the biggest loss.
3. **How it unfolded**: lead changes (from `buildKeyMoments`), SC/VSC/red flags (`getSafetyControlPhase`) with laps and what changed around them, and retirements (`deriveRetiredDrivers`), all in time order.
4. **Strategy**: winning strategy (compounds and stop laps), number of stops across the field, best and worst degradation (B), and **undercuts detected**: pairs within `REPORT_UNDERCUT_WINDOW_S` before the first stop that swapped places across the pit cycle, credited to whoever stopped first. A "Simulate" link opens C pre-filled.
5. **Movers**: grid → finish gains, with drivers of the day ranked by places gained (not a fan vote).
6. **Penalties & incidents**: penalties and investigations from race control.

Text comes from small template functions per `kind`, using driver acronyms or surnames, `formatRingGap`-style number formatting and correct ordinals. Every line with a `t` gets a "▶ Watch" link (`replayPath({ …, t: t - REPORT_WATCH_LEAD_MS })`).

### Entry points

- A "Race report" button in `FinalClassificationDialog` and a chip on the PlaybackBar after the chequered flag.
- The Standings → Results grid round header links to the report (`reportHref`, the same optional-prop pattern as `raceHref` / `MaybeLink`).

### Spoiler interplay

With spoiler-free mode on and the session not watched, `/report` shows only the cover (race, date, circuit) and "Watch the replay" / "Reveal report" buttons. The `<title>` and meta tags stay neutral until revealed.

### Tests

`raceReport.test.ts` with fixture data covering each section: a plain win, a win from off pole, an SC that reshuffles the order, an undercut pair, DNFs, a race with no overtakes (the section is skipped, not left empty), and a red flag. Snapshot the rendered text of one real race fixture. A page test for the spoiler cover.

---

## Constants to add (`src/constants.ts`)

`WATCHED_SESSIONS_MAX`, `SPOILER_WATCHED_TAIL_MS`, `SPOILER_SCRUB_LOOKAHEAD_MS`,
`STINT_MIN_CLEAN_LAPS`, `STINT_OUTLIER_PCT`, `FUEL_EFFECT_S_PER_LAP`, `STINT_PACE_MAX_DRIVERS`,
`SIM_EXTRA_LAPS`, `SIM_TOO_CLOSE_S`, `SIM_OUT_LAP_PENALTY_S`, `SIM_COMPOUND_DEFAULT_DELTA_S`, `SIM_COMPOUND_DEFAULT_DEG`,
`REPORT_UNDERCUT_WINDOW_S`, `REPORT_WATCH_LEAD_MS`.

## Cross-cutting

- **Analytics** (`docs/ANALYTICS_EVENTS.md`): `spoiler_mode_toggled`, `spoiler_revealed`, `strategy_view_changed`, `whatif_simulated`, `race_report_opened`, `race_report_watch_clicked`.
- **Tour**: add a step for the Strategy tab's Pace / What-if toggle (`data-tour` target) and bump `TOUR_VERSION`.
- **Docs**: update `AGENTS.md` (§3 layout, §5 catalogue, §7 algorithms for the stint pace model and the simulator) as each feature lands.

## Milestones

1. ✅ **A1** — `utils/spoilers.ts`, `stores/spoilers.ts`, setting, auto-mark at the chequered flag, Standings/profile round cut-off. Changes from the design above: the on/off switch lives in `stores/spoilers.ts` (not `AppSettings`), so a settings reset can never reveal results; and a `knownBeforeMs` point (now − 7 days when turned on) decides which older results count as already known, so turning the mode on doesn't hide the whole season.
2. ✅ **A2** — PlaybackBar marker/length hiding (plus the End key), `?t=` prompt. Not done: "Mark as watched" in the session picker. It's a native `<select>`, so there's no room for a per-option button, and Reveal on the standings notice already covers it.
3. **B1** — `utils/stintPace.ts` + tests.
4. **B2** — Strategy tab toggle + Pace chart + table.
5. **C1** — `utils/strategySim.ts` + tests (including the real-race regression).
6. **C2** — What-if UI, map hand-off, hindsight check.
7. **D1** — `utils/raceReport.ts` + tests.
8. **D2** — `/report` page, entry points, spoiler cover, SEO.

Each milestone is one PR that is safe to ship on its own.
