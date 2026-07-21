# Analytics Events (GA4)

This document defines the client-side analytics events emitted via `trackEvent()`.

## Setup

Enable GA4 by setting this in `.env.local`:

```dotenv
VITE_GA_MEASUREMENT_ID=G-XXXXXXXXXX
```

When unset, analytics calls are no-op.

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
  - Trigger: route change

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
  - Params: `format`
  - Trigger: PNG export click

### RaceWeekend View Logic

- `raceweekend_focus_changed`
  - Params: `focus_driver`, `compare_driver`, `source`
  - Trigger: focus/compare state changes
- `raceweekend_tracker_tab_changed`
  - Params: `tab`, `source`
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
