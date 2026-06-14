# Mobile Design Plan

> Target: phones (360–430 px wide) and small tablets (600–768 px).  
> Approach: bottom navigation, collapsed timing tower, full-screen map, touch-friendly playback.

---

## 1. Breakpoint strategy

| Token       | Width      | Purpose                           |
| ----------- | ---------- | --------------------------------- |
| _(default)_ | 0–599 px   | Phone — stacked, bottom nav       |
| `sm`        | 600–767 px | Compact tablet — slight expansion |
| `md`        | 768+ px    | Desktop — current layout          |

All new responsive work targets the default (phone) and sm breakpoints.  
The existing `md:` rules in RaceWeekend stay untouched.

---

## 2. Navigation

### 2.1 Top bar (phone)

The two-bar chrome is too tall on a 667px screen. On phones:

- **Red top bar** shrinks to `h-9` (from `h-10`).
- Session header label (`BAHRAIN · RACE`) is hidden (already has `hidden sm:block`).
- The three view tab buttons (Leaderboard / Driver Tracker / Commentary) **move to the bottom nav bar** — see §2.2.
- Telemetry / Standings links collapse into a `⋯` icon button that opens a small drawer.

### 2.2 Bottom navigation bar (phone only, `md:hidden`)

A fixed bottom bar replaces the top view tabs:

```
┌──────────┬──────────────┬──────────────┐
│  ≡ TOWER │  ◉ TRACKER   │  📡 COMMENTARY│
└──────────┴──────────────┴──────────────┘
  44px tall, bg-track, border-t border-panel
  Active tab: text-white + top border in f1red
```

Implementation: a new `MobileNav` component rendered from `routes.tsx` only when `md:hidden`.

### 2.3 Session picker sub-bar (phone)

The sub-bar with three selects wraps to two rows on narrow screens. The `min-w-44` on the Event select is too wide — change to `min-w-0 w-full sm:min-w-44` so it expands full width on phone.

---

## 3. Leaderboard view (phone)

### 3.1 Compact timing table

9 columns don't fit on a 390px screen. Hide non-essential columns:

| Column   | Phone  | sm+ | md+ |
| -------- | ------ | --- | --- |
| P        | ✓      | ✓   | ✓   |
| Driver   | ✓      | ✓   | ✓   |
| Best Lap | ✓      | ✓   | ✓   |
| Gap      | ✓      | ✓   | ✓   |
| S1       | hidden | ✓   | ✓   |
| S2       | hidden | ✓   | ✓   |
| S3       | hidden | ✓   | ✓   |
| Tyre     | ✓      | ✓   | ✓   |
| Lap      | hidden | ✓   | ✓   |

Implementation: wrap hidden columns in `<th className="hidden sm:table-cell">` and matching `<td>`.

Row height increases to `py-3` on phone for easier tap targets (min 44px touch area).

### 3.2 Strategy strip

Collapses to `max-h-24` (from `max-h-40`) on phone; scrollable horizontally.

---

## 4. Driver Tracker view (phone)

The `w-72` fixed left panel + full-width map doesn't fit on phone.

**Phone layout**: tab-switched, not split:

```
┌──────────────────────────────┐
│  [Timing] [Map] [Chart]      │  ← horizontal scrollable chip bar
├──────────────────────────────┤
│                              │
│  Active panel fills height   │
│  (timing OR map OR chart)    │
│                              │
└──────────────────────────────┘
```

- When "Map" is active: TrackMap fills `100%` of the available height.
- When "Timing" is active: LiveTiming table (compact columns from §3.1).
- When "Chart" is active: LapChart.
- Weather strip becomes a collapsible accordion at the top of the Timing panel.

`md:` layout restores the side-by-side split panel.

---

## 5. Commentary view (phone)

Already mostly vertical — minimal changes:

- Sub-tabs (Race Control / Team Radio / Overtakes) already work on phone.
- Weather strip collapses to a single-line summary (temp + humidity + wind) instead of the full panel, with a `▼` expand toggle.

---

## 6. Playback bar

