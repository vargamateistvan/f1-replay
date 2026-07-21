# F1 Replay Traffic Growth Backlog

## Purpose

Translate the traffic strategy into implementation-ready work for this repository.

This backlog prioritizes product and SEO changes that can be shipped from the current codebase with clear file ownership and measurable outcomes.

## Priority Order

1. Strengthen indexable route coverage.
2. Improve metadata and on-page relevance for existing public pages.
3. Make replay and telemetry states easier to share.
4. Instrument acquisition and sharing so future work is measurable.
5. Add lightweight content blocks for historical session pages.

## Now / Next / Later

### Now

- Expand SEO coverage for public route types the app already supports.
- Improve metadata generation beyond the current static route table.
- Add shareable URL state for exact replay and telemetry moments.
- Instrument share interactions and landing-page performance.

### Next

- Add session-level intro and summary blocks for historical sessions.
- Create deeper route patterns for meeting, session, and comparison views.
- Improve social preview specificity for deep links.

### Later

- Round recap pages.
- Retention loops such as email or push.
- Automated race-week content publishing.

## Epic 1: Route SEO Expansion

### Why

The current SEO system is route-based and mostly static. It covers only top-level pages in [seo-routes.json](/Users/mavarga/Documents/f1-replay/seo-routes.json) and [src/components/Seo/RouteSeo.tsx](/Users/mavarga/Documents/f1-replay/src/components/Seo/RouteSeo.tsx). That leaves long-tail session and comparison intent underexposed.

### Scope

Create a route model that supports page variants driven by search params or future path segments, while preserving the current static SEO pipeline.

### Tasks

1. Audit all current public route states that are already user-meaningful.
2. Define canonical route patterns for:
   - Home session view
   - Telemetry comparison view
   - Standings view
   - Historical meeting/session deep links
3. Extend the SEO layer so metadata can vary by selected meeting, session, and drivers.
4. Decide which states stay query-param-based and which should become path-based.

### Likely files

- [src/components/Seo/RouteSeo.tsx](/Users/mavarga/Documents/f1-replay/src/components/Seo/RouteSeo.tsx)
- [src/routes.tsx](/Users/mavarga/Documents/f1-replay/src/routes.tsx)
- [seo-routes.json](/Users/mavarga/Documents/f1-replay/seo-routes.json)
- [scripts/load-seo-routes.mjs](/Users/mavarga/Documents/f1-replay/scripts/load-seo-routes.mjs)
- [scripts/generate-sitemap.mjs](/Users/mavarga/Documents/f1-replay/scripts/generate-sitemap.mjs)
- [scripts/generate-route-shells.mjs](/Users/mavarga/Documents/f1-replay/scripts/generate-route-shells.mjs)

### Acceptance criteria

1. A clear canonical strategy exists for public entry pages.
2. Search engines can discover more than the three current product surfaces.
3. Metadata is specific to the visible content, not only the base route.

## Epic 2: Page Relevance For Existing Screens

### Why

The app already has strong feature depth, but landing pages still rely heavily on interactive UI and relatively little crawlable context.

### Scope

Add indexable, human-readable context to existing pages without turning the product into an article site.

### Tasks

1. Add short descriptive intro content to [src/pages/RaceWeekend.tsx](/Users/mavarga/Documents/f1-replay/src/pages/RaceWeekend.tsx) for stable historical sessions.
2. Add contextual copy to [src/pages/Telemetry.tsx](/Users/mavarga/Documents/f1-replay/src/pages/Telemetry.tsx) for selected driver and lap comparisons.
3. Review [src/pages/Standings.tsx](/Users/mavarga/Documents/f1-replay/src/pages/Standings.tsx) for keyword coverage tied to round, season, and constructors.
4. Ensure headings, subheadings, and summary text reflect the selected state.

### Likely implementation direction

- Historical sessions should render a compact summary block above or near the main replay layout.
- Telemetry should describe the current comparison, such as selected drivers, lap numbers, and what the charts show.
- Standings should explain whether the view is current season or selected year context.

### Acceptance criteria

1. Each public page has crawlable context that matches user intent.
2. The copy is specific enough to support long-tail queries.
3. The added text does not materially hurt the product-first layout.

## Epic 3: Deep-Link Sharing

### Why

The app already preserves some state in URL params through [src/hooks/useSearchParamState.ts](/Users/mavarga/Documents/f1-replay/src/hooks/useSearchParamState.ts) and [src/hooks/useTimelineUrlSync.ts](/Users/mavarga/Documents/f1-replay/src/hooks/useTimelineUrlSync.ts). That is the shortest path to product-led traffic.

### Scope

Make exact replay and telemetry states easy to copy and share from the UI.

### Tasks

1. Add a copy-link action for the current replay timestamp.
2. Add a copy-link action for telemetry comparison state.
3. Add share entry points in high-intent surfaces:
   - Playback bar
   - Key moments
   - Catchup summary
   - Telemetry controls
4. Ensure URL state includes everything required to reconstruct the shared view.

### Likely files

- [src/hooks/useTimelineUrlSync.ts](/Users/mavarga/Documents/f1-replay/src/hooks/useTimelineUrlSync.ts)
- [src/hooks/useSearchParamState.ts](/Users/mavarga/Documents/f1-replay/src/hooks/useSearchParamState.ts)
- [src/components/PlaybackBar.tsx](/Users/mavarga/Documents/f1-replay/src/components/PlaybackBar.tsx)
- [src/components/CatchupSummary/CatchupSummary.tsx](/Users/mavarga/Documents/f1-replay/src/components/CatchupSummary/CatchupSummary.tsx)
- [src/pages/Telemetry.tsx](/Users/mavarga/Documents/f1-replay/src/pages/Telemetry.tsx)

