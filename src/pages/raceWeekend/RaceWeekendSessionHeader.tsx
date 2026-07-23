import { SessionInfoBar } from "@/components/SessionInfoBar";
import type { Lap, RaceControl } from "@/api/types";
import { isQualiSession } from "@/utils/session";

export interface RaceWeekendSessionHeaderProps {
  laps: Lap[];
  raceControl: RaceControl[];
  sessionTimeMs: number;
  sessionStartMs: number;
  qualiPhase: string | null;
  countdownMs: number | null;
  airTemp: number | null;
  trackTemp: number | null;
  isRaceSession: boolean;
  lightsOutMs: number | null;
  totalLapCount: number | null;
  sessionName: string;
  showFinalClassification: boolean;
  hasSessionResultError: boolean;
  onShowEliminations: () => void;
  onShowResults: () => void;
  onJumpToSessionTime: (sessionTimeMs: number) => void;
}

export function RaceWeekendSessionHeader({
  laps,
  raceControl,
  sessionTimeMs,
  sessionStartMs,
  qualiPhase,
  countdownMs,
  airTemp,
  trackTemp,
  isRaceSession,
  lightsOutMs,
  totalLapCount,
  sessionName,
  showFinalClassification,
  hasSessionResultError,
  onShowEliminations,
  onShowResults,
  onJumpToSessionTime,
}: Readonly<RaceWeekendSessionHeaderProps>) {
  const showEliminations = isQualiSession(sessionName) && qualiPhase !== null;
  const showResults = showFinalClassification && !hasSessionResultError;

  return (
    <SessionInfoBar
      laps={laps}
      raceControl={raceControl}
      sessionTimeMs={sessionTimeMs}
      sessionStartMs={sessionStartMs}
      qualiPhase={qualiPhase}
      countdownMs={countdownMs}
      airTemp={airTemp}
      trackTemp={trackTemp}
      isRaceSession={isRaceSession}
      lightsOutMs={lightsOutMs}
      totalLapCount={totalLapCount}
      onShowEliminations={showEliminations ? onShowEliminations : undefined}
      onShowResults={showResults ? onShowResults : undefined}
      onJumpToSessionTime={onJumpToSessionTime}
    />
  );
}
