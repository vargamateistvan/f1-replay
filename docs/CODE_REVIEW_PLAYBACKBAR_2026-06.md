# PlaybackBar Code Review — June 2026

**File:** `src/components/PlaybackBar.tsx`

---

## Bugs

### 1. `onReplayNextIncident` / `canReplayNextIncident` desync (silent failure)

The button uses `onClick={() => onReplayNextIncident?.()}` with `disabled={!canReplayNextIncident}`. If `canReplayNextIncident` is `true` but `onReplayNextIncident` is never passed, clicking silently does nothing. The optional chaining masks the bug.

**Fix:** Encode the constraint in the type or assert the callback is defined when the flag is truthy:

```ts
// option A — discriminated union
| { canReplayNextIncident: true; onReplayNextIncident: () => void }
| { canReplayNextIncident?: false; onReplayNextIncident?: never }

// option B — runtime guard
onClick={() => {
  if (!onReplayNextIncident) return;
  onReplayNextIncident();
}}
```

---

### 2. Stale `incidentReplayHint` after incidents are exhausted

The hint `<span>` renders whenever `incidentReplayHint` is truthy, with no check against `canReplayNextIncident`. A stale hint will persist after all incidents are exhausted.

**Fix:**

```tsx
{incidentReplayHint && canReplayNextIncident && (
  <span ...>{incidentReplayHint}</span>
)}
```

---

### 3. Misleading "Previous lap" button label

`atOrBefore(lapStarts, t)` snaps to the **current** lap start when mid-lap, not to the previous lap. The `aria-label="Previous lap"` and `title="Previous lap ([)"` are semantically wrong — the behavior is "Go to current lap start." The keyboard shortcut hook (`useKeyboardShortcuts`) has the same behavior, so both labels are consistently wrong.

**Fix:** Change label to `"Current lap start"` / `"Go to lap start ([)"`.

---

### 4. `useEffect` for playback clamping fires every render tick

```tsx
useEffect(() => {
  if (durationMs <= 0 || t < durationMs) return;
  ...
}, [durationMs, playing, setPlaying, setT, t]); // t in deps = fires every RAF frame
```

`t` changes every animation frame during playback, causing this effect to re-evaluate constantly just to return early.

**Fix:** Read live values from the store instead of subscribing via deps:

```tsx
useEffect(() => {
  if (durationMs <= 0) return;
  const unsub = useTimeline.subscribe((state) => {
    if (state.t >= durationMs) {
      useTimeline.getState().setT(durationMs);
      useTimeline.getState().setPlaying(false);
    }
  });
  return unsub;
}, [durationMs]);
```

---

### 5. Redundant optional chaining after null guard

```tsx
{markerSummary !== null &&
  (markerSummary?.critical ?? 0) + (markerSummary?.warning ?? 0) > 0 && (
```

After the `!== null` guard, `markerSummary?.critical` is redundant and signals uncertain logic.

**Fix:**

```tsx
{markerSummary !== null &&
  (markerSummary.critical ?? 0) + (markerSummary.warning ?? 0) > 0 && (
```

---

### 6. Marker overlay can intercept scrubber pointer events

The `<div className="absolute inset-0">` containing race-control marker buttons sits on top of the `<input type="range">`. In dense areas, marker buttons can intercept pointer events intended for the scrubber thumb.

**Fix:** Add `pointer-events: none` to the overlay div and `pointer-events: auto` to the individual marker buttons:

```tsx
<div className="absolute inset-0 pointer-events-none">
  {raceControlMarkers.map((marker) => (
    <button ... className={`... pointer-events-auto`} />
  ))}
</div>
```

---

## Refactoring Options

### 7. Speed controls duplicated for mobile/desktop

The `SPEEDS` button list is rendered twice — once in the transport row (`hidden sm:flex`) and once in a separate mobile-only row (`sm:hidden flex`). This duplicates both markup and logic.

**Fix:** Extract a shared component:

```tsx
function SpeedButtons({ className }: { className?: string }) {
  const { speed, setSpeed } = useTimeline();
  return (
    <div className={className}>
      {SPEEDS.map((s) => (
        <button
          key={s}
          onClick={() => setSpeed(s)}
          aria-pressed={speed === s}
          aria-label={`${s}x speed`}
          className={`... ${speed === s ? "bg-f1red text-white" : "bg-panel text-muted"}`}
        >
          {s}×
        </button>
      ))}
    </div>
  );
}

// Usage:
<SpeedButtons className="hidden sm:flex gap-px shrink-0" />
<SpeedButtons className="sm:hidden flex gap-px" />
```

---

### 8. `clamp` and `jump` recreated every render

Both functions are defined inline on every render but only depend on `durationMs`. During active playback the component re-renders every RAF frame.

**Fix:**

```tsx
const clamp = useCallback(
  (v: number) => Math.max(0, durationMs > 0 ? Math.min(v, durationMs) : v),
  [durationMs],
);

const jump = useCallback(
  (target: number | null) => {
    if (target !== null) setT(clamp(target));
  },
  [clamp, setT],
);
```

---

### 9. Redundant `raceControlMarkers.length > 0` guard

The `.map()` inside produces no output for an empty array anyway. The explicit length check adds noise.

**Fix:** Remove the guard; keep `durationMs > 0 && showMarkers && !isCompactViewport` only.

---

### 10. One-off `isCompactViewport` media query — extract to a hook

The `useState` + `useEffect` + `window.matchMedia` block is a repeated pattern. If used elsewhere in the codebase, extract a `useMediaQuery` hook:

```ts
// src/hooks/useMediaQuery.ts
export function useMediaQuery(query: string): boolean {
  const [matches, setMatches] = useState(
    () => window.matchMedia(query).matches,
  );
  useEffect(() => {
    const media = window.matchMedia(query);
    const sync = () => setMatches(media.matches);
    media.addEventListener("change", sync);
    return () => media.removeEventListener("change", sync);
  }, [query]);
  return matches;
}

// In PlaybackBar:
const isCompactViewport = useMediaQuery("(max-width: 639px)");
```

---

### 11. `fmtTime` is unguarded for negative input

`fmtTime(-5000)` produces `"-1:-5"`. The caller guards `countdownMs` correctly (`<= 0 ? "ENDED" : fmtTime(...)`), but the function itself should be defensive:

```ts
function fmtTime(ms: number) {
  if (ms < 0) ms = 0;
  const s = Math.floor(ms / 1000);
  ...
}
```
