import type { MouseEvent, Ref, ReactNode, TouchEvent } from "react";
import type { Driver } from "@/api/types";
import { EventToastStack } from "@/components/EventToast/EventToastStack";
import type { ActiveToast } from "@/hooks/useEventToasts";
import { ResizeHandle } from "@/components/ResizeHandle";
import { TrackerMapPane } from "./TrackerMapPane";
import { TrackerTabBar, type TrackerTab } from "./TrackerTabBar";
import { TrackerTabContent } from "./TrackerTabContent";
import { TrackerView } from "./TrackerView";

interface TrackerSectionProps {
  header: ReactNode;
  activeTab: TrackerTab;
  onTrackerTabChange: (tab: TrackerTab, source: "mobile" | "desktop") => void;
  showOverlayToasts: boolean;
  toasts: ActiveToast[];
  drivers: Driver[];
  onDismissToast: (id: string) => void;
  radioAutoplay: boolean;
  soundsEnabled: boolean;
  maxVisibleToasts: 2 | 4 | 6 | 8;
  mobilePlayback?: ReactNode;
  mobileTimingContent: ReactNode;
  mobileMapContent: ReactNode;
  strategyContent: ReactNode;
  mobileChartContent: ReactNode;
  mobileGapContent: ReactNode;
  desktopTimingContent: ReactNode;
  desktopChartContent: ReactNode;
  desktopGapContent: ReactNode;
  desktopFocusedTelemetry: ReactNode;
  desktopSplitRef: Ref<HTMLDivElement>;
  desktopPanelWidth: number;
  onDesktopResizeMouseDown: (e: MouseEvent) => void;
  onDesktopResizeTouchStart: (e: TouchEvent) => void;
  onDesktopResizeDoubleClick: () => void;
  desktopMapContent: ReactNode;
  isLoadingSessionData: boolean;
}

export function TrackerSection({
  header,
  activeTab,
  onTrackerTabChange,
  showOverlayToasts,
  toasts,
  drivers,
  onDismissToast,
  radioAutoplay,
  soundsEnabled,
  maxVisibleToasts,
  mobilePlayback,
  mobileTimingContent,
  mobileMapContent,
  strategyContent,
  mobileChartContent,
  mobileGapContent,
  desktopTimingContent,
  desktopChartContent,
  desktopGapContent,
  desktopFocusedTelemetry,
  desktopSplitRef,
  desktopPanelWidth,
  onDesktopResizeMouseDown,
  onDesktopResizeTouchStart,
  onDesktopResizeDoubleClick,
  desktopMapContent,
  isLoadingSessionData,
}: Readonly<TrackerSectionProps>) {
  const overlayToasts = (
    <EventToastStack
      toasts={toasts}
      drivers={drivers}
      onDismiss={onDismissToast}
      radioAutoplay={radioAutoplay}
      soundsEnabled={soundsEnabled}
      maxVisible={maxVisibleToasts}
      layout="overlay"
    />
  );

  const mobileTabBar = (
    <TrackerTabBar
      source="mobile"
      activeTab={activeTab}
      onTabChange={onTrackerTabChange}
    />
  );

  const mobileTabContent = (
    <TrackerTabContent
      activeTab={activeTab}
      timingContent={mobileTimingContent}
      mapContent={mobileMapContent}
      strategyContent={strategyContent}
      chartContent={mobileChartContent}
      gapContent={mobileGapContent}
    />
  );

  const desktopTabBar = (
    <TrackerTabBar
      source="desktop"
      activeTab={activeTab}
      onTabChange={onTrackerTabChange}
    />
  );

  const desktopTabContent = (
    <TrackerTabContent
      activeTab={activeTab}
      timingContent={desktopTimingContent}
      strategyContent={strategyContent}
      chartContent={desktopChartContent}
      gapContent={desktopGapContent}
    />
  );

  const desktopResizeHandle = (
    <ResizeHandle
      onMouseDown={onDesktopResizeMouseDown}
      onTouchStart={onDesktopResizeTouchStart}
      onDoubleClick={onDesktopResizeDoubleClick}
      orientation="vertical"
      className="border-r border-panel/60 bg-track/80 hover:bg-panel active:bg-f1red"
    />
  );

  const desktopMapPane = (
    <TrackerMapPane
      variant="desktop"
      mapContent={desktopMapContent}
      isLoadingSessionData={isLoadingSessionData}
    />
  );

  return (
    <TrackerView
      header={header}
      showOverlayToasts={showOverlayToasts}
      overlayToasts={overlayToasts}
      mobileTabBar={mobileTabBar}
      mobilePlayback={mobilePlayback}
      mobileTabContent={mobileTabContent}
      desktopSplitRef={desktopSplitRef}
      desktopPanelWidth={desktopPanelWidth}
      desktopTabBar={desktopTabBar}
      desktopTabContent={desktopTabContent}
      desktopFocusedTelemetry={desktopFocusedTelemetry}
      desktopResizeHandle={desktopResizeHandle}
      desktopMapPane={desktopMapPane}
    />
  );
}
