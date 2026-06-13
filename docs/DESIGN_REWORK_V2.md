# Design Rework V2 — F1.com Live Timing Reference

> Reference: F1.com Live Timing (Spain 2026 Qualifying screenshots)  
> Goal: Make f1-replay match F1.com's live timing aesthetic as closely as possible.

---

## 1. What the screenshots reveal

### 1.1 Global chrome
| Zone | F1.com | Current app |
|---|---|---|
| Top bar | Red (#E8002D) full-width strip: F1 logo + "SPAIN 2026 / QUALIFYING" + nav tabs (Leaderboard / Driver Tracker / Commentary) + ⚙ ✕ | Black header with session picker dropdowns |
| Sub-tab bar | White background, black text, bold underline on active tab (Laps · Sectors · Segments · Tyres) | Inline tab pills on dark bg |
| Flag banner | Full-width solid yellow/red/SC band: flag icon + "YELLOW FLAG" in black bold caps | Inline pill in PlaybackBar |
| Bottom status bar | "Q1 0:07:08" countdown + "Air temperature: 31°C" + TAG Heuer logo | None |

### 1.2 Timing tower columns
```
POS | [team-color bar] DRIVER | BEST LAP | GAP | S1 | S2 | S3 | TYRE | LAPS
```
Key details:
- **POS**: plain number, no background
- **Team colour bar**: 2 px left border OR 3×10 px coloured rectangle to the left of the driver name
- **DRIVER**: SURNAME ONLY in bold caps, ~13px, white. Number/first name hidden.
- **BEST LAP**: coloured monospace time — purple = session fastest, green = fast, white = normal
- **GAP**: grey monospace (no colour)
- **Sector bars (S1/S2/S3)**: NOT text — short filled rectangles (~32×8 px):
  - Purple = sector-fastest overall
  - Yellow/lime = personal best for that driver
  - Green = fast-but-not-best
  - White/grey = normal
  - Empty = not set yet
- **TYRE**: circle badge with compound letter (S/M/H/I/W in matching colours) + stint count digit
- **LAPS**: plain number, right-aligned

Row states:
- Even rows: transparent; odd rows: very slight lighter shade (~rgba(255,255,255,0.03))
- Hovered row: rgba(255,255,255,0.06) highlight
- Current fastest driver row: faint purple left glow

### 1.3 Driver Tracker layout
- Two-column: **left panel** (280–320 px) = timing/lap data; **right** = track map fills remainder
- Track map: dark grey (#1a1a24) background, white/light-grey circuit outline (2–3 px stroke), no fill
- Car dots: team-coloured filled circles (~6 px), no label unless hovered
- Zoom controls: icon buttons in top-right corner of map pane
- Rotate/reset: icon buttons in top-left corner of map pane
- Left panel sub-tabs: Laps · Sectors · Head to Head · Telemetry

### 1.4 Typography
| Use | F1.com style |
|---|---|
| Driver surname | `font-weight: 700`, `letter-spacing: 0.05em`, `text-transform: uppercase`, ~13px |
| Times (lap/gap) | Tabular monospace, `font-variant-numeric: tabular-nums` |
| Column headers | `font-size: 10px`, `font-weight: 600`, `letter-spacing: 0.1em`, `text-transform: uppercase`, `color: #a3a3a3` |
| Flag banners | `font-weight: 900`, `letter-spacing: 0.2em`, `text-transform: uppercase` |
| Tab labels | `font-weight: 700`, ~12px, uppercase or sentence-case depending on context |

---

## 2. Colour tokens to add / update

```ts
// tailwind.config.ts additions
'f1-purple':  '#9b59f5',   // fastest lap / sector
'f1-yellow':  '#f5d400',   // personal best sector
'f1-green':   '#39b54a',   // fast-but-not-best sector
'f1-white':   '#e0e0e0',   // normal sector / default time
'f1-sc':      '#f5a623',   // safety car banner
's-soft':     '#e8002d',   // soft tyre
's-medium':   '#f5a623',   // medium tyre
's-hard':     '#e0e0e0',   // hard tyre
's-inter':    '#39b54a',   // intermediate
's-wet':      '#1e90ff',   // full wet
'row-alt':    'rgba(255,255,255,0.025)',
'row-hover':  'rgba(255,255,255,0.06)',
```

---

## 3. Component changes

### 3.1 `AppHeader` (rename/replace current top bar)
**Current**: session picker row with dropdowns.  
**Target**: two-layer chrome:

```
┌─────────────────────────────────────────────────────────────────────┐
│ [F1 logo]  SPAIN 2026  ·  QUALIFYING        [Leaderboard] [Driver   │  ← bg-f1red, h-10
│                                              Tracker] [Commentary]  │
│                                             [⚙] [✕]                │
└─────────────────────────────────────────────────────────────────────┘
┌─────────────────────────────────────────────────────────────────────┐
│ LIVE ●   Year ▾   Event ▾   Session ▾               Loading…       │  ← bg-surface, h-9
└─────────────────────────────────────────────────────────────────────┘
```

- Session picker dropdowns move to the second sub-bar (smaller, less prominent).
- Main nav tabs (Leaderboard / Driver Tracker / Commentary) live in the red bar.
- Auth-failure banner inserts between the two bars.

### 3.2 `FlagBanner` — new component
Full-width strip shown when `raceControl` has an active flag event at `t`.

```tsx
// colours by flag type
const BANNER: Record<string, {bg: string; text: string; icon: string}> = {
  YELLOW:       { bg: '#f5d400', text: '#000',    icon: '⚑' },
  RED:          { bg: '#e8002d', text: '#fff',    icon: '⚑' },
  SAFETY_CAR:   { bg: '#f5a623', text: '#000',    icon: '🚗' },
  VIRTUAL_SAFETY_CAR: { bg: '#f5a623', text: '#000', icon: 'VSC' },
  CHEQUERED:    { bg: '#fff',    text: '#000',    icon: '🏁' },
  CLEAR:        { bg: 'transparent', text: 'transparent', icon: '' },
}
```

Rendered between `AppHeader` and the main content area, height 28px, animated fade-in.

### 3.3 `TimingTower` — full rewrite
Replace current live timing list with a proper tower:

**Sector bar sub-component**:
```tsx
function SectorBar({ status }: { status: 'fastest' | 'personal' | 'fast' | 'normal' | null }) {
  const colours = {
    fastest:  'bg-f1-purple',
    personal: 'bg-f1-yellow',
    fast:     'bg-f1-green',
    normal:   'bg-f1-white/60',
  }
  if (!status) return <div className="w-8 h-2 bg-[#2a2a35]" />
  return <div className={`w-8 h-2 ${colours[status]}`} />
}
```

**Tyre badge sub-component**:
```tsx
// "2 S" → circle coloured by compound + digit
function TyreBadge({ compound, count }: { compound: string; count: number }) { ... }
```

**Row layout** (CSS Grid, not flexbox, for perfect column alignment):
```
grid-template-columns: 2.5rem 1px 10rem 1fr 4.5rem 2.5rem 2.5rem 2.5rem 3.5rem 3rem
//                     pos   bar  name  gap  best   s1    s2    s3    tyre  laps
```

### 3.4 `TrackMap` layout — Driver Tracker mode
Add a layout toggle: **Tower mode** (default, full-width tower) vs **Tracker mode** (split panel).

In Tracker mode:
- Left panel 300px fixed, dark bg-surface, scrollable, sub-tabs (Laps · Sectors · H2H · Telemetry).
- Right: `TrackMap` fills remaining width.
- Breakpoint: below 768px collapses to stacked (map top, panel bottom).

### 3.5 `TrackMap` visual update
- Background: `#10101a` (darker than current)
- Circuit path: `stroke="#d8d8d8"` width `2.5`, no fill
- Pit lane: `stroke="#6a6a6a"` dashed
- Car dots: 7px filled circle, team colour, white 1px stroke
- Start/finish line: perpendicular tick mark across circuit outline
- Sector dividers: small tick marks at sector boundaries, coloured by sector status

### 3.6 `PlaybackBar` polish
- Condense vertical height (current feels tall vs F1.com)
- Move flag/pit/overtake jump chips to a collapsible tray (hidden by default, toggle with `⋯` button)
- Session countdown shown as "Q1 0:07:08" style, not raw seconds
- Speed selector as icon-sized compact segmented control

---

## 4. Layout / routing changes

### 4.1 New main-nav structure
Replace current route-based tabs with a **session-scoped view switcher** that keeps the session context intact:

```
/                       → redirect to /#/session
/#/session              → Leaderboard (default)
/#/session?view=tracker → Driver Tracker
/#/session?view=radio   → Commentary / Race Control
```

`useStringParam('view', 'leaderboard')` drives the active view.

### 4.2 View components
| View | Content |
|---|---|
| `LeaderboardView` | FlagBanner + TimingTower (with sub-tabs: Laps/Sectors/Segments/Tyres) + PlaybackBar |
| `TrackerView` | FlagBanner + split: left DataPanel + right TrackMap + PlaybackBar |
| `CommentaryView` | FlagBanner + RaceControlFeed + TeamRadioFeed |

---

## 5. Implementation phases

### Phase R1 — Tokens & chrome (low risk, high visual impact)
- [ ] Add new colour tokens to `tailwind.config.ts`
- [ ] Rewrite `AppHeader`: two-bar layout, red top bar with nav tabs, sub-bar for pickers
- [ ] `FlagBanner` component wired to `raceControl` data
- [ ] Bottom status bar: session clock countdown + weather temp strip

### Phase R2 — Timing tower
- [ ] `SectorBar` component (coloured rectangles)
- [ ] `TyreBadge` component
- [ ] `TimingTower` grid-based layout with all columns
- [ ] Row hover state, fastest-driver glow
- [ ] Sector status computation from `intervals` + lap data

### Phase R3 — Driver tracker view
- [ ] `TrackerView` split layout
- [ ] Left `DataPanel` with Laps/Sectors/H2H/Telemetry sub-tabs
- [ ] `TrackMap` visual updates (darker bg, thinner circuit line, new car dots)
- [ ] View switching via `?view=` URL param

### Phase R4 — Typography & polish
- [ ] Apply `font-variant-numeric: tabular-nums` globally to time displays
- [ ] Driver surname CAPS + weight across all components
- [ ] Compact `PlaybackBar` with collapsible chip tray
- [ ] Smooth flag-banner transition animations

---

## 6. Files affected summary

| File | Change type |
|---|---|
| `tailwind.config.ts` | Add tokens: f1-purple, f1-yellow, f1-green, s-*, row-alt, row-hover |
| `src/components/AppHeader.tsx` | New: replace SessionPicker top chrome |
| `src/components/SessionPicker.tsx` | Shrink: becomes sub-bar inside AppHeader |
| `src/components/FlagBanner.tsx` | New component |
| `src/components/TimingTower/TimingTower.tsx` | Full rewrite |
| `src/components/TimingTower/SectorBar.tsx` | New sub-component |
| `src/components/TimingTower/TyreBadge.tsx` | New sub-component |
| `src/components/TrackMap/TrackMap.tsx` | Visual tweaks: colours, dot size, circuit stroke |
| `src/components/PlaybackBar.tsx` | Compact layout, collapsible chips, countdown format |
| `src/views/LeaderboardView.tsx` | New: FlagBanner + TimingTower + PlaybackBar |
| `src/views/TrackerView.tsx` | New: split panel layout |
| `src/views/CommentaryView.tsx` | New: race control + radio |
| `src/routes.tsx` | Switch view param instead of separate routes |
| `src/hooks/useSearchParamState.ts` | Add `view` param |
| `src/utils/sectorStatus.ts` | New: compute fastest/personal/fast/normal per sector |
| `index.css` / `tailwind.config.ts` | `tabular-nums` global on time elements |
