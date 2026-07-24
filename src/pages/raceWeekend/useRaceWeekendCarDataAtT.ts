import { useMemo } from "react";
import { useAllCarDataWindow } from "@/hooks/useAllCarDataWindow";
import type { CarData } from "@/api/types";
import { lastAtOrBefore } from "@/utils/sortedTime";

interface UseRaceWeekendCarDataAtTArgs {
  sessionKey: number | null;
  sessionStartMs: number;
  telemetryChunkIdx: number;
  telemetryEnabled: boolean;
  sessionTimeMs: number;
}

export function useRaceWeekendCarDataAtT({
  sessionKey,
  sessionStartMs,
  telemetryChunkIdx,
  telemetryEnabled,
  sessionTimeMs,
}: Readonly<UseRaceWeekendCarDataAtTArgs>) {
  const allCarData = useAllCarDataWindow(
    sessionKey,
    sessionStartMs,
    telemetryChunkIdx,
    telemetryEnabled,
    {
      includePreviousChunk: false,
      includeNextChunk: false,
    },
  );

  const carSamplesByDriver = useMemo(() => {
    const grouped = new Map<number, { ms: number; d: CarData }[]>();
    if (!sessionStartMs) return grouped;

    for (const row of allCarData.data) {
      const ms = new Date(row.date).getTime() - sessionStartMs;
      let arr = grouped.get(row.driver_number);
      if (!arr) {
        arr = [];
        grouped.set(row.driver_number, arr);
      }
      arr.push({ ms, d: row });
    }

    for (const arr of grouped.values()) {
      arr.sort((a, b) => a.ms - b.ms);
    }
    return grouped;
  }, [allCarData.data, sessionStartMs]);

  const carDataAtT = useMemo((): ReadonlyMap<number, CarData> => {
    const snapshot = new Map<number, CarData>();
    for (const [driverNumber, samples] of carSamplesByDriver) {
      const sample = lastAtOrBefore(
        samples,
        sessionTimeMs,
        (entry) => entry.ms,
      )?.d;
      if (sample) snapshot.set(driverNumber, sample);
    }
    return snapshot;
  }, [carSamplesByDriver, sessionTimeMs]);

  return {
    carDataAtT,
  } as const;
}
