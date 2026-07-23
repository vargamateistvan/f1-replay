import { lazy, Suspense } from "react";
import type {
  Driver,
  Lap,
  Overtake,
  Pit,
  Position,
  RaceControl,
  TeamRadio,
} from "@/api/types";
import type { CommentaryTab } from "@/components/CommentaryPanels/CommentaryPanels";
import type { IncidentWindow } from "@/timeline/raceControl";
import type { ToastEvent } from "@/timeline/events";
import { PanelFallback } from "./PanelFallback";

const CommentaryPanels = lazy(() =>
  import("@/components/CommentaryPanels/CommentaryPanels").then((m) => ({
    default: m.CommentaryPanels,
  })),
);

interface CommentaryPanelsSectionProps {
  commentaryTab: CommentaryTab;
  showAllItems: boolean;
  raceControlError: boolean;
  teamRadioError: boolean;
  pitsError: boolean;
  overtakesError: boolean;
  raceControlEntries: RaceControl[];
  teamRadioEntries: TeamRadio[];
  pitEntries: Pit[];
  overtakeEntries: Overtake[];
  drivers: Driver[];
  laps: Lap[];
  positions: Position[];
  incidentWindows: IncidentWindow[];
  sessionKey: number | null;
  sessionYear: number | null;
  sessionType: string | undefined;
  sessionTimeMs: number;
  sessionStartMs: number;
  toastEvents: ToastEvent[];
  focusDriver: number | null;
  onClearFocus?: () => void;
  onPlayWindow: (startMs: number, endMs: number) => void;
}

export function CommentaryPanelsSection({
  commentaryTab,
  showAllItems,
  raceControlError,
  teamRadioError,
  pitsError,
  overtakesError,
  raceControlEntries,
  teamRadioEntries,
  pitEntries,
  overtakeEntries,
  drivers,
  laps,
  positions,
  incidentWindows,
  sessionKey,
  sessionYear,
  sessionType,
  sessionTimeMs,
  sessionStartMs,
  toastEvents,
  focusDriver,
  onClearFocus,
  onPlayWindow,
}: Readonly<CommentaryPanelsSectionProps>) {
  return (
    <Suspense fallback={<PanelFallback />}>
      <CommentaryPanels
        commentaryTab={commentaryTab}
        raceControlError={raceControlError}
        teamRadioError={teamRadioError}
        pitsError={pitsError}
        overtakesError={overtakesError}
        raceControlEntries={raceControlEntries}
        teamRadioEntries={teamRadioEntries}
        pitEntries={pitEntries}
        overtakeEntries={overtakeEntries}
        drivers={drivers}
        laps={laps}
        positions={positions}
        incidentWindows={incidentWindows}
        sessionKey={sessionKey}
        sessionYear={sessionYear}
        sessionType={sessionType}
        sessionTimeMs={sessionTimeMs}
        sessionStartMs={sessionStartMs}
        toastEvents={toastEvents}
        showAllItems={showAllItems}
        focusDriver={focusDriver}
        onClearFocus={onClearFocus}
        onPlayWindow={onPlayWindow}
      />
    </Suspense>
  );
}
