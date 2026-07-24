import { ErrorMessage } from "@/components/ErrorMessage";
import { LeaderboardView } from "./LeaderboardView";
import { LeaderboardLoadingIndicator } from "./LeaderboardLoadingIndicator";
import type { ReactNode } from "react";

interface RaceWeekendLeaderboardSectionAdapterProps {
  header: ReactNode;
  isLoadingSessionData: boolean;
  hasPositionsError: boolean;
  leaderboardTower: ReactNode;
}

export function RaceWeekendLeaderboardSectionAdapter({
  header,
  isLoadingSessionData,
  hasPositionsError,
  leaderboardTower,
}: Readonly<RaceWeekendLeaderboardSectionAdapterProps>) {
  const loadingIndicator = isLoadingSessionData ? (
    <LeaderboardLoadingIndicator />
  ) : undefined;

  const content = hasPositionsError ? (
    <ErrorMessage message="Failed to load timing data" />
  ) : (
    leaderboardTower
  );

  return (
    <LeaderboardView
      header={header}
      loadingIndicator={loadingIndicator}
      content={content}
    />
  );
}
