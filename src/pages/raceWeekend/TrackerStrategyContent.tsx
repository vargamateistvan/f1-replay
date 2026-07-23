import type { ReactNode } from "react";

interface TrackerStrategyContentProps {
  children: ReactNode;
}

const PANEL = "bg-surface border border-panel";
const PANEL_TITLE =
  "text-[10px] font-bold text-muted px-3 py-2 border-b border-panel uppercase tracking-[0.12em] border-l-2 border-l-f1red bg-track";

export function TrackerStrategyContent({
  children,
}: Readonly<TrackerStrategyContentProps>) {
  return (
    <div className={`${PANEL} flex-1 flex flex-col overflow-hidden border-0`}>
      <div className={`${PANEL_TITLE} shrink-0`}>Tyre Strategy</div>
      <div className="min-h-0 overflow-y-auto md:panel-scroll [-webkit-overflow-scrolling:touch]">
        {children}
      </div>
    </div>
  );
}
