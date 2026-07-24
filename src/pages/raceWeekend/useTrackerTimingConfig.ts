import type { MainView } from "@/components/Nav";
import type { TrackerTab } from "./TrackerTabBar";

interface UseTrackerTimingConfigArgs {
  currentView: MainView;
  activeTrackerTab: TrackerTab;
  leaderboardTelemetry: boolean;
  trackerTimingTelemetry: boolean;
  trackerTimingMobileCarData: boolean;
  trackerTimingShowPosition: boolean;
  trackerTimingShowDriver: boolean;
  trackerTimingShowAlerts: boolean;
  trackerTimingShowBestLap: boolean;
  trackerTimingShowLastLap: boolean;
  trackerTimingShowGap: boolean;
  trackerTimingShowInterval: boolean;
  trackerTimingShowS1: boolean;
  trackerTimingShowS2: boolean;
  trackerTimingShowS3: boolean;
  trackerTimingShowPosDelta: boolean;
  trackerTimingShowTyre: boolean;
  trackerTimingShowPit: boolean;
  trackerTimingShowLap: boolean;
  trackerTimingShowSpeed: boolean;
  trackerTimingShowGear: boolean;
  trackerTimingShowRpm: boolean;
  trackerTimingShowThrBrk: boolean;
  trackerTimingShowDrs: boolean;
  timingMobileShowPosition: boolean;
  timingMobileShowDriver: boolean;
  timingMobileShowAlerts: boolean;
  timingMobileShowBestLap: boolean;
  timingMobileShowLastLap: boolean;
  timingMobileShowGap: boolean;
  timingMobileShowS1: boolean;
  timingMobileShowS2: boolean;
  timingMobileShowS3: boolean;
  timingMobileShowPosDelta: boolean;
  timingMobileShowTyre: boolean;
  timingMobileShowPitCount: boolean;
  timingMobileShowInterval: boolean;
  timingMobileShowLap: boolean;
}

export function useTrackerTimingConfig({
  currentView,
  activeTrackerTab,
  leaderboardTelemetry,
  trackerTimingTelemetry,
  trackerTimingMobileCarData,
  trackerTimingShowPosition,
  trackerTimingShowDriver,
  trackerTimingShowAlerts,
  trackerTimingShowBestLap,
  trackerTimingShowLastLap,
  trackerTimingShowGap,
  trackerTimingShowInterval,
  trackerTimingShowS1,
  trackerTimingShowS2,
  trackerTimingShowS3,
  trackerTimingShowPosDelta,
  trackerTimingShowTyre,
  trackerTimingShowPit,
  trackerTimingShowLap,
  trackerTimingShowSpeed,
  trackerTimingShowGear,
  trackerTimingShowRpm,
  trackerTimingShowThrBrk,
  trackerTimingShowDrs,
  timingMobileShowPosition,
  timingMobileShowDriver,
  timingMobileShowAlerts,
  timingMobileShowBestLap,
  timingMobileShowLastLap,
  timingMobileShowGap,
  timingMobileShowS1,
  timingMobileShowS2,
  timingMobileShowS3,
  timingMobileShowPosDelta,
  timingMobileShowTyre,
  timingMobileShowPitCount,
  timingMobileShowInterval,
  timingMobileShowLap,
}: Readonly<UseTrackerTimingConfigArgs>) {
  const trackerTimingDesktopTelemetryEnabled =
    trackerTimingTelemetry &&
    (trackerTimingShowSpeed ||
      trackerTimingShowGear ||
      trackerTimingShowRpm ||
      trackerTimingShowThrBrk ||
      trackerTimingShowDrs);

  const trackerTimingTelemetryEnabled =
    (trackerTimingDesktopTelemetryEnabled || trackerTimingMobileCarData) &&
    currentView === "tracker" &&
    activeTrackerTab === "timing";

  const telemetryEnabled =
    (leaderboardTelemetry && currentView === "leaderboard") ||
    trackerTimingTelemetryEnabled;

  const timingMobileColumns = {
    showPosition: timingMobileShowPosition,
    showDriver: timingMobileShowDriver,
    showAlerts: timingMobileShowAlerts,
    showBestLap: timingMobileShowBestLap,
    showLastLap: timingMobileShowLastLap,
    showGap: timingMobileShowGap,
    showS1: timingMobileShowS1,
    showS2: timingMobileShowS2,
    showS3: timingMobileShowS3,
    showPosDelta: timingMobileShowPosDelta,
    showTyre: timingMobileShowTyre,
    showPitCount: timingMobileShowPitCount,
    showInterval: timingMobileShowInterval,
    showLap: timingMobileShowLap,
  };

  const trackerTimingColumns = {
    position: trackerTimingShowPosition,
    driver: trackerTimingShowDriver,
    alerts: trackerTimingShowAlerts,
    bestLap: trackerTimingShowBestLap,
    lastLap: trackerTimingShowLastLap,
    gap: trackerTimingShowGap,
    interval: trackerTimingShowInterval,
    s1: trackerTimingShowS1,
    s2: trackerTimingShowS2,
    s3: trackerTimingShowS3,
    posDelta: trackerTimingShowPosDelta,
    tyre: trackerTimingShowTyre,
    pit: trackerTimingShowPit,
    currentLap: trackerTimingShowLap,
    speed: trackerTimingShowSpeed,
    gear: trackerTimingShowGear,
    rpm: trackerTimingShowRpm,
    thrBrk: trackerTimingShowThrBrk,
    drs: trackerTimingShowDrs,
  };

  return {
    trackerTimingTelemetryEnabled,
    telemetryEnabled,
    timingMobileColumns,
    trackerTimingColumns,
  } as const;
}
