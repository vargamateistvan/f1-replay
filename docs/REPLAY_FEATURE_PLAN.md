# Replay Feature Plan

## Goal

Close the highest-impact feature and UX gaps in the replay experience without widening scope unnecessarily. Prioritize features that already have data available in the app and only need presentation or local state changes.

## Priority Order

1. Final classification screen
2. Driver headshots and team branding
3. Sector flag detail on the map and in race control
4. Multi-driver telemetry overlay
5. Fastest sector owner badges
6. Tyre age and degradation visualization

## Feature Work

### 1. Final classification screen

Impact: Highest

Problem:
After the chequered flag, replay stops without a podium or final classification view, even though session result data already exists elsewhere in the app.

Existing anchors:

- `src/pages/RaceWeekend.tsx`
- `src/hooks/useStandings.ts`
- `src/api/endpoints.ts`
- `src/api/types.ts`

Plan:

- Add a replay-scoped `useSessionResult(sessionKey)` hook alongside the existing session hooks.
- Detect replay end state using session end time and chequered-flag race control entries.
- Render a final classification overlay or full-width panel in replay when the session is effectively complete.
- Show finishing position, driver, team, laps completed, gap or duration, and DNF/DNS/DSQ state.
- Keep this separate from the season standings page so the replay screen can stay session-focused.

Acceptance criteria:

- Race replay shows a final results screen after the chequered flag or session completion.
- Classification data comes from `session_result`, not inferred last-known order.
- DNF, DNS, and DSQ are explicitly labeled.

### 2. Driver headshots and team branding

Impact: High

Problem:
Driver records already include `headshot_url`, but replay surfaces do not use it.

Existing anchors:

- `src/components/LiveTiming/LiveTiming.tsx`
- `src/api/types.ts`
- new final classification component from item 1

Plan:

- Add headshots to the live timing tower rows with a fallback to acronym or team-color markers.
- Reuse the same headshot rendering in the final classification panel.
- Treat team logos as a separate asset decision so headshots are not blocked.
- If team logos are added later, centralize branding rendering in a shared component.

Acceptance criteria:

- Headshots appear in replay when URLs are available.
- Broken or missing images degrade cleanly.
- Layout remains readable on mobile and desktop.

### 3. Sector flag detail

Impact: High

Problem:
Race control entries carry `scope` and `sector`, but replay only shows message text and a session-wide flag tint.

Existing anchors:

- `src/pages/RaceWeekend.tsx`
- `src/components/RaceControl/RaceControl.tsx`
- `src/components/TrackMap/TrackMap.tsx`
- `src/data/circuitGeometryTypes.ts`

Plan:

- Replace the current `activeSectorFlag` string with a richer active flag object that includes `flag`, `scope`, and `sector`.
- Update map overlays so sector-local flags tint only the affected sector instead of the whole circuit.
- Add a sector badge to race control feed entries, for example `Sector 2`.
- Preserve current full-track tint behavior for session-wide conditions like safety car or red flag.

Acceptance criteria:

- Yellow or red flags scoped to a sector visually target that sector on the map.
- Race control feed exposes sector context without relying on freeform message text.
- Session-wide flags still render as global state.

### 4. Multi-driver telemetry overlay

Impact: Medium-high

Problem:
Replay-focused telemetry is single-driver only, which limits comparison workflows.

Existing anchors:

- `src/components/FocusedTelemetry/FocusedTelemetry.tsx`
- `src/pages/Telemetry.tsx`
- `src/utils/telemetry.ts`

Plan:

- Add a secondary comparison driver to replay state.
- Reuse the resampling and delta logic from the full telemetry page instead of duplicating chart math.
- Start with a two-driver comparison only.
- Render a compact replay overlay for speed, throttle, brake, and delta rather than the full telemetry page layout.

Acceptance criteria:

- User can compare two drivers in replay without leaving the replay page.
- Charts stay readable in constrained layout.
- Existing single-driver usage still works when no comparison driver is selected.

### 5. Fastest sector owner badges

Impact: Medium

Problem:
The tower colors sector cells but does not show which driver owns the session-best S1, S2, or S3.

Existing anchors:

- `src/components/LiveTiming/LiveTiming.tsx`
- `src/components/LiveTiming/SectorBar.tsx`

Plan:

- Extend session-best sector tracking to store driver number and lap number, not only the numeric best time.
- Add a compact badge strip above the timing table or in the header showing current fastest S1, S2, and S3 owners.
- Reuse driver acronym and team color for fast scanning.

Acceptance criteria:

- Replay shows current owners of session-best S1, S2, and S3.
- Ownership updates correctly as the playhead advances.

### 6. Tyre age and degradation visualization

Impact: Medium

Problem:
Replay already computes tyre compound and age, but only compound is surfaced consistently.

Existing anchors:

- `src/pages/RaceWeekend.tsx`
- `src/components/LiveTiming/TyreBadge.tsx`
- `src/components/Strategy/StrategyBar.tsx`
- `src/components/TrackMap/TrackMap.tsx`

Plan:

- Add tyre age to existing tyre badges first.
- Surface stint age in the timing tower and strategy strip.
- Consider a lightweight wear cue only after age is visible and useful.
- Avoid inventing degradation models that are not supported by the available data.

Acceptance criteria:

- Current tyre age is visible for active runners.
- Age increments correctly with lap progression.
- Visual treatment does not overpower existing timing information.

## UX and Reliability Follow-up

### Qualifying phase label is too weak

Problem:
Qualifying phase detection exists, but it is buried in a small playback chip.

Plan:

- Promote phase state into a dedicated qualifying banner.
- Add eliminated-driver presentation when a phase ends.
- Keep the playback chip as secondary context, not the primary signal.

### Penalty toasts are noisy

Problem:
Penalty toasts currently treat investigations and confirmed penalties the same.

Existing anchor:

- `src/timeline/events.ts`

Plan:

- Split race control event parsing into investigation, noted, and confirmed penalty classes.
- Reserve interruptive toasts for confirmed sanctions.
- Keep lower-confidence control messages in the feed.

### Retirement detection is fragile

Problem:
Retirement status is inferred from quiet position data and can false-positive.

Existing anchors:

- `src/pages/RaceWeekend.tsx`
- `src/components/LiveTiming/LiveTiming.tsx`

Plan:

- Move retirement detection into a shared utility.
- Use race control corroboration where available.
- Remove duplicated heuristics across replay surfaces.

### No circuit fallback

Problem:
If baked circuit geometry and viable location data are both unavailable, the map falls back to an empty failure state.

Existing anchors:

- `src/hooks/useTrackMap.ts`
- `src/components/TrackMap/TrackMap.tsx`
- `src/data/circuits.ts`

Plan:

- Add a final fallback using static circuit layout metadata.
- Render a coarse outline even when live car positions cannot be projected reliably.
- Make the degraded mode explicit instead of silently broken.

## Recommended Delivery Sequence

1. Final classification screen plus headshots
2. Sector-aware flags plus race control sector badges
3. Qualifying banner plus penalty-toast cleanup
4. Fastest sector badges plus tyre age display
5. Shared retirement-status utility plus circuit fallback hardening
6. Two-driver replay telemetry overlay

## Notes

- Reuse existing replay and telemetry helpers instead of creating parallel logic.
- Prefer session-authoritative APIs like `session_result` over inferred state when both exist.
- Keep first-pass implementations small and shippable; avoid bundling unrelated design rework into the same changes.
