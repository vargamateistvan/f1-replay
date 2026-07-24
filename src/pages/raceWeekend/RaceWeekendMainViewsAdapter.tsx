import type { ReactNode } from "react";

type RaceWeekendMainView = "leaderboard" | "tracker" | "commentary";

interface RaceWeekendMainViewsAdapterProps {
  currentView: RaceWeekendMainView;
  leaderboardView: ReactNode;
  trackerView: ReactNode;
  commentaryView: ReactNode;
}

export function RaceWeekendMainViewsAdapter({
  currentView,
  leaderboardView,
  trackerView,
  commentaryView,
}: Readonly<RaceWeekendMainViewsAdapterProps>) {
  if (currentView === "leaderboard") {
    return <>{leaderboardView}</>;
  }

  if (currentView === "tracker") {
    return <>{trackerView}</>;
  }

  return <>{commentaryView}</>;
}
