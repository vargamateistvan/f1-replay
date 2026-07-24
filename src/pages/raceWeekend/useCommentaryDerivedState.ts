import { useMemo } from "react";
import type {
  Driver,
  Overtake,
  Pit,
  Position,
  RaceControl,
  TeamRadio,
} from "@/api/types";
import { buildKeyMoments } from "@/components/CommentaryPanels/keyMoments";
import type { ToastEvent } from "@/timeline/events";
import type { CommentaryTabMeta } from "./CommentaryTabBar";
import type { CommentaryTimeMode } from "./useCommentaryInteractions";

interface UseCommentaryDerivedStateArgs {
  positions: Position[];
  toastEvents: ToastEvent[];
  raceControl: RaceControl[];
  teamRadio: TeamRadio[];
  pits: Pit[];
  overtakes: Overtake[];
  drivers: Driver[];
  incidentWindowsCount: number;
  sessionStartMs: number;
  sessionTimeMs: number;
  commentaryTimeMode: CommentaryTimeMode;
}

export function useCommentaryDerivedState({
  positions,
  toastEvents,
  raceControl,
  teamRadio,
  pits,
  overtakes,
  drivers,
  incidentWindowsCount,
  sessionStartMs,
  sessionTimeMs,
  commentaryTimeMode,
}: Readonly<UseCommentaryDerivedStateArgs>) {
  const commentaryTimedPositions = useMemo(() => {
    if (!sessionStartMs || !positions.length) return [];
    return positions
      .map((entry) => ({
        ms: new Date(entry.date).getTime() - sessionStartMs,
        num: entry.driver_number,
        position: entry.position,
      }))
      .sort((a, b) => a.ms - b.ms);
  }, [positions, sessionStartMs]);

  const commentaryKeyMoments = useMemo(() => {
    if (!sessionStartMs) return [];
    return buildKeyMoments(
      commentaryTimedPositions,
      toastEvents,
      raceControl,
      drivers,
      sessionStartMs,
    );
  }, [
    commentaryTimedPositions,
    toastEvents,
    raceControl,
    drivers,
    sessionStartMs,
  ]);

  const commentaryKeyMomentsCount = useMemo(() => {
    if (commentaryTimeMode === "all") return commentaryKeyMoments.length;
    return commentaryKeyMoments.filter((moment) => moment.ms <= sessionTimeMs)
      .length;
  }, [commentaryKeyMoments, commentaryTimeMode, sessionTimeMs]);

  const commentaryTabs = useMemo(
    (): readonly CommentaryTabMeta[] =>
      [
        ["rc", "Race Control", "RC", raceControl.length, "entries"],
        ["radio", "Team Radio", "Radio", teamRadio.length, "clips"],
        ["pits", "Pit Stops", "Pits", pits.length, "stops"],
        ["passes", "Overtakes", "Passes", overtakes.length, "moves"],
        [
          "moments",
          "Key Moments",
          "Moments",
          commentaryKeyMomentsCount,
          "beats",
        ],
        ["chapters", "Chapters", "Chptrs", incidentWindowsCount, "windows"],
      ] as const,
    [
      raceControl.length,
      teamRadio.length,
      pits.length,
      overtakes.length,
      commentaryKeyMomentsCount,
      incidentWindowsCount,
    ],
  );

  return {
    commentaryTabs,
  } as const;
}
