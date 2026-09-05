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

    if (delta < 0 || delta > JUMP_THRESHOLD_MS) {
      seenRef.current.clear();
      setToasts((prev) => prev.filter((at) => pinnedIds.has(at.event.id)));
      return;
    }

    const fresh: ToastEvent[] = [];
    for (const ev of events) {
      if (ev.priority === "low") continue;
      if (ev.ms > prevT && ev.ms <= t && !seenRef.current.has(ev.id)) {
        seenRef.current.add(ev.id);
        fresh.push(ev);
      }
    }

    setToasts((prev) => {
      const pruned = prev.filter(
        (at) =>
          pinnedIds.has(at.event.id) || now - at.addedAt < AUTO_DISMISS_MS,
      );
      if (fresh.length === 0) return pruned;
      const incoming = fresh.map((ev) => ({ event: ev, addedAt: now }));
      return [...incoming, ...pruned].slice(0, maxVisible);
    });
  }, [t, events, maxVisible, pinnedIds]);

  const dismiss = (id: string) => {
    if (pinnedIds.has(id)) return;
    setToasts((prev) => prev.filter((at) => at.event.id !== id));
  };

  return { toasts, dismiss };
}
