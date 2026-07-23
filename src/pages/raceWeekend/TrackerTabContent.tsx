import type { ReactNode } from "react";
import type { TrackerTab } from "./TrackerTabBar";

interface TrackerTabContentProps {
  activeTab: TrackerTab;
  timingContent: ReactNode;
  mapContent?: ReactNode;
  strategyContent: ReactNode;
  chartContent: ReactNode;
  gapContent: ReactNode;
}

export function TrackerTabContent({
  activeTab,
  timingContent,
  mapContent,
  strategyContent,
  chartContent,
  gapContent,
}: Readonly<TrackerTabContentProps>) {
  return (
    <div className="flex flex-col md:flex-1 md:min-h-0 md:overflow-hidden">
      {activeTab === "timing" && timingContent}
      {activeTab === "map" && mapContent}
      {activeTab === "strategy" && strategyContent}
      {activeTab === "chart" && chartContent}
      {activeTab === "gap" && gapContent}
    </div>
  );
}
