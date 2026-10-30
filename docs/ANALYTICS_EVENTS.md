# Analytics Events (GA4 + Amplitude)

This document defines the client-side analytics events emitted via `trackEvent()`.
Every event (including `page_view`, `page_engagement` and `app_session_started`)
is sent to both GA4 and Amplitude with the same name and parameters.

## Amplitude

`src/lib/amplitude.ts` lazy-loads `@amplitude/analytics-browser` once the page
is idle; events tracked earlier are queued and replayed after `init`. The
built-in project key can be overridden with `VITE_AMPLITUDE_API_KEY`.
`VITE_APP_VERSION` is passed as Amplitude's `appVersion`.

Autocapture is limited to sessions (`[Amplitude] Start Session` / `End Session`)
and marketing attribution. Page views, clicks and form interactions are **not**
autocaptured — they're covered by the explicit events below. Queued events are
flushed with `sendBeacon` on `pagehide`.

### Amplitude Session Replay

The browser Session Replay plugin is lazy-loaded only when enabled. In
production, it records a 10% sample of sessions by default. Users can turn off
future recordings with **Settings → General → Session replay**; analytics
events continue to be sent when recording is disabled. The SDK uses Amplitude's
`medium` masking level, which masks form inputs. Verify the project's
Session Replay privacy settings and a test recording in Amplitude before
production rollout.

## Setup

Enable GA4 by setting this in `.env.local`:

```dotenv
VITE_GA_MEASUREMENT_ID=G-XXXXXXXXXX
VITE_APP_VERSION=1.2.3
```

When unset, analytics calls are no-op.

For GitHub Pages deployments, set `VITE_GA_MEASUREMENT_ID` in the deploy
workflow environment (or repository variable) so the production build can emit
events.

`VITE_APP_VERSION` is sent as both the `app_version` event parameter and the
`app_version` user property.

### Important: viewing app_version in GA4

GA4's built-in **App version** dimension (`appVersion`, shown under
User → Tech details / User Technology reports) is populated **only** from
Firebase-linked mobile app data streams. It will always show `(not set)` for
a web (`gtag.js`) property like this one, no matter what we send from the
client — this is a GA4 platform limitation, not a bug in this app's code.

To see the release version for this web app in GA4, register a **custom
dimension** instead of relying on the built-in App version report:

1. In GA4, go to **Admin → Custom definitions → Create custom dimension**.
2. Set:
   - Dimension name: `App version` (or similar)
   - Scope: `Event`
   - Event parameter: `app_version`
3. Save. It can take a few hours for new events to populate the custom
   dimension after it's created (retroactive backfill is not supported).
4. To report on it, build a new **Explore** report (not the User Technology
   report) and add your custom dimension (e.g. "App version") as the
   dimension — the built-in "App version" field under User Technology will
   remain `(not set)` regardless.

## Event Naming Rules

- Use lowercase snake_case.
- Prefix by feature area (`nav_`, `playback_`, `trackmap_`, `telemetry_`, `settings_`, `raceweekend_`, etc.).
- Prefer one stable event with parameters over many near-duplicate events.

## Standard Parameter Rules

- Use numeric IDs as numbers (`session_key`, `meeting_key`, `driver_number`).
- Use `-1` for intentionally cleared/unset numeric values in interaction events.
- Use short enum-like strings for modes/sources (`source`, `reason`, `preset`, `tab`, `view`).

## Event Dictionary

### Page + Generic

- `page_view`
  - Params: `page_path`, `page_location`, `page_title`
  - Trigger: pathname change. Query-string and hash changes (including replay
    playhead/speed updates) do not count as new page views; `page_path` is the
    pathname only.
- `page_engagement`
  - Params: `engagement_time_msec`, `exit_reason`, `page_path`
  - Trigger: pathname change, tab hidden/page exit, or tracker unmount. Replay
    playhead/speed URL updates do not split page engagement.

### Session Picker

- `sessionpicker_latest_event`
  - Params: `year`, `meeting_key`
  - Trigger: user clicks "Latest Event"
- `sessionpicker_year_changed`
  - Params: `year`
  - Trigger: year select change
- `sessionpicker_meeting_changed`
  - Params: `meeting_key`
  - Trigger: event select change
