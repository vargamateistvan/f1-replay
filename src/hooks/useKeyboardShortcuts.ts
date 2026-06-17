import { useEffect } from "react";
import { useTimeline } from "@/timeline/clock";
import { atOrBefore, nextAfter } from "@/timeline/events";
import { SPEEDS } from "@/constants";
import type { MainView } from "@/components/Nav";

const SCRUB_MS = 5_000;

interface Options {
  readonly lapStarts: number[];
  readonly eventTimes?: number[];
  readonly durationMs: number;
  readonly setView?: (view: MainView) => void;
  readonly isModalOpen?: boolean;
  readonly onOpenHelp?: () => void;
  readonly enabled?: boolean;
}

// Global playback shortcuts for the Race Weekend view:
//   Space      play / pause
//   ← / →      scrub ∓5 s
//   ↑ / ↓      faster / slower (steps through SPEEDS)
//   [ / ]      previous / next lap
//   J / K      previous / next key moment
//   1 / 2 / 3  leaderboard / tracker / commentary
//   Home / End jump to start / end
//   ? / H      open help
// Ignores keystrokes while a form control is focused.
export function useKeyboardShortcuts({
  lapStarts,
  eventTimes = [],
  durationMs,
  setView,
  isModalOpen = false,
  onOpenHelp,
  enabled = true,
}: Options) {
  useEffect(() => {
    if (!enabled) return;

    function onKey(e: KeyboardEvent) {
      const el = e.target as HTMLElement | null;
      const tag = el?.tagName;
      if (
        tag === "INPUT" ||
        tag === "SELECT" ||
        tag === "TEXTAREA" ||
        el?.isContentEditable
      ) {
        return;
      }

      if (isModalOpen) {
        return;
      }

      const store = useTimeline.getState();
      const clamp = (t: number) =>
        Math.max(0, durationMs > 0 ? Math.min(t, durationMs) : t);

      switch (e.key) {
        case "?":
        case "h":
        case "H":
          e.preventDefault();
          onOpenHelp?.();
          break;
        case " ":
          e.preventDefault();
          store.toggle();
          break;
        case "Home":
          e.preventDefault();
          store.setT(0);
          break;
        case "End":
          e.preventDefault();
          store.setT(clamp(durationMs));
          break;
        case "ArrowRight":
          e.preventDefault();
          store.setT(clamp(store.t + SCRUB_MS));
          break;
        case "ArrowLeft":
          e.preventDefault();
          store.setT(clamp(store.t - SCRUB_MS));
          break;
        case "ArrowUp": {
          e.preventDefault();
          const i = SPEEDS.indexOf(store.speed as (typeof SPEEDS)[number]);
          store.setSpeed(
            SPEEDS[Math.min(i + 1, SPEEDS.length - 1)] ?? store.speed,
          );
          break;
        }
        case "ArrowDown": {
          e.preventDefault();
          const i = SPEEDS.indexOf(store.speed as (typeof SPEEDS)[number]);
          store.setSpeed(SPEEDS[Math.max(i - 1, 0)] ?? store.speed);
          break;
        }
        case "]": {
          e.preventDefault();
          const n = nextAfter(lapStarts, store.t);
          if (n !== null) store.setT(clamp(n));
          break;
        }
        case "[": {
          e.preventDefault();
          const p = atOrBefore(lapStarts, store.t);
          if (p !== null) store.setT(clamp(p));
          break;
        }
        case "j":
        case "J": {
          e.preventDefault();
          const p = atOrBefore(eventTimes, Math.max(0, store.t - 1));
          if (p !== null) store.setT(clamp(p));
          break;
        }
        case "k":
        case "K": {
          e.preventDefault();
          const n = nextAfter(eventTimes, store.t);
          if (n !== null) store.setT(clamp(n));
          break;
        }
        case "1":
          e.preventDefault();
          setView?.("leaderboard");
          break;
        case "2":
          e.preventDefault();
          setView?.("tracker");
          break;
        case "3":
          e.preventDefault();
          setView?.("commentary");
          break;
      }
    }

    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [
    durationMs,
    enabled,
    eventTimes,
    isModalOpen,
    lapStarts,
    onOpenHelp,
    setView,
  ]);
}
