import { useMemo } from "react";
import type {
  Interval,
  Lap,
  Overtake,
  Position,
  RaceControl,
  Stint,
} from "@/api/types";
import { computeBattlingDrivers } from "@/utils/battles";
import { deriveRetiredDrivers } from "@/utils/retirement";
import { lastAtOrBefore, windowBoundsByValue } from "@/utils/sortedTime";

interface TimedLapRow {
  row: Lap;
  relMs: number;
}

interface TimedOvertakeRow {
  row: Overtake;
  relMs: number;
}

interface CompletedLapPoint {
  endMs: number;
  lapNumber: number;
}

interface UseRaceWeekendMapDerivedStateArgs {
  isMapVisible: boolean;
  sessionStartMs: number;
  sessionTimeMsSlow: number;
  focusDriver: number | null;
  compareDriver: number | null;
  timedLaps: TimedLapRow[];
  timedOvertakes: TimedOvertakeRow[];
  stints: Stint[];
  intervals: Interval[];
  positions: Position[];
  laps: Lap[];
  raceControl: RaceControl[];
  isRaceSession: boolean;
  overtakePulseMs: number;
}

export function useRaceWeekendMapDerivedState({
  isMapVisible,
  sessionStartMs,
  sessionTimeMsSlow,
  focusDriver,
  compareDriver,
  timedLaps,
  timedOvertakes,
  stints,
  intervals,
  positions,
  laps,
  raceControl,
  isRaceSession,
  overtakePulseMs,
}: Readonly<UseRaceWeekendMapDerivedStateArgs>) {
  const pulseDrivers = useMemo(() => {
    if (!isMapVisible) return [];
    const { startIndex, endIndex } = windowBoundsByValue(
      timedOvertakes,
      sessionTimeMsSlow - overtakePulseMs,
      sessionTimeMsSlow,
      (overtake) => overtake.relMs,
    );
    const out: number[] = [];
    for (let idx = startIndex; idx < endIndex; idx++) {
      const overtake = timedOvertakes[idx];
      if (!overtake) continue;
      out.push(
        overtake.row.overtaking_driver_number,
        overtake.row.overtaken_driver_number,
      );
    }
    return out;
  }, [timedOvertakes, sessionTimeMsSlow, overtakePulseMs, isMapVisible]);

  const completedLapsByDriver = useMemo(() => {
    const byDriver = new Map<number, CompletedLapPoint[]>();
    for (const { row: lap, relMs: lapStart } of timedLaps) {
      if (lap.lap_duration === null) continue;
      const endMs = lapStart + lap.lap_duration * 1000;
      let lapsForDriver = byDriver.get(lap.driver_number);
      if (!lapsForDriver) {
        lapsForDriver = [];
        byDriver.set(lap.driver_number, lapsForDriver);
      }
      lapsForDriver.push({ endMs, lapNumber: lap.lap_number });
    }
    for (const lapsForDriver of byDriver.values()) {
      lapsForDriver.sort((a, b) => a.endMs - b.endMs);
    }
    return byDriver;
  }, [timedLaps]);

  const focusDriverLap = useMemo(() => {
    if (!isMapVisible || focusDriver === null) return null;
    return (
      lastAtOrBefore(
        completedLapsByDriver.get(focusDriver) ?? [],
        sessionTimeMsSlow,
        (lap) => lap.endMs,
      )?.lapNumber ?? null
    );
  }, [completedLapsByDriver, focusDriver, sessionTimeMsSlow, isMapVisible]);

  const compareDriverLap = useMemo(() => {
    if (!isMapVisible || compareDriver === null) return null;
    return (
      lastAtOrBefore(
        completedLapsByDriver.get(compareDriver) ?? [],
        sessionTimeMsSlow,
        (lap) => lap.endMs,
      )?.lapNumber ?? null
    );
  }, [completedLapsByDriver, compareDriver, sessionTimeMsSlow, isMapVisible]);

  const activeCompounds = useMemo(() => {
    const result = new Map<
      number,
      { compound: Stint["compound"]; age: number }
    >();
    if (!isMapVisible) return result;
    if (!timedLaps.length || !stints.length) return result;
    const currentLapByDriver = new Map<number, number>();
    for (const { row: lap, relMs: lapRelMs } of timedLaps) {
      if (lapRelMs > sessionTimeMsSlow) continue;
      const prev = currentLapByDriver.get(lap.driver_number);
      if (prev === undefined || lap.lap_number > prev) {
        currentLapByDriver.set(lap.driver_number, lap.lap_number);
      }
    }
    for (const [driverNum, currentLap] of currentLapByDriver) {
      const stint = stints.find(
        (s) =>
          s.driver_number === driverNum &&
          s.lap_start <= currentLap &&
          s.lap_end >= currentLap,
      );
      if (!stint) continue;
      result.set(driverNum, {
        compound: stint.compound,
        age: currentLap - stint.lap_start + stint.tyre_age_at_start,
      });
    }
    return result;
  }, [timedLaps, stints, sessionTimeMsSlow, isMapVisible]);

  const battlingDrivers = useMemo(() => {
    if (!isMapVisible) return new Set<number>();
    if (!intervals.length || !sessionStartMs) return new Set<number>();
    return computeBattlingDrivers(
      intervals,
      sessionStartMs + sessionTimeMsSlow,
      1.0,
    );
  }, [intervals, sessionStartMs, sessionTimeMsSlow, isMapVisible]);

  const retiredDrivers = useMemo((): ReadonlySet<number> => {
    if (!isMapVisible) return new Set<number>();
    return deriveRetiredDrivers({
      positions,
      laps,
      raceControl,
      currentT: sessionStartMs + sessionTimeMsSlow,
      isRaceSession,
    });
  }, [
    positions,
    laps,
    raceControl,
    sessionStartMs,
    sessionTimeMsSlow,
    isMapVisible,
    isRaceSession,
  ]);

  return {
    pulseDrivers,
    focusDriverLap,
    compareDriverLap,
    activeCompounds,
    battlingDrivers,
    retiredDrivers,
  } as const;
}
