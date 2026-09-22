import { useEffect, useRef, useState } from "react";
import type { ToastEvent } from "@/timeline/events";

const JUMP_THRESHOLD_MS = 5_000;
const AUTO_DISMISS_MS = 8_000;
const EMPTY_SET = new Set<string>();

export interface ActiveToast {
  event: ToastEvent;
  addedAt: number;
}

export function useEventToasts(
  events: ToastEvent[],
  t: number,
  maxVisible = 4,
  pinnedIds: Set<string> = EMPTY_SET,
) {
  const prevTRef = useRef(t);
  const seenRef = useRef(new Set<string>());
  const [toasts, setToasts] = useState<ActiveToast[]>([]);

  useEffect(() => {
    const prevT = prevTRef.current;
    const delta = t - prevT;
    prevTRef.current = t;

    const now = Date.now();

    // Backward seeks discard everything: past events shouldn't re-appear.
    if (delta < 0) {
      seenRef.current.clear();
      setToasts((prev) => prev.filter((at) => pinnedIds.has(at.event.id)));
      return;
    }

    // Large forward jumps (e.g. the "Radio ›" / "Pit ›" / "Flag ›" playback
    // bar buttons, which jump straight to an event's own timestamp) still
    // need to surface the event landed on, so stale "seen" ids are cleared
    // but crossed events are still evaluated below instead of bailing out.
    const isLargeJump = delta > JUMP_THRESHOLD_MS;
    if (isLargeJump) {
      seenRef.current.clear();
    }

    const fresh: ToastEvent[] = [];
    for (const ev of events) {
      if (ev.priority === "low") continue;
      if (ev.ms > prevT && ev.ms <= t && !seenRef.current.has(ev.id)) {
        seenRef.current.add(ev.id);
        fresh.push(ev);
      }
    }
    // For a large jump that crosses more events than fit on screen, keep the
    // most recent ones so the event the user explicitly jumped to is never
    // dropped in favor of earlier events they skipped past.
    const freshVisible =
      isLargeJump && fresh.length > maxVisible
        ? fresh.slice(-maxVisible)
        : fresh;

    setToasts((prev) => {
      const pruned = prev.filter(
        (at) =>
          pinnedIds.has(at.event.id) || now - at.addedAt < AUTO_DISMISS_MS,
      );
      if (freshVisible.length === 0) return pruned;
      const incoming = freshVisible.map((ev) => ({ event: ev, addedAt: now }));
      return [...incoming, ...pruned].slice(0, maxVisible);
    });
  }, [t, events, maxVisible, pinnedIds]);

  const dismiss = (id: string) => {
    if (pinnedIds.has(id)) return;
    setToasts((prev) => prev.filter((at) => at.event.id !== id));
  };

  return { toasts, dismiss };
}
