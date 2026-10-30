import { useEffect, useRef, useState } from "react";
import type { ToastEvent } from "@/timeline/events";
import { CATCHUP_JUMP_THRESHOLD_MS } from "@/constants";

export interface CatchupSummary {
  fromMs: number;
  toMs: number;
  events: ToastEvent[];
}

export function useCatchupSummary(events: ToastEvent[], t: number) {
  const prevTRef = useRef(t);
  const skipNextSeekRef = useRef(false);
  const [summary, setSummary] = useState<CatchupSummary | null>(null);

  useEffect(() => {
    const prevT = prevTRef.current;
    const delta = t - prevT;
    prevTRef.current = t;
    if (delta !== 0 && skipNextSeekRef.current) {
      skipNextSeekRef.current = false;
      return;
    }

    if (delta >= CATCHUP_JUMP_THRESHOLD_MS) {
      const crossed = events.filter((e) => e.ms > prevT && e.ms <= t);
      if (crossed.length > 0) {
        setSummary({ fromMs: prevT, toMs: t, events: crossed });
      }
    }
  }, [t, events]);

  const dismiss = () => setSummary(null);
  const skipNextSeek = () => { skipNextSeekRef.current = true; };
  return { summary, dismiss, skipNextSeek };
}