The current bar has many elements that crowd at 360px. Phone-specific adjustments:

### 6.1 Two-row layout

```
Row 1 (h-8): ◀ ◁  ▶ ▷  [━━━━━●━━━━━━━━━━]  speed
Row 2 (h-8): [lap] [pit] [flag] [pass] chips (horizontal scroll, hidden by default, toggle ⋯)
```

- Scrubber thumb size: `w-5 h-5` (from `w-3 h-3`) for finger tapping.
- Jump chips move to a scrollable second row, collapsed by default.

### 6.2 Touch scrubbing

Add `touch-action: none` on the scrubber track to prevent page scroll interfering with drag.

---

## 7. Flag banner

Already full-width. On phone, increase text to `text-[12px]` for readability at arm's length.

---

## 8. Components with fixed widths to fix

| File                              | Current            | Fix                                                                         |
| --------------------------------- | ------------------ | --------------------------------------------------------------------------- |
| `RaceWeekend.tsx` — tracker panel | `w-72 shrink-0`    | `hidden md:flex md:w-72` (panel hidden on phone; replaced by §4 tab switch) |
| `SessionPicker` event select      | `min-w-44`         | `min-w-0 flex-1 sm:min-w-44`                                                |
| `PlaybackBar` track input         | full width already | add `touch-action: none`                                                    |
| `LiveTiming` table                | 9 fixed columns    | hide S1/S2/S3/Lap on phone (§3.1)                                           |

---

## 9. TrackMap touch interactions

TrackMap is an SVG with car dots. On touch:

- **Single tap** on a car dot: select/deselect focus driver (same as click).
- **Pinch-to-zoom** (Phase R4 deferred): not in this phase.

---

## 10. Implementation phases

### Phase M1 — Layout scaffolding (low risk)

- [ ] `MobileNav` component (bottom bar, `md:hidden`)
- [ ] Hide view tabs from red top bar on phone (`md:flex`, hide on mobile)
- [ ] Fix Session picker select widths for phone
- [ ] Add `md:hidden`/`hidden md:flex` guards around the tracker split panel

### Phase M2 — Timing tower columns

- [ ] Hide S1/S2/S3/Lap columns on phone (`hidden sm:table-cell`)
- [ ] Increase row `py` for touch targets
- [ ] Strategy strip height cap on phone

### Phase M3 — Playback bar

- [ ] Two-row layout on phone (media breakpoint or JS-detected width)
- [ ] Larger scrubber thumb
- [ ] `touch-action: none` on scrubber track
- [ ] Collapse jump chips to second scrollable row

### Phase M4 — Tracker view tab switching

- [ ] Replace split panel with tab chips on phone
- [ ] Weather accordion in Timing panel
- [ ] Full-screen map when "Map" tab is active

### Phase M5 — Polish

- [ ] `text-[12px]` on FlagBanner (phone)
- [ ] Telemetry / Standings accessible via ⋯ drawer in top-right of red bar
- [ ] Orientation change handling (landscape phone → show more columns)

---

## 11. Files affected summary

| File                                       | Change                                                  |
| ------------------------------------------ | ------------------------------------------------------- |
| `src/components/Nav.tsx`                   | Hide view tabs on phone; show ⋯ for Telemetry/Standings |
| `src/components/MobileNav.tsx`             | New: bottom nav bar (phone only)                        |
| `src/routes.tsx`                           | Render `<MobileNav>` below `<main>` on phone            |
| `src/pages/RaceWeekend.tsx`                | Tracker view: tab-switch on phone vs split on md+       |
| `src/components/LiveTiming/LiveTiming.tsx` | Hide columns on phone                                   |
| `src/components/PlaybackBar.tsx`           | Two-row layout + larger thumb                           |
| `src/components/FlagBanner.tsx`            | Slightly larger font on phone                           |
| `src/components/Weather/WeatherPanel.tsx`  | Collapsible accordion variant                           |
| `src/pages/Telemetry.tsx`                  | _(no layout change — accessed from ⋯ drawer)_           |
