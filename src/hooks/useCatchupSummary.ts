import { useEffect, useRef, useState } from "react";
import type { ToastEvent } from "@/timeline/events";

const JUMP_THRESHOLD_MS = 60_000; // 1 minute minimum to trigger summary

export interface CatchupSummary {
  fromMs: number;
  toMs: number;
  events: ToastEvent[];
}

export function useCatchupSummary(events: ToastEvent[], t: number) {
  const prevTRef = useRef(t);
  const [summary, setSummary] = useState<CatchupSummary | null>(null);

  useEffect(() => {
    const prevT = prevTRef.current;
    const delta = t - prevT;
    prevTRef.current = t;

    if (delta >= JUMP_THRESHOLD_MS) {
      const crossed = events.filter((e) => e.ms > prevT && e.ms <= t);
      if (crossed.length > 0) {
        setSummary({ fromMs: prevT, toMs: t, events: crossed });
      }
    }
  }, [t, events]);

  const dismiss = () => setSummary(null);
  return { summary, dismiss };
}
