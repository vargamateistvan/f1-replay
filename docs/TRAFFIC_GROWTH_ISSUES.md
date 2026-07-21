# F1 Replay Traffic Growth Issues

## Purpose

Break the traffic growth strategy into independently shippable implementation issues.

Each issue is scoped as a vertical slice with:

- user outcome
- technical scope
- primary files
- acceptance criteria
- dependencies

## Priority Queue

1. Replay timestamp sharing
2. Telemetry comparison sharing
3. SEO metadata and canonical audit
4. Historical session summary block
5. Landing-page analytics instrumentation
6. Telemetry page contextual copy
7. Standings page contextual copy
8. Search-facing session route expansion

## Issue 1: Replay Timestamp Sharing

### Outcome

Users can copy a link to the exact moment they are watching in a replay and send others directly there.

### Why this first

This is the shortest path to product-led traffic because it turns existing engagement into shareable distribution.

### Scope

- Add a copy-link action for the current replay timestamp.
- Ensure the current session and time state are fully restored on open.
- Show lightweight success feedback after copying.

### Primary files

- [src/components/PlaybackBar.tsx](/Users/mavarga/Documents/f1-replay/src/components/PlaybackBar.tsx)
- [src/hooks/useTimelineUrlSync.ts](/Users/mavarga/Documents/f1-replay/src/hooks/useTimelineUrlSync.ts)
- [src/pages/RaceWeekend.tsx](/Users/mavarga/Documents/f1-replay/src/pages/RaceWeekend.tsx)

### Acceptance criteria

1. Clicking share or copy creates a URL containing the current replay moment.
2. Opening that URL restores the selected session and approximate playback time.
3. The interaction works on desktop and mobile layouts.
4. The UX provides confirmation that the link was copied.

### Dependencies

- Existing timeline URL sync.

## Issue 2: Telemetry Comparison Sharing

### Outcome

Users can share a telemetry comparison with selected drivers, laps, and comparison settings intact.

### Scope

- Add a copy-link action to the telemetry page.
- Preserve selected drivers, lap selections, smoothing state, and card density where appropriate.
- Make the resulting URL suitable for social and community sharing.

### Primary files

- [src/pages/Telemetry.tsx](/Users/mavarga/Documents/f1-replay/src/pages/Telemetry.tsx)
- [src/hooks/useSearchParamState.ts](/Users/mavarga/Documents/f1-replay/src/hooks/useSearchParamState.ts)

### Acceptance criteria

1. Shared telemetry links restore the same comparison state.
2. The copy action is visible without cluttering the controls.
3. The state model is stable enough that users do not need to reselect drivers or laps after opening the link.

### Dependencies

- None beyond current query-param state.

## Issue 3: SEO Metadata And Canonical Audit

### Outcome

Top-level route metadata is cleaner, more consistent, and better prepared for deeper search-targeted entry pages.

### Scope

- Review current route metadata definitions.
- Clarify canonical behavior for top-level product pages.
- Separate generic app routes from public acquisition routes.
- Tighten titles and descriptions where they are too broad.

### Primary files

- [src/components/Seo/RouteSeo.tsx](/Users/mavarga/Documents/f1-replay/src/components/Seo/RouteSeo.tsx)
- [seo-routes.json](/Users/mavarga/Documents/f1-replay/seo-routes.json)
- [scripts/generate-sitemap.mjs](/Users/mavarga/Documents/f1-replay/scripts/generate-sitemap.mjs)

### Acceptance criteria

1. Public routes have explicit canonical behavior.
2. Non-acquisition routes remain noindex where appropriate.
3. Titles and descriptions align with user-facing search intent.
4. Sitemap output remains valid.

### Dependencies

- None.

## Issue 4: Historical Session Summary Block

### Outcome

Completed session pages include a compact, crawlable summary generated from app data.

### Scope

- Add a summary block for non-live sessions.
- Use data already present in the replay page.
- Include a small set of facts that match search intent and improve landing-page relevance.

### Candidate facts

- Meeting name and circuit
- Session type and date
- Winner or leading finisher if available
- Overtake count if available
- Safety car or flag activity summary
- Weather summary if useful and stable

### Primary files

