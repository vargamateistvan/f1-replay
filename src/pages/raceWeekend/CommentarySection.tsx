import type { ReactNode } from "react";
import type { CommentaryTab } from "@/components/CommentaryPanels/CommentaryPanels";
import { CommentaryStatusBar } from "./CommentaryStatusBar";
import { CommentaryTabBar, type CommentaryTabMeta } from "./CommentaryTabBar";
import { CommentaryView } from "./CommentaryView";

interface CommentarySectionProps {
  header: ReactNode;
  tabs: readonly CommentaryTabMeta[];
  activeTab: CommentaryTab;
  onTabChange: (tab: CommentaryTab) => void;
  lapLabel: string;
  timeMode: "elapsed" | "all";
  onToggleTimeMode: () => void;
  content: ReactNode;
}

export function CommentarySection({
  header,
  tabs,
  activeTab,
  onTabChange,
  lapLabel,
  timeMode,
  onToggleTimeMode,
  content,
}: Readonly<CommentarySectionProps>) {
  const tabBar = (
    <CommentaryTabBar
      tabs={tabs}
      activeTab={activeTab}
      onTabChange={onTabChange}
    />
  );

  const statusBar = (
    <CommentaryStatusBar
      lapLabel={lapLabel}
      timeMode={timeMode}
      onToggleTimeMode={onToggleTimeMode}
    />
  );

  return (
    <CommentaryView
      header={header}
      tabBar={tabBar}
      statusBar={statusBar}
      content={content}
    />
  );
}
