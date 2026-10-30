# F1 Replay — Design System (F1.com-Inspired)

The goal is to shift the app's visual language from a "dark hacker dashboard" feel toward the official
Formula 1 website: stark black backgrounds, bold uppercase sans-serif type, sharp geometric shapes,
prominent use of the F1 red, and tight information density with clear visual hierarchy.

> **Source of truth:** values live in [`src/designTokens.ts`](../src/designTokens.ts) and are exposed as
> Tailwind classes by `tailwind.config.ts` (default palette disabled, light mode via CSS variables).
> Buttons come from `src/components/Button`. This document describes intent; class names below use
> the tokens. Never write a raw hex class — ESLint rejects it.

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

### Tokens

Every token has a dark and a light value; components never branch on the theme.

| Token | Dark | Use |
|---|---|---|
| `f1red` | `#e8002d` | Primary CTA, active states, LIVE. `f1red-hover` for hover, `f1red-fg` for red text |
| `fg` | `#ffffff` | Default text and icons (`text-fg`, `text-fg/70`…) |
| `track` | `#15151e` | Page background |
| `sunken` | `#10101a` | Map / chart wells, picker bar |
| `surface` | `#1f1f27` | Panels, cards, dialogs |
| `panel` | `#2a2a35` | Inputs, chips, selected rows, default border |
| `line` | `#3f3f4b` | Strong borders, separators, inactive bars |
| `muted` | `#a3a3a3` | Secondary text |
| `faint` | `#636369` | Column headers, footnotes |

Tones carry meaning and come in four slots — `DEFAULT` (fills, timing text), `-fg` (text), `-line`
(chip border), `-tint` (chip / row background):

| Tone | Meaning |
|---|---|
| `purple` | Session best (sector, lap) |
| `green` | Personal best, gains, valid, green flag |
| `yellow` | Yellow flag, slower than personal best, title contention |
| `orange` | Safety car, pit stops, warnings |
| `red` | Errors, retirements, braking, deleted laps |
| `blue` | Info, references, rain, team radio, pit-lane minisector |
| `teal` | Pit-lane events (undercut) |

A tinted status chip is `border border-orange-line bg-orange-tint text-orange-fg`. `text-white` /
`text-black` are only for text on a solid fill (`bg-f1red text-white`, `bg-yellow text-black`).
Canvas, chart and Mapbox colours use `TOKEN_HEX` or the maps in `constants.ts` (`COMPOUND_COLORS`,
`FLAG_COLORS`). Team colours are applied inline via `teamColor()` — not in the theme.

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
  @apply bg-track text-fg font-sans antialiased;
}
```

### Type scale — F1.com conventions

| Role | Size | Weight | Transform | Usage |
|---|---|---|---|---|
| Page title | `text-2xl` | `font-black` (900) | `uppercase tracking-widest` | Page headers (STANDINGS, TELEMETRY) |
| Section title | `text-xs` | `font-bold` (700) | `uppercase tracking-caps` | Panel headers (LIVE TIMING, WEATHER) |
| Body / table | `text-sm` | `font-medium` (500) | normal | Driver names, lap times |
| Label | `text-xs` | `font-medium` | `uppercase tracking-wider` | Column headers, picker labels |
| Data readout | `text-sm font-mono` | `font-semibold` | `tabular-nums` | Gap times, sector times, position |
| Badge / chip | `text-tiny` / `text-caption` | `font-bold` | `uppercase tracking-widest` | PIT, LIVE, flag labels |

Small sizes are named tokens (font-size only): `text-micro` 8px, `text-tiny` 9px, `text-caption` 10px,
`text-small` 11px, `text-compact` 12px, `text-body` 13px, `text-stat` 22px. Letter-spacing:
`tracking-caps` 0.12em, `tracking-eyebrow` 0.16em, `tracking-spaced` 0.2em.

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
- Inactive: `text-muted hover:text-fg` (no hover background)
- Link style: `text-xs font-bold uppercase tracking-caps py-4 px-4`
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
'flex items-center gap-2 text-xs font-bold uppercase tracking-caps px-3 py-2 border-b border-line before:block before:w-1 before:h-3.5 before:bg-f1red before:rounded-sm'
```

Or as a left-border accent:
```tsx
'text-xs font-bold uppercase tracking-caps px-3 py-2 border-b border-line border-l-2 border-l-f1red'
```

**Panel wrapper:**
- `bg-surface border border-panel rounded-sm` (`rounded-sm` is the only corner radius; `rounded-full` is for dots and avatars)

### 4.3 Buttons

**F1.com pattern:** Sharp rectangle, uppercase bold text, no border-radius.

