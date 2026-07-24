import type { ReactNode } from "react";
import { trackEvent } from "@/lib/analytics";
import type { CommentaryTab } from "@/components/CommentaryPanels/CommentaryPanels";
import type { CommentaryTabMeta } from "./CommentaryTabBar";
import { CommentarySection } from "./CommentarySection";

interface CommentarySectionAdapterProps {
  header: ReactNode;
  tabs: readonly CommentaryTabMeta[];
  commentaryTab: CommentaryTab | null;
  setCommentaryTab: (tab: CommentaryTab) => void;
  lapLabel: string;
  timeMode: "elapsed" | "all";
  onToggleTimeMode: () => void;
  content: ReactNode;
}

export function CommentarySectionAdapter({
  header,
  tabs,
  commentaryTab,
  setCommentaryTab,
  lapLabel,
  timeMode,
  onToggleTimeMode,
  content,
}: Readonly<CommentarySectionAdapterProps>) {
  return (
    <CommentarySection
      header={header}
      tabs={tabs}
      activeTab={commentaryTab ?? "rc"}
      onTabChange={(tab) => {
        trackEvent("raceweekend_commentary_tab_changed", { tab });
        setCommentaryTab(tab);
      }}
      lapLabel={lapLabel}
      timeMode={timeMode}
      onToggleTimeMode={onToggleTimeMode}
      content={content}
    />
  );
}
