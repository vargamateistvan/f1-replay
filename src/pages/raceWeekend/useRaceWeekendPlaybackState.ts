import { useMemo } from "react";
import type { Lap, RaceControl, SessionResult } from "@/api/types";
import { DEFAULT_SESSION_MS } from "@/constants";
import {
  detectQualiPhase,
  isQualiSession,
  isTimedSession,
} from "@/utils/session";

interface TimedLapRow {
  row: Lap;
  relMs: number;
}

interface TimedRaceControlRow {
  row: RaceControl;
  relMs: number;
}

interface TimedTeamRadioRow {
  relMs: number;
}

interface UseRaceWeekendPlaybackStateArgs {
  isRaceSession: boolean;
  chequeredMs: number | null;
  sessionStartMs: number;
  durationMs: number;
  sessionTimeMs: number;
  currentLap: number;
  sessionName: string;
  timedLaps: TimedLapRow[];
  timedTeamRadio: TimedTeamRadioRow[];
  timedRaceControl: TimedRaceControlRow[];
  laps: Lap[];
  raceControl: RaceControl[];
  sessionResults: SessionResult[];
}

export function useRaceWeekendPlaybackState({
  isRaceSession,
  chequeredMs,
  sessionStartMs,
  durationMs,
  sessionTimeMs,
  currentLap,
  sessionName,
  timedLaps,
  timedTeamRadio,
  timedRaceControl,
  laps,
  raceControl,
  sessionResults,
}: Readonly<UseRaceWeekendPlaybackStateArgs>) {
  const effectiveDuration = durationMs || DEFAULT_SESSION_MS;

  const postRaceDurationMs = useMemo(() => {
    if (!isRaceSession || chequeredMs === null || !sessionStartMs) return null;

    let latestMs = chequeredMs;

    for (const { row: lap, relMs: lapStartMs } of timedLaps) {
      if (!lap.date_start || !lap.lap_duration || lap.lap_duration <= 0) {
        continue;
      }
      const lapEndMs = lapStartMs + lap.lap_duration * 1000;
      if (lapEndMs > chequeredMs) {
        latestMs = Math.max(latestMs, lapEndMs);
      }
    }

    for (const { relMs: radioMs } of timedTeamRadio) {
      if (radioMs > chequeredMs) {
        latestMs = Math.max(latestMs, radioMs);
      }
    }

    return latestMs > chequeredMs ? latestMs : null;
  }, [isRaceSession, chequeredMs, sessionStartMs, timedLaps, timedTeamRadio]);

  const playbackDurationMs =
    isRaceSession && chequeredMs !== null && postRaceDurationMs !== null
      ? postRaceDurationMs
      : isRaceSession && chequeredMs !== null
        ? chequeredMs
        : effectiveDuration;

  const finalClassificationTriggerMs =
    chequeredMs ?? (durationMs > 0 ? durationMs : null);

  const showFinalClassification =
    finalClassificationTriggerMs === null
      ? false
      : sessionTimeMs >= finalClassificationTriggerMs &&
        sessionResults.length > 0;

  const totalLapCount = useMemo(() => {
    if (!isRaceSession) return null;

    const observedLapCount = Math.max(0, ...laps.map((lap) => lap.lap_number));
    const classifiedLapCount = Math.max(
      0,
      ...sessionResults.map((result) => result.number_of_laps ?? 0),
    );
    const total = Math.max(observedLapCount, classifiedLapCount);

    return total > 0 ? total : null;
  }, [isRaceSession, laps, sessionResults]);

  const commentaryLapLabel = useMemo(() => {
    if (currentLap <= 0) return "—";
    if (totalLapCount === null) return String(currentLap);
    return `${currentLap}/${totalLapCount}`;
  }, [currentLap, totalLapCount]);

  const countdownMs =
    isTimedSession(sessionName) && effectiveDuration > 0
      ? Math.max(0, effectiveDuration - sessionTimeMs)
      : null;

  const qualiPhase = isQualiSession(sessionName)
    ? detectQualiPhase(raceControl, sessionStartMs, sessionTimeMs)
    : null;

  const qualiPhaseStartTimes = useMemo(() => {
    if (!sessionStartMs || !isQualiSession(sessionName)) {
      return {
        q2StartMs: null as number | null,
        q3StartMs: null as number | null,
      };
    }

    let q2StartMs: number | null = null;
    let q3StartMs: number | null = null;
    for (const { row: entry, relMs } of timedRaceControl) {
      const msg = (entry.message ?? "").toUpperCase();
      if (q2StartMs === null && /\bQ2\b/.test(msg)) q2StartMs = relMs;
      if (q3StartMs === null && /\bQ3\b/.test(msg)) q3StartMs = relMs;
      if (q2StartMs !== null && q3StartMs !== null) break;
    }

    return { q2StartMs, q3StartMs };
  }, [timedRaceControl, sessionName, sessionStartMs]);

  return {
    effectiveDuration,
    postRaceDurationMs,
    playbackDurationMs,
    finalClassificationTriggerMs,
    showFinalClassification,
    totalLapCount,
    commentaryLapLabel,
    countdownMs,
    qualiPhase,
    qualiPhaseStartTimes,
  } as const;
}
