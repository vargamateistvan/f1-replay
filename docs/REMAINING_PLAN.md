# F1 Replay — Remaining Work Plan (2026-06-18)

All code from FEATURES_ROADMAP, ROADMAP, CODE_REVIEW, and DESIGN_REWORK_V2 has shipped
**except** the four items below. They are ordered by visual/UX impact.

Effort: S (<½ day) · M (~1 day)
Status: 🔵 feature · 🎨 visual polish

---

## 1. Nav / AppHeader — add the session picker sub-bar 🎨 M

**Why:** The `Nav` top bar already has the two-layer structure (red bar + view tabs), but
the session picker (year/meeting/session dropdowns) lives **inside the red bar**
alongside the logo and nav tabs. On desktop this crowds the bar; on mobile it's already
hidden. The DESIGN_REWORK_V2 target is a **dedicated second sub-bar** below the red bar.

**What:**

- Move the year/meeting/session `<select>` elements (and the auth-failure banner) into a
  second `<div>` row beneath the red bar (`bg-surface h-9`).
- Red bar: logo · `headerLabel` · view tabs · settings/help icons (already there).
- Sub-bar: Year ▾ · Meeting ▾ · Session ▾ · LIVE badge · loading indicator.
- Sub-bar is `hidden md:flex` on desktop; mobile keeps the existing `MobileNav` drawer.
- The "next race weekend" banner stays between sub-bar and main content.

**Files:** `src/components/Nav.tsx`

**Touches nothing else** — all data/state stays where it is; it's a pure layout change.

---

## 2. Bottom status bar — weather temp + session clock strip 🎨 S

**Why:** The DESIGN_REWORK_V2 spec calls for a thin strip at the bottom of the
`SessionInfoBar` (or as a standalone bar above `PlaybackBar`) showing:

- Current **air temp** and **track temp** from the latest `weather` sample at `t`
- **Session elapsed time** in "h:mm:ss" format

`SessionInfoBar` already shows Lap · Track Status · Elapsed Time · RC message.
The gap is the **weather temperature** — it's fetched in `RaceWeekend` but never surfaced
in the top-of-content info strip.

**What:**

- Add `airTemp` and `trackTemp` props to `SessionInfoBar`.
- Render them as two extra cells in the flex bar (after "Elapsed Time"):
  `Air 28°C · Track 42°C` — muted label + white value, same style as the lap cell.
- Wire from `RaceWeekend`: derive `airTemp`/`trackTemp` from `weather.data` at
  the nearest sample ≤ `sessionStartMs + t`.

**Files:** `src/components/SessionInfoBar.tsx`, `src/pages/RaceWeekend.tsx`

---

## 3. PlaybackBar — compact chip tray + segmented speed control 🎨 S

**Why:** The chips row scrolls horizontally (fine) but the speed buttons are full-width
on mobile and take a dedicated row. DESIGN_REWORK_V2 calls for:

- Speed selector as a **compact segmented control** (not full-row buttons on mobile).
- Jump chips in a **collapsible tray** toggled by a `···` button (hidden by default on
  mobile to reclaim vertical space, shown on desktop).

**What:**

- Add a `showChips` local state toggled by a `···` icon button at the end of the
  transport row.
- On `md+` default `showChips = true`; on mobile default `false`.
- The speed buttons row on mobile becomes a single compact segmented pill next to
  the `···` toggle, not a full-width dedicated row.
- No logic changes — only layout/styling.

**Files:** `src/components/PlaybackBar.tsx`

---

## 4. Toast sound cues 🔵 S

**Why:** FEATURES_ROADMAP §4.2. The toast framework (`useEventToasts` +
`EventToastStack`) is complete. Short audio cues for radio/flag/overtake toasts
add immersion; they're off by default.

**What:**

- Add `toastSoundsEnabled: boolean` to `AppSettings` (default `false`).
- Add a "Toast sounds" toggle in `SettingsModal` under Notifications.
- In `EventToastStack` (or `ToastCard`), on new toast mount, play a short beep via
  the `AudioContext` API (synthesized — no audio files needed):
  - `radio` → two-tone ascending blip (~80ms)
  - `flag` → lower warning tone (~100ms)
  - `overtake` / `pit` / `fastest_lap` → single short click (~40ms)
- Respect `toastSoundsEnabled`; also silence when the browser tab is hidden.

**Files:**  
`src/stores/settings.ts`,  
`src/components/SettingsModal/SettingsControls.tsx`,  
`src/components/EventToast/EventToastStack.tsx`

---

## 5. Deferred / intentionally out-of-scope

- **Ambient engine audio** (FEATURES_ROADMAP §4.1) — L effort, explicitly low priority.
  Skip unless user requests it.
- **Full `TimingTower` rewrite** to CSS Grid layout (DESIGN_REWORK_V2 §3.3 Phase R2) —
  `LiveTiming` already has SectorBar + TyreBadge + DRS/throttle columns. The grid
  layout rewrite is cosmetic; defer unless a visual parity pass is prioritised.

---

## Execution order

| #   | Item                               | Effort | Impact                                 |
| --- | ---------------------------------- | ------ | -------------------------------------- |
| 1   | Nav sub-bar split                  | M      | High — removes crowding in the red bar |
| 2   | Bottom weather strip               | S      | Medium — completes `SessionInfoBar`    |
| 3   | PlaybackBar chip tray + speed pill | S      | Medium — mobile UX improvement         |
| 4   | Toast sound cues                   | S      | Low-medium — off by default, easy win  |
