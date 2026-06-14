# F1 Replay — Live Broadcast Features Roadmap

A roadmap for the next wave of features, themed around **making the replay feel like a
live TV broadcast**. The seed idea — *radio messages popping up in the Driver Tracker
view* — generalizes into a transient, time-synced notification layer that surfaces events
as the playhead crosses them, instead of requiring the user to switch to a feed tab.

All the underlying data is already fetched and timestamped (`team_radio`, `race_control`,
`overtakes`, `pits`, `laps`, `intervals`). What's missing is the *presentation layer* that
reacts to playback time.

Severity/type: 🟢 quick win · 🔵 feature · 🟠 infra · ⭐ centerpiece
Effort: S (<½ day) · M (~1 day) · L (multi-day)

---

## 0. The core abstraction: a time-synced event toast system ⭐

Everything in §1 is one reusable mechanism. Build this first; each event type is then a
thin adapter.

**Mechanism.** As the coarse playhead `t` advances (see [useCoarseTime.ts](../src/hooks/useCoarseTime.ts)),
fire a transient notification for any event whose session-relative time falls inside a
"just crossed" window `[t - WINDOW, t]`. This is the same pattern already used for
`pulseDrivers` in [RaceWeekend.tsx:141](../src/pages/RaceWeekend.tsx#L141) (`ms <= t && t - ms <= OVERTAKE_PULSE_MS`),
generalized.

Key behaviors:
- **Only fire on forward playback**, not on scrub-back or large jumps (track last-seen `t`;
  if `t` jumped backward or by more than a few seconds, suppress — otherwise jumping the
  playhead would dump 50 toasts).
- **Auto-dismiss** after N seconds; cap the visible stack (e.g. 3–4), newest on top.
- **De-dupe** by event id so the same event doesn't re-toast across frames.
- Respect a global **on/off toggle** (and per-type filters) in the playback bar.

**Suggested files:**
- `src/hooks/useEventToasts.ts` — consumes event arrays + `t`, returns the active toast list.
- `src/components/EventToast/EventToastStack.tsx` — fixed-position stack (top-right of the
  tracker view), one renderer per event type, slide-in/fade-out.
- `src/timeline/events.ts` — already extracts event times; extend with typed event objects
  (`{ id, ms, kind, payload }`) so the hook has a single normalized stream.

- **Effort:** M for the framework · then S per event type below.

---

## 1. Event toasts (built on §0)

### 1.1 Radio message pop-up 🔵 — *the seed idea*
When the playhead crosses a `team_radio` entry, pop a card: team-colour bar, driver
acronym, a ▶ button, and (optional) auto-play. Reuses the row design already in
[TeamRadio.tsx](../src/components/TeamRadio/TeamRadio.tsx).
- **Bonus:** *Auto-play radio during playback* — when playback is running and a clip's time
  is crossed, play it automatically (sync the broadcast). Toggle in the playback bar; pause
  playback-audio when the user scrubs.
- **Effort:** S (card) + S (auto-play)

### 1.2 Race-control / flag toast 🔵
Yellow, red, SC, VSC, penalties, investigations pop up as they're issued. Colour-coded to
the existing [FlagBanner](../src/components/FlagBanner.tsx) / [RaceControl](../src/components/RaceControl/RaceControl.tsx)
palette. Penalties (`message` contains "PENALTY"/"INVESTIGATION") get a distinct icon.
- **Effort:** S

### 1.3 Overtake toast 🔵
`HAM ▸ VER  P3` momentary banner as a pass completes — complements the existing on-map
pulse rings (`pulseDrivers`). Pulls from `overtakes` + `driverByNumber`.
- **Effort:** S

### 1.4 Fastest-lap flash 🟣
Purple "FASTEST LAP — VER 1:32.456" toast when a new session-best lap is set. LiveTiming
already computes `sessionBest.lap` ([LiveTiming.tsx:153](../src/components/LiveTiming/LiveTiming.tsx#L153));
lift that into shared state or recompute from `laps`.
- **Effort:** S–M

### 1.5 Pit-stop toast 🔵
"BOX — NORRIS · 2.4s" when a `pit` event is crossed; show `pit_duration` when present.
- **Effort:** S

---

## 2. On-map broadcast overlays 🔵

### 2.1 Mini-leaderboard overlay on the track map
Top-5 (P, acronym, gap) pinned to a map corner so the Tracker view doesn't force a
tab-switch to read order. Driven by the same data as [LiveTiming](../src/components/LiveTiming/LiveTiming.tsx).
- **Effort:** M

### 2.2 Marshalling-sector flag colouring
When a yellow/SC is active in a sector, tint that sector region of the track (the sector
geometry already exists in [circuits.ts](../src/data/circuits.ts) and is drawn in
[TrackMap.tsx](../src/components/TrackMap/TrackMap.tsx)). Turns the map into a live flag display.
- **Effort:** M

### 2.3 Focused-driver HUD
When a driver is focused (follow-cam already implemented), pin a HUD card: current speed,
gear, throttle/brake bars, last lap, gap ahead/behind. Reuses `useCarDataForLap` /
`FocusedTelemetry`.
- **Effort:** M

---

## 3. Storytelling / navigation 🔵

### 3.1 "Key Moments" auto-reel
A curated, clickable timeline of the big events (lead changes, fastest laps, SC/red-flag
periods, retirements). One click jumps the playhead there. Builds on the jump-chip
infra already in the playback bar and `timeline/events.ts`.
- **Effort:** M

### 3.2 Catch-up summary on jump
When the user jumps the playhead forward, show a brief "while you were away" digest of the
events skipped (passes, flags, pits) — so scrubbing doesn't lose the narrative.
- **Effort:** M

### 3.3 Radio jump-chips on the timeline 🟢
Add team-radio markers to the playback bar's existing lap/pit/flag/pass jump chips.
- **Effort:** S

---

## 4. Audio & immersion 🔵

### 4.1 Optional ambient / engine bed (off by default)
Subtle volume tied to throttle of the focused car. Niche; gated behind a toggle.
- **Effort:** L · low priority

### 4.2 Sound cues for toasts 🟢
Short, distinct cues for radio / flag / overtake toasts (respect a mute toggle; default off).
- **Effort:** S

---

## 5. Suggested execution order

**Milestone E — Broadcast notifications (the headline)**
1. ⭐ §0 event-toast framework (`useEventToasts` + `EventToastStack` + normalized events)
2. 🔵 1.1 radio pop-up (the seed) + auto-play
3. 🔵 1.2 race-control/flag toast · 1.3 overtake toast
4. 🟣 1.4 fastest-lap flash · 1.5 pit toast
5. 🟢 3.3 radio jump-chips (cheap, complements 1.1)

**Milestone F — On-map broadcast layer**
6. 🔵 2.1 mini-leaderboard overlay
7. 🔵 2.2 marshalling-sector flags · 2.3 focused-driver HUD

**Milestone G — Narrative**
8. 🔵 3.1 key-moments reel · 3.2 catch-up summary
9. 🟢 4.2 toast sound cues (optional) · 4.1 engine bed (optional, low priority)

---

## 6. Top 3 if time is short

1. **§0 + 1.1 — the event-toast framework with the radio pop-up.** Delivers the requested
   feature *and* the reusable foundation for every other notification in one go.
2. **1.2 + 1.3 — flag and overtake toasts.** Two more adapters on the same framework;
   together they make the replay feel genuinely live.
3. **2.1 — mini-leaderboard map overlay.** Removes the biggest reason to tab-switch in the
   Tracker view, the same friction the radio pop-up addresses.
</content>
