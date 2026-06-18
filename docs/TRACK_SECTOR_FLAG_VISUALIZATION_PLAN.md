# Track Sector Flag Visualization Plan

## Goal

Render the track map with sector-accurate flag states over time.

Example behavior:

- If Sector 2 is yellow, only Sector 2 is yellow.
- If Sector 1 is clear but Sector 3 remains yellow, they render independently.
- Global states (for example Red Flag, Safety Car, VSC) apply to all sectors unless a stricter override is active.

## Current State

Current implementation is based on a single latest active flag object:

- [src/pages/RaceWeekend.tsx](src/pages/RaceWeekend.tsx#L486)
- [src/components/TrackMap/TrackMap.tsx](src/components/TrackMap/TrackMap.tsx#L507)

This does not maintain independent sector states over time.

## Proposed Data Model

Replace single active flag usage with a replay-time state snapshot:

```ts
interface TrackFlagState {
  globalFlag: string | null;
  sectorFlags: {
    1: string | null;
    2: string | null;
    3: string | null;
  };
  updatedAtMs: number;
}
```

## State Machine Rules

Process race control entries chronologically up to current playhead time.

1. Sector-scoped events

- If `sector` is 1/2/3 and scope indicates sector-level control, update only that sector.

2. Global/track events

- If scope indicates track/global (or no sector given), update `globalFlag`.

3. Clear events (`GREEN`, `CLEAR`, or clear message)

- Sector-scoped clear: clear only that sector.
- Global clear: clear global flag and reset sectors when message indicates full-track clear.

4. Priority

- `RED` has highest priority and should override all sector rendering.
- `SAFETY_CAR` and `VIRTUAL_SC` are global safety states.
- Sector-specific flags remain visible when no higher-priority global override exists.

## Visual Mapping

Use one central mapping for visual colors:

```ts
const FLAG_COLOR: Record<string, string> = {
  YELLOW: "#f5d400",
  DOUBLE_YELLOW: "#f5d400",
  GREEN: "#39b54a",
  CLEAR: "#39b54a",
  RED: "#e8002d",
  SAFETY_CAR: "#f5a623",
  VIRTUAL_SC: "#f5a623",
};
```

Effective color per sector:

- `effectiveSectorFlag = sectorFlag ?? globalFlag ?? null`

## TrackMap Rendering Changes

### Baked geometry mode

- Color marshal sector dots using effective sector flag.
- Keep non-flag overlays readable with tuned opacity.

### Fallback sector-box mode

- Tint each sector rectangle independently from effective sector state.

### Notes

- Existing marshal-to-sector assignment is currently by thirds of marshal list in [src/components/TrackMap/TrackMap.tsx](src/components/TrackMap/TrackMap.tsx#L388).
- This is acceptable as a first pass but should be replaced with explicit sector IDs in baked geometry.

## Geometry Improvement (Follow-up)

Current `MarshalSector` has no explicit sector ID:

- [src/data/circuitGeometryTypes.ts](src/data/circuitGeometryTypes.ts#L9)

Follow-up:

1. Extend marshal geometry to include `timingSector: 1 | 2 | 3`.
2. Update bake script to populate sector IDs.
3. Remove heuristic "split by thirds" logic.

## Integration Points

1. Compute `TrackFlagState` in replay page from race control stream:

- [src/pages/RaceWeekend.tsx](src/pages/RaceWeekend.tsx#L486)

2. Pass `TrackFlagState` into TrackMap instead of only `activeSectorFlag`.

3. Update map overlays in TrackMap:

- [src/components/TrackMap/TrackMap.tsx](src/components/TrackMap/TrackMap.tsx#L507)

4. Keep settings toggle support:

- [src/stores/settings.ts](src/stores/settings.ts#L21)

## Test Plan

### Unit tests (state machine)

Cover:

- sector set
- sector clear
- global set
- global clear
- red override
- safety car / vsc lifecycle

### Component tests (TrackMap)

Cover:

- independent per-sector tint rendering
- global flag coloring all sectors
- no tint for unknown/unmapped flags

### Regression scenarios

1. Sector 2 yellow, others clear.
2. Sector 1 clear while Sector 3 yellow remains.
3. VSC start then VSC end.
4. Red flag then global clear.

## Delivery Steps

1. Add pure reducer/helper to derive `TrackFlagState` from race control + playhead.
2. Wire reducer result in RaceWeekend.
3. Update TrackMap prop types and rendering logic.
4. Add tests for reducer and rendering.
5. Validate using replay sessions with mixed sector/global race-control events.

## Definition of Done

- Map displays independent flag color per sector.
- Sector state transitions are stable while scrubbing.
- Global safety states render consistently.
- No regression in map performance or readability.
- Tests cover reducer behavior and key render outputs.
