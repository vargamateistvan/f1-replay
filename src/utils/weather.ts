import type { Weather } from "@/api/types";
import { lastAtOrBefore } from "@/utils/sortedTime";

type TimedWeatherPoint = {
  absMs: number;
  row: Weather;
};

export function weatherAtSessionTime(
  entries: readonly Weather[],
  sessionStartMs: number,
  sessionTimeMs: number,
): Weather | null {
  if (!sessionStartMs || entries.length === 0) return null;

  const timed: TimedWeatherPoint[] = entries
    .map((row) => ({ absMs: new Date(row.date).getTime(), row }))
    .sort((a, b) => a.absMs - b.absMs);

  return (
    lastAtOrBefore(
      timed,
      sessionStartMs + sessionTimeMs,
      (entry) => entry.absMs,
    )?.row ?? null
  );
}
