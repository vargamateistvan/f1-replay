import type { ReactNode, Ref } from "react";

interface TrackerViewProps {
  header: ReactNode;
  showOverlayToasts: boolean;
  overlayToasts: ReactNode;
  mobileTabBar: ReactNode;
  mobilePlayback?: ReactNode;
  mobileTabContent: ReactNode;
  desktopSplitRef: Ref<HTMLDivElement>;
  desktopPanelWidth: number;
  desktopTabBar: ReactNode;
  desktopTabContent: ReactNode;
  desktopFocusedTelemetry: ReactNode;
  desktopResizeHandle: ReactNode;
  desktopMapPane: ReactNode;
}

export function TrackerView({
  header,
  showOverlayToasts,
  overlayToasts,
  mobileTabBar,
  mobilePlayback,
  mobileTabContent,
  desktopSplitRef,
  desktopPanelWidth,
  desktopTabBar,
  desktopTabContent,
  desktopFocusedTelemetry,
  desktopResizeHandle,
  desktopMapPane,
}: Readonly<TrackerViewProps>) {
  return (
    <div className="flex flex-col md:flex-1 md:min-h-0 md:overflow-hidden">
      {header}
      <div className="flex flex-col md:flex-1 md:min-h-0 md:overflow-hidden relative">
        {showOverlayToasts && overlayToasts}

        <div className="md:hidden flex flex-col w-full">
          {mobileTabBar}
          {mobilePlayback}
          {mobileTabContent}
        </div>

        <div
          ref={desktopSplitRef}
          className="hidden md:flex flex-1 min-h-0 overflow-hidden"
        >
          <div
            className="shrink-0 flex flex-col border-r border-panel overflow-hidden"
            style={{ width: `${desktopPanelWidth}px` }}
          >
            {desktopTabBar}
            {desktopTabContent}
            {desktopFocusedTelemetry}
          </div>

          {desktopResizeHandle}
          {desktopMapPane}
        </div>
      </div>
    </div>
  );
}
