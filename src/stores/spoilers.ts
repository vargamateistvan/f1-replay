import { create } from "zustand";
import { persist } from "zustand/middleware";
import { SPOILER_RECENT_WINDOW_MS, WATCHED_SESSIONS_MAX } from "@/constants";
import { withWatched, type SpoilerState } from "@/utils/spoilers";

interface SpoilerStore extends SpoilerState {
  /** Turning it on treats the last `SPOILER_RECENT_WINDOW_MS` of results as unseen. */
  setEnabled: (enabled: boolean, nowMs?: number) => void;
  markWatched: (sessionKey: number, nowMs?: number) => void;
  /** Everything that has finished so far counts as known. */
  revealAll: (nowMs?: number) => void;
}

// Kept apart from `useSettings` so a settings reset never reveals results,
// and the watched list doesn't grow the settings blob.
export const useSpoilers = create<SpoilerStore>()(
  persist(
    (set, get) => ({
      enabled: false,
      knownBeforeMs: 0,
      watched: {},
      setEnabled: (enabled, nowMs = Date.now()) =>
        set(
          enabled
            ? { enabled, knownBeforeMs: nowMs - SPOILER_RECENT_WINDOW_MS }
            : { enabled },
        ),
      markWatched: (sessionKey, nowMs = Date.now()) => {
        if (get().watched[sessionKey] !== undefined) return;
        set((s) => ({
          watched: withWatched(s.watched, sessionKey, nowMs, WATCHED_SESSIONS_MAX),
        }));
      },
      revealAll: (nowMs = Date.now()) => set({ knownBeforeMs: nowMs }),
    }),
    {
      name: "f1-replay-spoilers",
      version: 1,
      partialize: ({ enabled, knownBeforeMs, watched }) => ({
        enabled,
        knownBeforeMs,
        watched,
      }),
    },
  ),
);
