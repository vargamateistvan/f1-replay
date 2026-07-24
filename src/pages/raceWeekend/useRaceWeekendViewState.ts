import {
  chunkIndexFor,
  locationChunkIndexFor,
} from "@/hooks/useLocationChunks";
import type { MainView } from "@/components/Nav";
import type { TrackerTab } from "./TrackerTabBar";

interface UseRaceWeekendViewStateArgs {
  sessionKey: number | null;
  meetingKey: number | null;
  sessionsPending: boolean;
  driversPending: boolean;
  positionsPending: boolean;
  intervalsPending: boolean;
  currentView: MainView;
  activeTrackerTab: TrackerTab;
  isCompactViewport: boolean;
  playbackSpeed: number;
  sessionTimeMs: number;
}

export function useRaceWeekendViewState({
  sessionKey,
  meetingKey,
  sessionsPending,
  driversPending,
  positionsPending,
  intervalsPending,
  currentView,
  activeTrackerTab,
  isCompactViewport,
  playbackSpeed,
  sessionTimeMs,
}: Readonly<UseRaceWeekendViewStateArgs>) {
  const isLoadingSessionData =
    sessionKey !== null &&
    (driversPending || positionsPending || intervalsPending);

  const isLoadingEventSession =
    meetingKey !== null &&
    (sessionKey === null || sessionsPending || isLoadingSessionData);

  const locationChunkIdx = locationChunkIndexFor(sessionTimeMs);
  const telemetryChunkIdx = chunkIndexFor(sessionTimeMs);

  const isMapVisible =
    currentView === "tracker" &&
    (!isCompactViewport || activeTrackerTab === "map");

  const shouldPrefetchMapChunks =
    !isCompactViewport && isMapVisible && playbackSpeed >= 4;

  const shouldTrackToasts = currentView === "tracker";
  const shouldBuildCommentaryMoments = currentView === "commentary";
  const shouldBuildToastEvents =
    shouldTrackToasts || shouldBuildCommentaryMoments;

  return {
    isLoadingSessionData,
    isLoadingEventSession,
    locationChunkIdx,
    telemetryChunkIdx,
    isMapVisible,
    shouldPrefetchMapChunks,
    shouldTrackToasts,
    shouldBuildCommentaryMoments,
    shouldBuildToastEvents,
  } as const;
}