- [src/pages/RaceWeekend.tsx](/Users/mavarga/Documents/f1-replay/src/pages/RaceWeekend.tsx)
- New summary component if extracted

### Acceptance criteria

1. Historical sessions render compact explanatory copy.
2. The summary is based on real session data, not hardcoded text.
3. The block fits the existing visual design and does not bury the replay UX.

### Dependencies

- Existing race weekend data hooks.

## Issue 5: Landing-Page Analytics Instrumentation

### Outcome

Traffic sources and high-value user actions become measurable.

### Scope

- Track landing route type.
- Track whether the user opened a deep link or generic route.
- Track replay-share and telemetry-share actions.
- Capture referrer or UTM signals where available.

### Primary files

- [src/App.tsx](/Users/mavarga/Documents/f1-replay/src/App.tsx)
- [src/routes.tsx](/Users/mavarga/Documents/f1-replay/src/routes.tsx)
- Sharing surfaces introduced in Issues 1 and 2

### Acceptance criteria

1. Share interactions emit analytics events.
2. Landing behavior can be segmented by route type.
3. The tracking model is minimal and does not introduce noisy instrumentation.

### Dependencies

- Depends on deciding or confirming analytics tooling.

## Issue 6: Telemetry Page Contextual Copy

### Outcome

Telemetry landing pages explain what the user is comparing and why the page is useful.

### Scope

- Add a concise intro or summary region.
- Reflect selected drivers and lap context when available.
- Keep the content visible to crawlers and unobtrusive to users.

### Primary files

- [src/pages/Telemetry.tsx](/Users/mavarga/Documents/f1-replay/src/pages/Telemetry.tsx)

### Acceptance criteria

1. The page contains crawlable explanatory text.
2. The copy is specific to telemetry comparisons, not generic product copy.
3. The design remains product-first.

### Dependencies

- None.

## Issue 7: Standings Page Contextual Copy

### Outcome

The standings page better targets season and championship intent.

### Scope

- Add a concise standings summary.
- Clarify whether the page is current-season or selected-season context.
- Improve search relevance for driver and constructor standings queries.

### Primary files

- [src/pages/Standings.tsx](/Users/mavarga/Documents/f1-replay/src/pages/Standings.tsx)

### Acceptance criteria

1. The page contains season-aware crawlable text.
2. The text supports both driver and constructor standings intent.
3. The change preserves the existing visual hierarchy.

### Dependencies

- None.

## Issue 8: Search-Facing Session Route Expansion

### Outcome

The site gains more search-targeted session entry points than the current top-level pages alone.

### Scope

- Define which session states should become canonical entry URLs.
- Extend route handling or metadata derivation to support session-specific variants.
- Ensure sitemap generation can include stable public targets.

### Primary files

- [src/routes.tsx](/Users/mavarga/Documents/f1-replay/src/routes.tsx)
- [src/components/Seo/RouteSeo.tsx](/Users/mavarga/Documents/f1-replay/src/components/Seo/RouteSeo.tsx)
- [seo-routes.json](/Users/mavarga/Documents/f1-replay/seo-routes.json)
- [scripts/generate-route-shells.mjs](/Users/mavarga/Documents/f1-replay/scripts/generate-route-shells.mjs)
- [scripts/generate-sitemap.mjs](/Users/mavarga/Documents/f1-replay/scripts/generate-sitemap.mjs)

### Acceptance criteria

1. Stable historical session targets can be discovered by search engines.
2. Canonical handling prevents duplicate-content fragmentation.
3. The route model remains maintainable.

### Dependencies

- Strongly informed by Issue 3.

## Suggested Sprint Breakdown

### Sprint 1

- Issue 1: Replay timestamp sharing
- Issue 2: Telemetry comparison sharing
- Issue 3: SEO metadata and canonical audit

### Sprint 2

- Issue 4: Historical session summary block
- Issue 5: Landing-page analytics instrumentation
- Issue 6: Telemetry page contextual copy

### Sprint 3

- Issue 7: Standings page contextual copy
- Issue 8: Search-facing session route expansion

## Best Starting Point

If the goal is the fastest distribution win, start with Issue 1.

If the goal is the strongest search foundation, start with Issue 3.

If the goal is balanced progress, ship Issues 1 and 3 in the same cycle, then follow with Issue 4.
