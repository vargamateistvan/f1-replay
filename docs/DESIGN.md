# F1 Replay — Design System (F1.com-Inspired)

The goal is to shift the app's visual language from a "dark hacker dashboard" feel toward the official
Formula 1 website: stark black backgrounds, bold uppercase sans-serif type, sharp geometric shapes,
prominent use of the F1 red, and tight information density with clear visual hierarchy.

---

## 1. Current State vs. Target

| Dimension | Current | Target |
|---|---|---|
| Background | Deep navy (`#1a1a2e` / `#16213e`) | Near-black (`#15151e`) |
| Accent | F1 red `#E8002D` | F1 red `#E8002D` (same, used more boldly) |
| Secondary surfaces | Blue-tinted panels (`#0f3460`) | Dark charcoal (`#1f1f27`) with subtle borders |
| Font | JetBrains Mono only | Formula1 / Inter sans-serif for UI, mono only for data readouts |
| Nav | Pill-shaped active state | Left red bar indicator + uppercase label |
| Borders | Blue-tinted (`panel`) | Thin mid-grey (`#38383f`) |
| Buttons | Rounded pill | Sharp rectangle, uppercase label |
| Badges | Inline colored text | Small colored rectangle chip |
| Tables | Subtle hover | Row separator lines, no background hover fill |

---

## 2. Color Palette

### Semantic tokens (replace current `tailwind.config.ts`)

```ts
colors: {
  // Brand
  f1red:    '#E8002D',   // primary CTA, active states, LIVE indicator
  f1white:  '#FFFFFF',

  // Backgrounds — layered from darkest to lightest
  bg: {
    base:    '#15151e',  // page background (was: track)
    surface: '#1f1f27',  // panels, cards       (was: surface)
    raised:  '#2a2a35',  // inputs, dropdowns   (was: panel)
    overlay: '#38383f',  // hover, selected row
  },

  // Text
  text: {
    primary:  '#FFFFFF',
    secondary:'#a3a3a3', // labels, captions    (was: muted)
    disabled: '#636369',
  },

  // Borders
  border: {
    subtle:   '#2a2a35', // card edges
    default:  '#38383f', // separators, table rows
    strong:   '#636369', // active inputs
  },

  // Sector / timing colours (unchanged)
  purple: '#b48ead',  // personal best sector
  green:  '#39d743',  // faster than prev lap
  yellow: '#ffd600',  // slower than prev lap

  // Team colours are applied inline via teamColor() — not in the theme
}
```

### Key deltas from current

- `track` → `bg.base` — darker, less blue
- `surface` → `bg.surface` — warmer dark, no blue tint
- `panel` → `bg.raised` — used for inputs/chips only, not full panels
- `muted` → `text.secondary` — slightly lighter grey

---

## 3. Typography

### Font stack

The official F1 site uses a proprietary typeface ("Formula1") and falls back to `Inter`.
We cannot bundle the licensed font, so we use Inter (free, closest match) + keep JetBrains Mono for
data readouts.

```css
/* index.css — replace current Google Fonts import */
@import url('https://fonts.googleapis.com/css2?family=Inter:wght@400;500;600;700;800;900&family=JetBrains+Mono:wght@400;600;700&display=swap');
```

```ts
// tailwind.config.ts
fontFamily: {
  sans: ['Inter', 'system-ui', 'sans-serif'],  // add as default
  mono: ['JetBrains Mono', 'Fira Mono', 'monospace'],
},
```

```css
/* index.css */
body {
  @apply bg-[#15151e] text-white font-sans antialiased;
}
```

### Type scale — F1.com conventions

