# Ring view

> Current reference (moved out of `AGENTS.md`). Code: `utils/lapProgress.ts`, `components/TrackRing/` (`ringModel.ts`, `lapTimeProfile.ts`, `RingLayers.tsx`).

Inspired by MultiViewer's "Circle of Doom": a dial spaced by **time**, so the angle between two cars is their gap and a pit stop is a fixed slice of the circle.

- Each car's interpolated position is projected onto the nearest outline *segment* (not vertex) of the 2D map's outline → lap (distance) fraction 0–1. The last matched segment per car is the next search hint (±`RING_SEARCH_WINDOW` segments), which also keeps cars on their own stretch where a track crosses itself; a match further than `RING_OFF_TRACK_M` falls back to a full scan.
- Time spacing (`mapRingTimeScale`, default on; `lapTimeProfile.ts`): every `RING_REF_REFRESH_MS` of playhead, each car's last `RING_REF_TRACE_WINDOW_MS` is traced and its latest full lap (two start-line crossings, no pit samples or data gaps) kept; laps within `RING_REF_LAP_SPREAD` of the fastest are averaged into a distance → time-fraction profile. A much slower new profile (safety car) doesn't replace the last good one nearby in time. Before the first full lap the dial is spaced by distance. `toDisplay` / `displayArc` (`ringModel.ts`) apply the profile and the flip (`mapRingReverse`) to everything drawn: cars, corners, sectors, pit lane.
- Pit lane: a car more than 5 m off the line and closer to the baked pit-lane path (`data/pitLanes.ts`) than to the track goes on the inner arc, at `entry + laneFraction × span`. Without a baked path, cars > `RING_OFF_TRACK_M` off the line drop to a dashed inner circle. Never on the coarse `layout` fallback outline (not to scale).
- Races: labels carry the gap to the car ahead or the leader (`mapRingGapMode`, toolbar toggle; `formatRingGap`). Only `RaceWeekend`'s current leader (position timeline) reads LEAD — OpenF1 reports several cars at 0 s during pit cycles, and those stale zeros are also dropped before the pit rejoin projection.
- Pit window (focused car, races, `mapShowPitRejoin`): ghost at the car's time fraction − pit loss / reference lap, with the projected position from `pitRejoinView`.
- Centre: lap counter, track status chip, reference lap time.
- Labels are spread with 1D cluster merging (`layoutRingLabels`), cut at the widest empty stretch so 12 o'clock isn't special; pit cars' labels go inside.
- Sector 2/3 start at their first marshal post (as the 3D map), equal thirds without posts.
- The map mode setting is `mapViewMode` (`"2d" | "3d" | "ring"`); `migrateSettings` (persist v1) maps the legacy `mapView3d` boolean onto it.
