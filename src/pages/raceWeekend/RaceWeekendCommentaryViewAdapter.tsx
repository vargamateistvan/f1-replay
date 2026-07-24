import { CommentaryPanelsSection } from "./CommentaryPanelsSection";
import { CommentarySectionAdapter } from "./CommentarySectionAdapter";
import type { CommentaryTabMeta } from "./CommentaryTabBar";
import type { CommentaryTab } from "@/components/CommentaryPanels/CommentaryPanels";
import type {
  Driver,
  Lap,
  Overtake,
  Pit,
  Position,
  RaceControl,
  TeamRadio,
} from "@/api/types";
import type { IncidentWindow } from "@/timeline/raceControl";
import type { ReactNode } from "react";
import type { CommentaryTimeMode } from "./useCommentaryInteractions";
import type { ToastEvent } from "@/timeline/events";

interface RaceWeekendCommentaryViewAdapterProps {
  header: ReactNode;
  tabs: readonly CommentaryTabMeta[];
  commentaryTab: CommentaryTab;
  setCommentaryTab: (tab: CommentaryTab) => void;
  lapLabel: string;
  timeMode: CommentaryTimeMode;
  onToggleTimeMode: () => void;
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
  sessionType?: string;
  sessionTimeMs: number;
  sessionStartMs: number;
  toastEvents: ToastEvent[];
  focusDriver: number | null;
  onClearFocus: () => void;
  onPlayWindow: (startMs: number, endMs: number) => void;
}

export function RaceWeekendCommentaryViewAdapter({
  header,
  tabs,
  commentaryTab,
  setCommentaryTab,
  lapLabel,
  timeMode,
  onToggleTimeMode,
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
}: Readonly<RaceWeekendCommentaryViewAdapterProps>) {
  return (
    <CommentarySectionAdapter
      header={header}
      tabs={tabs}
      commentaryTab={commentaryTab}
      setCommentaryTab={setCommentaryTab}
      lapLabel={lapLabel}
      timeMode={timeMode}
      onToggleTimeMode={onToggleTimeMode}
      content={
        <CommentaryPanelsSection
          commentaryTab={commentaryTab}
          showAllItems={timeMode === "all"}
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
          focusDriver={focusDriver}
          onClearFocus={onClearFocus}
          onPlayWindow={onPlayWindow}
        />
      }
    />
  );
}