| Role | Size | Weight | Transform | Usage |
|---|---|---|---|---|
| Page title | `text-2xl` | `font-black` (900) | `uppercase tracking-[0.1em]` | Page headers (STANDINGS, TELEMETRY) |
| Section title | `text-xs` | `font-bold` (700) | `uppercase tracking-[0.12em]` | Panel headers (LIVE TIMING, WEATHER) |
| Body / table | `text-sm` | `font-medium` (500) | normal | Driver names, lap times |
| Label | `text-xs` | `font-medium` | `uppercase tracking-wider` | Column headers, picker labels |
| Data readout | `text-sm font-mono` | `font-semibold` | `tabular-nums` | Gap times, sector times, position |
| Badge / chip | `text-[10px]` | `font-bold` | `uppercase tracking-widest` | PIT, LIVE, flag labels |

---

## 4. Components

### 4.1 Navigation Bar

**F1.com pattern:** Black bar, brand mark left, nav links right with uppercase text, active = red underline (not background fill), no rounded corners anywhere.

```
┌─────────────────────────────────────────────────────────────┐
│  F1 REPLAY          RACE WEEKEND   TELEMETRY   STANDINGS    │
│ (red wordmark)                      ↑ active = red underline │
└─────────────────────────────────────────────────────────────┘
```

**Changes from current:**
- Background: `#15151e` (not surface)
- Active state: `border-b-2 border-f1red text-white` (remove `bg-f1red` pill)
- Inactive: `text-[#a3a3a3] hover:text-white` (no hover background)
- Link style: `text-xs font-bold uppercase tracking-[0.12em] py-4 px-4`
- Remove `rounded` from all nav links
- Bottom border: `1px solid #2a2a35`

### 4.2 Panel / Card

**F1.com pattern:** No rounded corners (or `rounded-sm` at most), dark background, thin border, section header with red left-side accent bar.

```
┌─ RED BAR ──────────────────────────┐
│  LIVE TIMING                       │  ← header: uppercase, xs, bold
├────────────────────────────────────┤
│  content                           │
└────────────────────────────────────┘
```

**Panel header (`PANEL_TITLE`) — new pattern:**
```tsx
// Replace current: 'text-xs font-bold text-muted px-3 py-1 border-b border-panel uppercase tracking-wider'
// With:
'flex items-center gap-2 text-xs font-bold uppercase tracking-[0.12em] px-3 py-2 border-b border-[#38383f] before:block before:w-1 before:h-3.5 before:bg-f1red before:rounded-sm'
```

Or as a left-border accent:
```tsx
'text-xs font-bold uppercase tracking-[0.12em] px-3 py-2 border-b border-[#38383f] border-l-2 border-l-f1red'
```

**Panel wrapper:**
- Remove: `bg-surface rounded border border-panel`
- Add: `bg-[#1f1f27] border border-[#2a2a35]` (no `rounded`, or `rounded-sm`)

### 4.3 Buttons

**F1.com pattern:** Sharp rectangle, uppercase bold text, no border-radius.

| Variant | Style |
|---|---|
| Primary | `bg-f1red text-white font-bold uppercase text-xs tracking-widest px-4 py-2` |
| Ghost | `border border-[#636369] text-white font-bold uppercase text-xs tracking-widest px-4 py-2 hover:border-white` |
| Speed chip | `bg-[#2a2a35] text-[#a3a3a3] font-bold uppercase text-[10px] tracking-widest px-2.5 py-1 active:bg-f1red active:text-white` |

No `rounded` on any button. Play/pause button: `rounded-none` or keep as square.

### 4.4 Select / Dropdown

F1.com uses custom dropdowns but we keep native `<select>`. Style update:

```
bg-[#2a2a35] text-white border border-[#38383f] text-xs font-medium px-3 py-1.5
focus:outline-none focus:border-[#636369]
appearance-none  (add chevron via wrapper div)
```

Remove `rounded` or use `rounded-none`.

### 4.5 Tables (Live Timing / Standings)

**F1.com pattern:** Black/dark background, horizontal rule separators only (no vertical lines), bold position column, team color strip on the left of the driver cell.

```
 P   DRIVER                    GAP        INT
──────────────────────────────────────────────
 1   ██ VER  Max Verstappen     LEADER    —
 2   ██ NOR  Lando Norris       +0.723    +0.723
 3   ██ LEC  Charles Leclerc   +1.452    +0.729
```

