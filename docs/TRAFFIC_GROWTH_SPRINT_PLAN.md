# F1 Replay Traffic Growth Sprint Plan

## Purpose

Sequence the traffic-growth work into delivery-ready sprints with realistic scope, dependencies, and validation steps.

This plan assumes the current goal is to start shipping growth features, not keep expanding strategy documents.

## Planning Assumptions

- One person or a very small team is executing this work.
- Each sprint is roughly one week of focused product work.
- The goal is to ship measurable wins early, then compound them.
- Historical sessions are the safest first SEO surface.

## Delivery Principles

1. Ship shareability before complex content generation.
2. Ship analytics with or immediately after the first share features.
3. Avoid introducing search-facing URL complexity before canonical rules are clear.
4. Prefer small vertical slices that can be validated with the current test and build pipeline.

## Sprint 1: Shareable Moments

### Goal

Turn the existing replay and telemetry experiences into shareable product surfaces.

### Scope

- Replay timestamp sharing
- Telemetry comparison sharing
- Basic share feedback UX

### Issues covered

- [docs/TRAFFIC_GROWTH_ISSUES.md](/Users/mavarga/Documents/f1-replay/docs/TRAFFIC_GROWTH_ISSUES.md): Issue 1
- [docs/TRAFFIC_GROWTH_ISSUES.md](/Users/mavarga/Documents/f1-replay/docs/TRAFFIC_GROWTH_ISSUES.md): Issue 2

### Expected files

- [src/components/PlaybackBar.tsx](/Users/mavarga/Documents/f1-replay/src/components/PlaybackBar.tsx)
- [src/hooks/useTimelineUrlSync.ts](/Users/mavarga/Documents/f1-replay/src/hooks/useTimelineUrlSync.ts)
- [src/pages/RaceWeekend.tsx](/Users/mavarga/Documents/f1-replay/src/pages/RaceWeekend.tsx)
- [src/pages/Telemetry.tsx](/Users/mavarga/Documents/f1-replay/src/pages/Telemetry.tsx)

### Deliverables

1. Replay page can copy a deep link to the current moment.
2. Telemetry page can copy a deep link to the current comparison state.
3. Shared links restore meaningful state on open.
4. The UI confirms link-copy success.

### Validation

1. Add or update focused tests for URL sync behavior where practical.
2. Manually verify deep-link restoration for replay and telemetry views.
3. Run:
   - `yarn test`
   - `yarn build`

### Risks

- URL state may become noisy or unstable if too many transient params are included.
- Mobile layout may not have obvious room for a share action without crowding controls.

### Exit criteria

1. A user can share an exact replay or telemetry state in one action.
2. The shared experience works reliably enough to post publicly.

## Sprint 2: Search Foundations

### Goal

Improve the quality of indexable product pages before expanding route count.

### Scope

- SEO metadata audit
- Canonical cleanup
- Telemetry and standings contextual copy

### Issues covered

- [docs/TRAFFIC_GROWTH_ISSUES.md](/Users/mavarga/Documents/f1-replay/docs/TRAFFIC_GROWTH_ISSUES.md): Issue 3
- [docs/TRAFFIC_GROWTH_ISSUES.md](/Users/mavarga/Documents/f1-replay/docs/TRAFFIC_GROWTH_ISSUES.md): Issue 6
- [docs/TRAFFIC_GROWTH_ISSUES.md](/Users/mavarga/Documents/f1-replay/docs/TRAFFIC_GROWTH_ISSUES.md): Issue 7

### Expected files

- [src/components/Seo/RouteSeo.tsx](/Users/mavarga/Documents/f1-replay/src/components/Seo/RouteSeo.tsx)
- [seo-routes.json](/Users/mavarga/Documents/f1-replay/seo-routes.json)
- [scripts/generate-sitemap.mjs](/Users/mavarga/Documents/f1-replay/scripts/generate-sitemap.mjs)
- [src/pages/Telemetry.tsx](/Users/mavarga/Documents/f1-replay/src/pages/Telemetry.tsx)
- [src/pages/Standings.tsx](/Users/mavarga/Documents/f1-replay/src/pages/Standings.tsx)

### Deliverables

1. Cleaner titles, descriptions, and canonical behavior for current public routes.
2. Crawlable contextual copy on telemetry and standings pages.
3. Sitemap output remains valid after any metadata changes.

### Validation

1. Run any existing SEO-related tests.
2. Verify generated document title, canonical tag, and OG tags for top-level routes.
3. Run:
   - `yarn test`
   - `yarn build`

### Risks

