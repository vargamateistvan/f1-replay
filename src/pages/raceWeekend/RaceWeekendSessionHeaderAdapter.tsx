import { RaceWeekendSessionHeader } from "./RaceWeekendSessionHeader";
import type { Lap, RaceControl } from "@/api/types";

interface RaceWeekendSessionHeaderAdapterProps {
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
  onOpenEliminations: () => void;
  onOpenResults: () => void;
  onJumpToSessionTime: (sessionTimeMs: number) => void;
}

export function RaceWeekendSessionHeaderAdapter({
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
  onOpenEliminations,
  onOpenResults,
  onJumpToSessionTime,
}: Readonly<RaceWeekendSessionHeaderAdapterProps>) {
  return (
    <RaceWeekendSessionHeader
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
      sessionName={sessionName}
      showFinalClassification={showFinalClassification}
      hasSessionResultError={hasSessionResultError}
      onShowEliminations={onOpenEliminations}
      onShowResults={onOpenResults}
      onJumpToSessionTime={onJumpToSessionTime}
    />
  );
}
