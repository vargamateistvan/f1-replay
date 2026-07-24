import type { MouseEvent, ReactNode, Ref, TouchEvent } from "react";
import type { Driver } from "@/api/types";
import type { ActiveToast } from "@/hooks/useEventToasts";
import { TrackerSection } from "./TrackerSection";
import {
  TrackerFocusedTelemetryPanel,
  type TrackerFocusedTelemetryPanelProps,
} from "./TrackerTimingPanels";
import type { TrackerTab } from "./TrackerTabBar";

interface TrackerSectionAdapterProps {
  header: ReactNode;
  activeTab: TrackerTab;
  onTrackerTabChange: (tab: TrackerTab, source: "mobile" | "desktop") => void;
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
  focusedTelemetry: TrackerFocusedTelemetryPanelProps["telemetry"];
  desktopSplitRef: Ref<HTMLDivElement>;
  desktopPanelWidth: number;
  onDesktopResizeMouseDown: (e: MouseEvent) => void;
  onDesktopResizeTouchStart: (e: TouchEvent) => void;
  onDesktopResizeDoubleClick: () => void;
  desktopMapContent: ReactNode;
  isLoadingSessionData: boolean;
}

export function TrackerSectionAdapter({
  header,
  activeTab,
  onTrackerTabChange,
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
  focusedTelemetry,
  desktopSplitRef,
  desktopPanelWidth,
  onDesktopResizeMouseDown,
  onDesktopResizeTouchStart,
  onDesktopResizeDoubleClick,
  desktopMapContent,
  isLoadingSessionData,
}: Readonly<TrackerSectionAdapterProps>) {
  const desktopFocusedTelemetry = (
    <TrackerFocusedTelemetryPanel telemetry={focusedTelemetry} />
  );

  return (
    <TrackerSection
      header={header}
      showOverlayToasts={activeTab !== "map"}
      activeTab={activeTab}
      onTrackerTabChange={onTrackerTabChange}
      toasts={toasts}
      drivers={drivers}
      onDismissToast={onDismissToast}
      radioAutoplay={radioAutoplay}
      soundsEnabled={soundsEnabled}
      maxVisibleToasts={maxVisibleToasts}
      mobilePlayback={mobilePlayback}
      mobileTimingContent={mobileTimingContent}
      mobileMapContent={mobileMapContent}
      strategyContent={strategyContent}
      mobileChartContent={mobileChartContent}
      mobileGapContent={mobileGapContent}
      desktopTimingContent={desktopTimingContent}
      desktopChartContent={desktopChartContent}
      desktopGapContent={desktopGapContent}
      desktopFocusedTelemetry={desktopFocusedTelemetry}
      desktopSplitRef={desktopSplitRef}
      desktopPanelWidth={desktopPanelWidth}
      onDesktopResizeMouseDown={onDesktopResizeMouseDown}
      onDesktopResizeTouchStart={onDesktopResizeTouchStart}
      onDesktopResizeDoubleClick={onDesktopResizeDoubleClick}
      desktopMapContent={desktopMapContent}
      isLoadingSessionData={isLoadingSessionData}
    />
  );
}