- It is easy to add generic copy that increases text volume but not relevance.
- Canonical behavior can become inconsistent if deep links and ranking pages are not separated cleanly.

### Exit criteria

1. Existing public pages have stronger search positioning.
2. Metadata rules are clear enough to support deeper route work.

## Sprint 3: Historical Session Landing Quality

### Goal

Make historical replay pages stronger landing pages for long-tail search intent.

### Scope

- Historical session summary block
- Initial landing-page analytics instrumentation

### Issues covered

- [docs/TRAFFIC_GROWTH_ISSUES.md](/Users/mavarga/Documents/f1-replay/docs/TRAFFIC_GROWTH_ISSUES.md): Issue 4
- [docs/TRAFFIC_GROWTH_ISSUES.md](/Users/mavarga/Documents/f1-replay/docs/TRAFFIC_GROWTH_ISSUES.md): Issue 5

### Expected files

- [src/pages/RaceWeekend.tsx](/Users/mavarga/Documents/f1-replay/src/pages/RaceWeekend.tsx)
- New summary component if extracted
- [src/App.tsx](/Users/mavarga/Documents/f1-replay/src/App.tsx)
- [src/routes.tsx](/Users/mavarga/Documents/f1-replay/src/routes.tsx)

### Deliverables

1. Historical sessions render compact summary content from real app data.
2. Share actions and landing-route types become measurable.
3. The app can distinguish generic visits from deep-link traffic with minimal instrumentation.

### Validation

1. Verify the summary block appears only where intended.
2. Verify share interactions emit events through the chosen analytics layer.
3. Run:
   - `yarn test`
   - `yarn build`

### Risks

- Analytics work can sprawl if tooling choices are unresolved.
- Session summary logic can become brittle if it assumes data fields are always present.

### Exit criteria

1. Historical sessions are visibly better landing pages.
2. Traffic experiments can be measured instead of guessed.

## Sprint 4: Route Expansion

### Goal

Expand the set of search-facing session entry points without fragmenting canonical authority.

### Scope

- Search-facing session route expansion
- Initial public route pattern rollout for stable historical targets

### Issues covered

- [docs/TRAFFIC_GROWTH_ISSUES.md](/Users/mavarga/Documents/f1-replay/docs/TRAFFIC_GROWTH_ISSUES.md): Issue 8

### Expected files

- [src/routes.tsx](/Users/mavarga/Documents/f1-replay/src/routes.tsx)
- [src/components/Seo/RouteSeo.tsx](/Users/mavarga/Documents/f1-replay/src/components/Seo/RouteSeo.tsx)
- [seo-routes.json](/Users/mavarga/Documents/f1-replay/seo-routes.json)
- [scripts/generate-route-shells.mjs](/Users/mavarga/Documents/f1-replay/scripts/generate-route-shells.mjs)
- [scripts/generate-sitemap.mjs](/Users/mavarga/Documents/f1-replay/scripts/generate-sitemap.mjs)

### Deliverables

1. Stable historical session entry targets are discoverable.
2. Canonical handling prevents duplicate-content sprawl.
3. The route model remains maintainable within the current app structure.

### Validation

1. Validate sitemap and route-shell generation.
2. Verify canonical output for route variants.
3. Run:
   - `yarn build`

### Risks

- This is the first slice with meaningful structural SEO complexity.
- Poor canonical decisions here can dilute rankings rather than improve them.

### Exit criteria

1. Search engines have more stable public targets to discover.
2. The route expansion strategy is working in code, not just on paper.

## Estimated Effort

| Sprint | Theme                      | Effort | Confidence |
| ------ | -------------------------- | ------ | ---------- |
| 1      | Shareable moments          | M      | High       |
| 2      | Search foundations         | M      | Medium     |
| 3      | Historical landing quality | M      | Medium     |
| 4      | Route expansion            | M-L    | Medium-low |

## Recommended Start

If you want the fastest visible win, execute Sprint 1 first.

If you want the strongest SEO base before adding more public targets, execute Sprint 2 first.

If you want balanced momentum, do Sprint 1 and Sprint 2 back-to-back, then decide whether Sprint 3 or Sprint 4 should follow based on analytics readiness.

## Stop Conditions

Pause and reassess if any of these happen:

1. Canonical rules become unclear after Sprint 2.
2. Analytics tooling is still undecided by the start of Sprint 3.
3. Share links restore inconsistent or incomplete state during Sprint 1.

## Definition Of Ready For Implementation

An issue is ready to build when:

1. The target user action is explicit.
2. The state model and URL behavior are defined.
3. The likely file owners are known.
4. A validation path exists using the current test and build commands.