### Acceptance criteria

1. Users can copy a link to a specific replay moment.
2. Users can copy a link to a specific telemetry comparison.
3. Opening the shared link restores the meaningful state without manual re-selection.

## Epic 4: Social Preview Specificity

### Why

The current Open Graph and Twitter metadata in [src/components/Seo/RouteSeo.tsx](/Users/mavarga/Documents/f1-replay/src/components/Seo/RouteSeo.tsx) is route-level and generic. Shared links should feel like exact moments, not generic app pages.

### Scope

Improve title and description specificity first; evaluate richer OG image generation later.

### Tasks

1. Generate per-state titles for telemetry comparisons.
2. Generate per-state descriptions for historical session pages.
3. Ensure canonical and social metadata do not fragment equivalent URLs.
4. Evaluate whether static fallback OG images are sufficient for the first iteration.

### Acceptance criteria

1. Shared links describe the selected content clearly.
2. Canonical handling avoids duplicate-content issues.
3. Metadata quality improves before any dynamic image investment.

## Epic 5: Measurement And Attribution

### Why

Traffic work without instrumentation quickly becomes guesswork.

### Scope

Add just enough analytics to measure landing pages, acquisition source, and share behavior.

### Tasks

1. Audit the current analytics setup, if any.
2. Track landing page type and selected state.
3. Track share-button clicks and copy-link usage.
4. Track referrer and UTM traffic where available.
5. Define a minimal reporting view for weekly review.

### Likely files

- [src/App.tsx](/Users/mavarga/Documents/f1-replay/src/App.tsx)
- [src/routes.tsx](/Users/mavarga/Documents/f1-replay/src/routes.tsx)
- Relevant page and component surfaces that trigger sharing

### Acceptance criteria

1. It is possible to distinguish organic, direct, and social landing behavior.
2. Share interactions are measurable.
3. Future growth decisions can be tied to observed behavior.

## Epic 6: Historical Session Summary Blocks

### Why

Historical sessions are stable, cacheable, and align best with search-driven discovery.

### Scope

Render compact, structured summaries using existing data sources rather than manual editorial work.

### Candidate data sources already in app

- Session info from [src/pages/RaceWeekend.tsx](/Users/mavarga/Documents/f1-replay/src/pages/RaceWeekend.tsx)
- Race control events
- Overtakes
- Team radio
- Session results
- Weather
- Laps and stints

### Tasks

1. Define a reusable summary component for historical sessions.
2. Include facts such as:
   - Session type
   - Circuit / meeting context
   - Winner or top finisher
   - Safety car or red flag count
   - Overtake count where available
   - Notable drivers or incidents
3. Keep the summary server-render-friendly in structure, even if the app remains client-rendered.

### Acceptance criteria

1. Historical session pages gain meaningful text relevance.
2. The summary is generated from existing app data, not manual copy.
3. The component can scale across many sessions.

## First Four Shipping Slices

### Slice 1: Metadata + sitemap audit

#### Deliverable

A small PR that tightens existing route SEO and defines the canonical expansion path.

#### Expected files

- [src/components/Seo/RouteSeo.tsx](/Users/mavarga/Documents/f1-replay/src/components/Seo/RouteSeo.tsx)
- [seo-routes.json](/Users/mavarga/Documents/f1-replay/seo-routes.json)
- [scripts/generate-sitemap.mjs](/Users/mavarga/Documents/f1-replay/scripts/generate-sitemap.mjs)

#### Output

- Better defaults
- Clearer canonical behavior
- A documented route expansion strategy

### Slice 2: Replay timestamp sharing

#### Deliverable

A small PR that lets users copy a deep link to the exact replay moment.

#### Expected files

- [src/components/PlaybackBar.tsx](/Users/mavarga/Documents/f1-replay/src/components/PlaybackBar.tsx)
- [src/hooks/useTimelineUrlSync.ts](/Users/mavarga/Documents/f1-replay/src/hooks/useTimelineUrlSync.ts)

#### Output

- Exact moment sharing
- Measurable copy-link interaction

### Slice 3: Telemetry comparison sharing

#### Deliverable

A small PR that exposes a copy-link action for current telemetry state.

#### Expected files

- [src/pages/Telemetry.tsx](/Users/mavarga/Documents/f1-replay/src/pages/Telemetry.tsx)
- Any shared link utility introduced during Slice 2

#### Output

- Driver comparison links suitable for social and community sharing

### Slice 4: Historical session summary block

#### Deliverable

A small PR that adds a compact crawlable summary for completed sessions.

#### Expected files

- [src/pages/RaceWeekend.tsx](/Users/mavarga/Documents/f1-replay/src/pages/RaceWeekend.tsx)
- New session summary component if needed

#### Output

- Better landing-page relevance for long-tail search

## Suggested Execution Sequence

1. Ship replay timestamp sharing first if the goal is fastest product-led traffic.
2. Ship metadata and canonical improvements first if the goal is search compounding.
3. Ship both before investing in automated content blocks.
4. Add measurement in the same window so impact can be observed immediately.

## Decision Notes

### Query params vs path segments

The current app leans heavily on query params for selected state. That is fine for product behavior, but not all query-driven URLs should be treated as indexable canonical pages. The SEO layer should explicitly separate:

- Canonical public entry URLs that should rank
- Deep share URLs that should be useful but may canonicalize to a broader route

### Historical vs live session pages

Historical sessions are the better first indexing target because they are stable and match evergreen search demand better than live, frequently changing session states.

## Definition Of Done For The Growth Track

1. The app exposes more search-relevant public entry points than the current top-level routes.
2. Users can share exact replay and telemetry states with one action.
3. Landing-page and sharing behavior is measurable.
4. Historical session pages include compact crawlable context generated from app data.