Use `buttonClass(variant, size)` from `src/components/Button/buttonClass.ts` (or `<Button>`):

| Variant | Look |
|---|---|
| `primary` | `bg-f1red text-white`, `hover:bg-f1red-hover` |
| `secondary` | `border border-panel text-fg`, red border + text on hover |
| `quiet` | `border border-panel text-muted`, for dense feed/toolbar actions |

Sizes: `md` (`px-4 py-2 text-caption`), `sm` (`h-6 px-2 text-tiny`), `block` (`h-9 w-full`). All are
uppercase, `font-bold tracking-caps`, square-cornered, and carry `FOCUS_RING`. Speed chips:
`bg-panel text-muted` inactive / `bg-f1red text-white` active.

### 4.4 Select / Dropdown

F1.com uses custom dropdowns but we keep native `<select>`. Style update:

```
bg-panel text-fg border border-line text-xs font-medium px-3 py-1.5
focus:outline-none focus:border-faint
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

- Column headers: `text-caption font-bold uppercase tracking-widest text-faint`
- Row height: tighter, `py-2` (currently `py-1.5`)
- Position number: `font-black text-base` (bold and slightly larger)
- Driver acronym: `font-black text-sm` colored with `teamColor()`
- Full name: `text-xs text-muted font-medium`
- Team color strip: `w-[3px] h-5 rounded-none mr-3` (sharp, not rounded-sm)
- Gap column: `font-mono text-sm tabular-nums` — green if gaining, red if losing
- No row hover background; use `border-b border-panel` separator only

### 4.6 Badges / Chips

| Badge | Style |
|---|---|
| PIT | `bg-orange text-black text-tiny font-black uppercase tracking-widest px-1.5 py-0.5` |
| LIVE | `bg-f1red text-white text-caption font-black uppercase tracking-widest px-1.5 py-0.5` + pulsing dot |
| SC | `bg-orange text-black …` |
| RED FLAG | `bg-f1red text-white …` |
| Session best | `bg-purple text-white …` |
| Status (tinted) | `border border-<tone>-line bg-<tone>-tint text-<tone>-fg …` |

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

- Background: `bg-track` (same as base — recessed into page, not elevated)
- Top border: `border-t border-panel`
- Scrubber: `accent-f1red` (keep), but also style the range track via custom CSS
- Speed buttons: sharp chips, `bg-panel` inactive / `bg-f1red` active
- Time readout: `font-mono text-sm tabular-nums`

### 4.9 Session Picker

```
YEAR  [2024 ▾]   EVENT  [Bahrain GP ▾]   SESSION  [Race ▾]   ● LIVE
```

- Full bar: `bg-sunken border-b border-panel` (`PICKER_BAR` in `components/Nav/pickerStyles.ts`)
- Labels: `text-tiny font-bold uppercase tracking-widest text-muted`
- LIVE chip: `bg-f1red px-1.5 py-0.5 text-caption font-black uppercase tracking-widest`

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

- Use borders (`border-panel`) not shadows for panel separation
- No `shadow-*` classes anywhere — flat design
- Track map: `border border-panel` only

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
- **Car label**: driver acronym in `text-tiny font-black uppercase` positioned above the dot
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

| Don't write | Write |
|---|---|
| `bg-[#15151e]` / `bg-[#1f1f27]` / `bg-[#2a2a35]` | `bg-track` / `bg-surface` / `bg-panel` |
| `border-[#38383f]`, `border-[#4a4a5d]` | `border-line` |
| `text-[#a3a3a3]` / `text-[#636369]` | `text-muted` / `text-faint` |
| `text-white` on a neutral background | `text-fg` (flips in light mode) |
| `text-[#9b59f5]`, `bg-[#39b54a]`, `bg-[#f5a623]` … | `text-purple`, `bg-green`, `bg-orange` … |
| `text-amber-300 bg-amber-500/20 border-amber-500/30` | `text-orange-fg bg-orange-tint border-orange-line` |
| `lightMode ? "bg-white …" : "bg-surface …"` | `bg-surface` (tokens switch themselves) |
| `text-[10px]`, `tracking-[0.12em]`, `z-[200]` | `text-caption`, `tracking-caps`, `z-modal` |
| `rounded`, `rounded-md`, `rounded-lg` | `rounded-sm` |
| hand-written `bg-f1red px-4 py-2 … hover:bg-red-600` | `buttonClass("primary")` |
| `font-mono` (on UI text) | `font-sans` — keep mono only for numbers |
| `bg-f1red text-white font-bold` (nav active pill) | `border-b-2 border-f1red text-fg font-bold` |