- `sessionpicker_session_changed`
  - Params: `session_key`
  - Trigger: session select change

### Top Navigation / Header

- `nav_logo_clicked`
  - Params: `destination`
  - Trigger: logo click
- `nav_view_changed`
  - Params: `view`, `source`
  - Trigger: main view tab switch (desktop/mobile)
- `nav_settings_opened`
  - Params: `source`
  - Trigger: settings button click
- `nav_help_opened`
  - Params: `source`
  - Trigger: help button/menu click
- `nav_year_changed`
  - Params: `year`
  - Trigger: nav year select change
- `nav_meeting_changed`
  - Params: `meeting_key`
  - Trigger: nav event select change
- `nav_session_changed`
  - Params: `session_key`
  - Trigger: nav session select change
- `nav_latest_event`
  - Params: `year`, `meeting_key`
  - Trigger: nav "Latest" button
- `nav_next_agenda_opened`
  - Params: `source`
  - Trigger: next-weekend banner open action
- `nav_next_agenda_closed`
  - Params: `reason`
  - Trigger: next-weekend agenda modal close
- `nav_next_banner_hidden`
  - Params: none
  - Trigger: hide next-weekend banner button

### Mobile Navigation

- `mobile_nav_navigate`
  - Params: `destination`
  - Trigger: mobile nav/menu navigation
- `mobile_nav_more_toggled`
  - Params: `expanded`
  - Trigger: mobile "More" toggle

### Help Modal

- `help_modal_opened`
  - Params: none
  - Trigger: help modal visible
- `help_modal_closed`
  - Params: `reason`
  - Trigger: help modal close (escape/backdrop/button)

### Settings Modal + Controls

- `settings_modal_opened`
  - Params: none
  - Trigger: settings modal visible
- `settings_modal_closed`
  - Params: `reason`
  - Trigger: settings modal close (escape/backdrop/button)
- `settings_changed`
  - Params: `setting_key`, `setting_value`
  - Trigger: setting mutation from controls
- `settings_reset_defaults`
  - Params: none
  - Trigger: reset-to-defaults button

### Playback Bar

- `playback_speed_changed`
  - Params: `speed`
  - Trigger: speed chip click
- `playback_toggle`
  - Params: `action`, `current_ms`
  - Trigger: play/pause click
- `playback_jump`
  - Params: `action`, `current_ms`, `target_ms`
  - Trigger: jump controls/chips
- `playback_marker_jump`
  - Params: `marker_type`, `target_ms`
  - Trigger: race-control marker click
- `playback_markers_toggled`
  - Params: `enabled`
  - Trigger: marker legend toggle
- `playback_incident_replay_current`
  - Params: `current_ms`
  - Trigger: current incident replay
- `playback_incident_replay_next`
  - Params: `current_ms`
  - Trigger: next incident replay

### Track Map

- `trackmap_driver_selected`
  - Params: `driver_number`
  - Trigger: click driver dot
- `trackmap_zoom_changed`
  - Params: `zoom`
  - Trigger: zoom in/out buttons
- `trackmap_zoom_reset`
  - Params: none
  - Trigger: reset zoom button
- `trackmap_rotation_changed`
  - Params: `direction`
  - Trigger: rotate buttons
- `trackmap_rotation_reset`
  - Params: `rotation`
  - Trigger: reset rotation button
- `trackmap_snapshot_export`
  - Params: `format`, `view` (`3d` from the 3D map; absent for 2D)
  - Trigger: PNG export click
- `trackmap_view_mode_changed`
  - Params: `mode` (`2d` | `3d`)
  - Trigger: 3D button on the 2D map / 2D button on the 3D map
- `trackmap3d_camera_mode_changed`
  - Params: `mode` (`follow` | `chase` | `orbit`)
  - Trigger: camera button on the 3D map
- `trackmap3d_map_load`
  - Params: `circuit_key`
  - Trigger: a Mapbox map instance is created (each is a billed map load). The map is kept across sessions at the same circuit.
- `trackmap3d_recenter`
  - Trigger: fit-track / follow-car button, or "Resume follow" after panning the 3D map

### RaceWeekend View Logic

#### Replay startup