- Column headers: `text-[10px] font-bold uppercase tracking-widest text-[#636369]`
- Row height: tighter, `py-2` (currently `py-1.5`)
- Position number: `font-black text-base` (bold and slightly larger)
- Driver acronym: `font-black text-sm` colored with `teamColor()`
- Full name: `text-xs text-[#a3a3a3] font-medium`
- Team color strip: `w-[3px] h-5 rounded-none mr-3` (sharp, not rounded-sm)
- Gap column: `font-mono text-sm tabular-nums` — green if gaining, red if losing
- No row hover background; use `border-b border-[#2a2a35]` separator only

### 4.6 Badges / Chips

| Badge | Style |
|---|---|
| PIT | `bg-[#2a2a35] text-[#a3a3a3] text-[10px] font-black uppercase tracking-widest px-1.5 py-0.5` |
| LIVE | `bg-f1red text-white text-[10px] font-black uppercase tracking-widest px-1.5 py-0.5` + pulsing dot |
| SC | `bg-yellow-400 text-black text-[10px] font-black uppercase px-1.5 py-0.5` |
| RED FLAG | `bg-red-600 text-white ...` |
| PURPLE (best sector) | `bg-[#b48ead] text-black ...` |

No `rounded` on badges; sharp rectangle chips.

### 4.7 Race Control / Flag Banner

Currently uses a colored banner at the top. F1.com uses a thin full-width strip.

```
┌──── [⬛] ─ TRACK CLEAR ──────────────────────── 34 ────┐
```

- Height: `h-7` (very slim)
- Left icon: 16×16 flag icon or color dot
- Text: `uppercase font-black text-xs tracking-widest`
- Right: lap counter, right-aligned

### 4.8 Playback Bar

F1.com doesn't have a playback bar (live only), but we can style it with the same language.

```
┌─────────────────────────────────────────────────────────┐
│  ▶  00:23:45  ████████████░░░░░░░░░░░  01:32:00   1×  2×  4× │
└─────────────────────────────────────────────────────────┘
```

- Background: `#15151e` (same as base — recessed into page, not elevated)
- Top border: `1px solid #2a2a35`
- Scrubber: `accent-f1red` (keep), but also style the range track via custom CSS
- Speed buttons: sharp chips, `bg-[#2a2a35]` inactive / `bg-f1red` active, no `rounded`
- Time readout: `font-mono text-sm tabular-nums`

### 4.9 Session Picker

```
YEAR  [2024 ▾]   EVENT  [Bahrain GP ▾]   SESSION  [Race ▾]   ● LIVE
```

- Full bar: `bg-[#15151e] border-b border-[#2a2a35]`
- Labels: `text-[10px] font-bold uppercase tracking-widest text-[#636369]`
- LIVE chip: `bg-f1red px-1.5 py-0.5 text-[10px] font-black uppercase tracking-widest` (sharp rectangle, no rounded)

---

## 5. Layout

### 5.1 Page structure

```
┌──────────────────────────────────┐
│ NAV  (44px)                      │
├──────────────────────────────────┤
│ SESSION PICKER  (36px)           │
├──────────────────────────────────┤
│                                  │
│  MAIN CONTENT  (flex-1)          │
│                                  │
├──────────────────────────────────┤
│ PLAYBACK BAR  (52px)             │
└──────────────────────────────────┘
```

### 5.2 Spacing

F1.com uses tight, consistent 4px-based spacing. Recommended Tailwind tokens:

| Purpose | Class |
|---|---|
| Gap between panels | `gap-2` (8px) |
| Panel padding | `p-3` (12px) |
| Panel header padding | `px-3 py-2` (12px / 8px) |
| Table row padding | `py-2 px-3` |
| Badge padding | `px-1.5 py-0.5` |
| Button padding | `px-4 py-2` |
| Nav link padding | `px-4 py-3` |

