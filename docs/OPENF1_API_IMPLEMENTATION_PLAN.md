# OpenF1 API Implementation Plan

## Objective

Close OpenF1 coverage gaps and upgrade the data pipeline so standings, metadata, filtering, and exports are aligned with the latest API capabilities while preserving current UX stability.

## Scope

- Add missing endpoints and types.
- Rework standings to use official championship endpoints with fallback behavior.
- Introduce generic filtering support.
- Surface richer meeting/session metadata in the UI.
- Add CSV export support.
- Improve resilience for "latest" usage and sparse data endpoints.
- Update docs and tests.

## Phase 1: API Foundation

### Goals

- Add missing OpenF1 endpoint coverage.
- Align type definitions with current OpenF1 docs.

### Tasks

1. Add endpoint functions:
   - championship_drivers
   - championship_teams
2. Add and extend API types:
   - Championship drivers payload type
   - Championship teams payload type
   - Meeting fields: circuit_image, circuit_info_url, circuit_type, country_flag, date_end, is_cancelled
   - Race control field: qualifying_phase
3. Add deprecation notes where relevant:
   - Driver country_code
   - Pit pit_duration (already partially handled)

### Acceptance Criteria

- TypeScript compiles successfully with strict mode.
- Existing hooks and components remain functional.
- New endpoint functions are available from the API layer.

---

## Phase 2: Standings Rework

### Goals

- Use official championship endpoints as primary data source.
- Keep robust fallback to current computed standings path.

### Tasks

1. Create hooks:
   - useChampionshipDrivers
   - useChampionshipTeams
2. Refactor standings data flow:
   - Prefer championship endpoints when available.
   - Fallback to session_result-based aggregation when unavailable.
3. Preserve current page contract so UI changes remain low-risk.

### Acceptance Criteria

- Standings page shows official championship position and points when available.
- Fallback rendering works for years or sessions with missing endpoint data.
- No regression in page loading or error handling.

---

## Phase 3: Filterable Data Access

### Goals

- Expose OpenF1 filtering capabilities in a reusable, non-breaking way.

### Tasks

1. Add optional filter objects for endpoint wrappers.
2. Support date windows and attribute filters (for example date>=, date<, driver_number, category, flag, qualifying_phase).
3. Keep existing method signatures backward-compatible.
4. Apply filtered queries to at least one production path (race control and laps preferred).

### Acceptance Criteria

- Existing endpoint calls still work unchanged.
- Filtered endpoint calls are type-safe.
- At least one feature path uses the new filters in production code.

---

## Phase 4: UX Enhancements From New API Data

### Goals

- Surface richer meeting/session context and improve sparse-data UX.

### Tasks

1. Add meeting metadata to relevant UI areas:
   - Circuit image
   - Country flag
   - Circuit type
   - Cancelled status
2. Add quick-load for latest meeting/session.
3. Improve team radio empty states for sparse 2026+ sessions.

### Acceptance Criteria

- New metadata appears in session navigation context.
- Sparse team radio sessions show explicit non-error messaging.
- Latest quick-load works without breaking explicit session selection.

---

## Phase 5: CSV Export Support

### Goals

- Expose OpenF1 csv=true functionality in app workflows.

### Tasks

1. Add API/client utility for CSV requests.
2. Add CSV export actions to key panels:
   - Race control
   - Laps
   - Weather
   - Overtakes
3. Ensure export respects current filtering/session context.

### Acceptance Criteria

- CSV downloads are valid and open correctly.
- Exported rows match visible filtered context.
- Export UX is discoverable and non-disruptive.

---

## Phase 6: Documentation and QA

### Goals

- Align project docs with OpenF1 realities.
- Add coverage for new data paths and fallback behavior.

### Tasks

1. Update README data availability statement to match OpenF1 historical scope.
2. Add tests for:
   - New endpoint hooks
   - Standings endpoint-first + fallback behavior
   - Type mapping and optional field handling
3. Add integration coverage for standings rendering with championship payloads.

### Acceptance Criteria

- yarn test passes.
- yarn lint passes.
- README reflects current OpenF1 data constraints accurately.

---

## Recommended Delivery Sequence

1. Phase 1: API Foundation
2. Phase 2: Standings Rework
3. Phase 3: Filterable Data Access
4. Phase 4: UX Enhancements
5. Phase 5: CSV Export Support
6. Phase 6: Documentation and QA

## Risk Management

1. Preserve backward compatibility in endpoint method signatures.
2. Use fallback-first strategy for standings to avoid empty states.
3. Treat all newly introduced fields as optional at render time.
4. Ship in small PRs by phase to simplify rollback.

## Suggested PR Breakdown

1. PR 1: Endpoints and types (Phase 1)
2. PR 2: Championship hooks and standings refactor (Phase 2)
3. PR 3: Generic filters in API layer + first integration (Phase 3)
4. PR 4: Metadata UI and sparse-data handling (Phase 4)
5. PR 5: CSV export support (Phase 5)
6. PR 6: Docs and test hardening (Phase 6)