These milestones fire once per session selection. Shared parameters:
`session_key`, `elapsed_ms`, `live`, `needs_location` (whether the map is
visible). Elapsed time starts at replay-page mount, including initial session
discovery; it restarts on subsequent session switches.

- `replay_load_started`: a session key has been selected.
- `replay_session_ready`: session metadata is available.
- `replay_timing_ready`: nonempty drivers and position data, laps and race
  control have loaded successfully. Intervals may still be loading.
- `replay_location_ready`: the visible map's current GPS chunk loaded
  successfully with nonempty location data.
- `replay_data_ready`: timing is ready and, if the map is visible, location
  data is ready. This measures data availability, **not** map paint or a
  successful playback interaction. Empty/error responses do not count as
  location readiness.

Use `app_session_started` → `replay_data_ready` → existing interaction events
(`playback_toggle` with `action=play`, `playback_jump`, or
`raceweekend_focus_changed`) as an activation funnel. Segment by
`screen_class`, `live`, `needs_location`, and `app_version`. Visitors without a
readiness milestone indicate potential pre-readiness abandonment; do not rely
only on unload events. Compare like-for-like views: mobile timing does not
require GPS. Recordings sample only 10% of sessions.

#### Interactions

- `replay_welcome_viewed`
  - Trigger: first-use replay introduction dialog is shown (once, persisted).
- `replay_welcome_dismissed`
  - Params: `reason` (`dismiss` | `play` | `tour`)
  - Trigger: explicit dismissal, successful preview start, or optional tour selection.
- `replay_welcome_play_requested`
  - Params: `mode` (`race_start` | `session_start`), `target_ms`
  - Trigger: primary welcome action; destination GPS is loaded before playback.
- `replay_welcome_play_started`
  - Params: `mode`, `target_ms`
  - Trigger: preview GPS is available and playback starts at 1x in the tracker.
- `replay_welcome_play_failed`
  - Params: `reason` (`empty_location` or the thrown error's name)
  - Trigger: preview GPS is empty or fails; playback is not started.
- `tour_started`
  - Params: `source` (`welcome` from the introduction; other manual entry points
    retain their existing source)
  - Trigger: explicit tour selection, never automatic startup.

Compare `replay_welcome_viewed` → `replay_welcome_play_requested` →
`replay_welcome_play_started` with overall replay readiness and existing
playback/driver interactions. Tour completion is not required for activation.

- `raceweekend_focus_changed`
  - Params: `focus_driver`, `compare_driver`, `source`
  - Trigger: focus/compare state changes
- `raceweekend_tracker_tab_changed`
  - Params: `tab` (`timing` `map` `strategy` `deg` `chart` `gap`), `source`
  - Trigger: tracker tab change
- `raceweekend_commentary_tab_changed`
  - Params: `tab`
  - Trigger: commentary tab change
- `raceweekend_commentary_time_mode_changed`
  - Params: `mode`
  - Trigger: elapsed/all mode toggle
- `raceweekend_commentary_play_window`
  - Params: `start_ms`, `end_ms`
  - Trigger: play incident window action

### Telemetry Page

- `telemetry_mode_best_all`
  - Params: none
  - Trigger: best-all action
- `telemetry_mode_sync_to_a`
  - Params: `source_lap`
  - Trigger: sync laps to driver A
- `telemetry_mode_quali`
  - Params: none
  - Trigger: quali mode button
- `telemetry_mode_race`
  - Params: none
  - Trigger: race mode button
- `telemetry_shared_lap_changed`
  - Params: `lap_number`
  - Trigger: shared lap selector
- `telemetry_cards_toggled`
  - Params: `expanded`
  - Trigger: preview card accordion
- `telemetry_driver_changed`
  - Params: `slot`, `driver_number`
  - Trigger: driver selector change
- `telemetry_lap_changed`
  - Params: `slot`, `lap_number`
  - Trigger: lap selector change
- `telemetry_lap_preset`
  - Params: `slot`, `preset`
  - Trigger: best/latest quick action

## Notes For Contributors

- If you add or rename analytics events, update this file in the same PR.
- Keep parameters stable to preserve GA dashboards and funnels.
- Avoid sending high-cardinality free text values.
