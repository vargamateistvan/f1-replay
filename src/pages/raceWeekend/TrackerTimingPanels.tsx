import type { ReactNode } from "react";
import { ErrorMessage } from "@/components/ErrorMessage";

interface TrackerTimingPanelProps {
  hasTimingError: boolean;
  timingTower: ReactNode;
}

export interface TrackerFocusedTelemetryPanelProps {
  telemetry: ReactNode;
}

interface TrackerMobileTimingContentProps {
  hasTimingError: boolean;
  timingTower: ReactNode;
  telemetry: ReactNode;
}

interface TrackerDesktopTimingContentProps {
  hasTimingError: boolean;
  timingTower: ReactNode;
}

export function TrackerTimingPanel({
  hasTimingError,
  timingTower,
}: Readonly<TrackerTimingPanelProps>) {
  return (
    <div className="flex flex-col md:flex-1 md:min-h-0 md:overflow-hidden">
      {hasTimingError ? (
        <ErrorMessage message="Failed to load timing data" />
      ) : (
        timingTower
      )}
    </div>
  );
}

export function TrackerFocusedTelemetryPanel({
  telemetry,
}: Readonly<TrackerFocusedTelemetryPanelProps>) {
  if (!telemetry) return null;
  return <div className="shrink-0 border-t border-panel">{telemetry}</div>;
}

export function TrackerMobileTimingContent({
  hasTimingError,
  timingTower,
  telemetry,
}: Readonly<TrackerMobileTimingContentProps>) {
  return (
    <>
      <TrackerTimingPanel
        hasTimingError={hasTimingError}
        timingTower={timingTower}
      />
      <TrackerFocusedTelemetryPanel telemetry={telemetry} />
    </>
  );
}

export function TrackerDesktopTimingContent({
  hasTimingError,
  timingTower,
}: Readonly<TrackerDesktopTimingContentProps>) {
  return (
    <TrackerTimingPanel
      hasTimingError={hasTimingError}
      timingTower={timingTower}
    />
  );
}