### 5.3 Borders & Shadows

- Use borders (`border-[#2a2a35]`) not shadows for panel separation
- No `shadow-*` classes anywhere — flat design
- Track map: `border border-[#2a2a35]` only

---

## 6. Icons & Symbols

F1.com uses SVG icons throughout. Recommended replacements for current emoji use:

| Current | Replace with |
|---|---|
| `▶` play | SVG triangle (filled) |
| `⏸` pause | SVG two bars |
| `⚠` warning | SVG exclamation triangle |
| `▲` `▼` trend arrows | `↑` `↓` in mono font or tiny SVGs |
| Compound letter labels (S/M/H/I/W) | Colored circle + letter, styled sharply |

For v1, replacing emojis with Unicode geometric shapes is fine:
- Play: `▶` → keep but style with proper line-height
- Consider adding [Heroicons](https://heroicons.com/) (already tree-shakeable, MIT)

---

## 7. Track Map

The current SVG has 3 concentric strokes (outline effect). F1.com's track maps use:

- **Single thick stroke** in a mid-grey (`#38383f` or `#4a4a55`), width ~8–12px
- **White or very light inner highlight** stroke, ~2px
- **Car dots**: smaller (`r="5"`), with a thin white border ring, team color fill
- **Car label**: driver acronym in `text-[9px] font-black uppercase` positioned above the dot
- Background: same as page (`#15151e`) — the track floats on black

---

## 8. Tyre Strategy Bar

F1.com's strategy view uses:

- Driver name at left, left-aligned, fixed width
- Stint segments: sharp rectangles (no `rounded`), compound letter inside in black
- Compound colors: Soft=`#e8002d`, Medium=`#ffd600`, Hard=`#FFFFFF` (white, border `#38383f`), Inter=`#39d743`, Wet=`#0067ff`
- Pit markers: thin `#636369` vertical lines (not colored)
- Background: `#15151e` (match page)
- Current-lap line: `1px solid white` or `2px solid f1red`

---

## 9. Implementation Order

Recommended phased rollout (each is a self-contained PR):

| Phase | Scope | Files |
|---|---|---|
| 9a | Token update — colors + fonts | `tailwind.config.ts`, `index.css`, global find/replace of color classes |
| 9b | Nav + SessionPicker | `Nav.tsx`, `SessionPicker.tsx` |
| 9c | Panel headers + wrapper | `RaceWeekend.tsx` (PANEL/PANEL_TITLE constants), `Telemetry.tsx`, `Standings.tsx` |
| 9d | Live Timing table | `LiveTiming/LiveTiming.tsx` |
| 9e | Buttons + badges | `PlaybackBar.tsx`, `SessionPicker.tsx` chips |
| 9f | Strategy bar | `Strategy/StrategyBar.tsx` |
| 9g | Track map visual | `TrackMap/TrackMap.tsx` |
| 9h | Race Control + Weather | `RaceControl/RaceControl.tsx`, `Weather/WeatherPanel.tsx` |

---

## 10. Quick Reference — Class Replacement Cheat Sheet

| Old class | New class |
|---|---|
| `bg-track` | `bg-[#15151e]` |
| `bg-surface` | `bg-[#1f1f27]` |
| `bg-panel` | `bg-[#2a2a35]` |
| `border-panel` | `border-[#2a2a35]` or `border-[#38383f]` |
| `text-muted` | `text-[#a3a3a3]` |
| `rounded` (on panels/buttons) | remove or `rounded-none` |
| `rounded` (on chips/badges) | `rounded-sm` max, prefer sharp |
| `font-mono` (on UI text) | `font-sans` — keep mono only for numbers |
| `text-xs font-bold uppercase tracking-wider` (panel title) | `text-xs font-bold uppercase tracking-[0.12em]` |
| `bg-f1red text-white font-bold` (nav active pill) | `border-b-2 border-f1red text-white font-bold` |
