import type { ReactNode } from "react";
import { ErrorMessage } from "@/components/ErrorMessage";

interface TrackerTimingPanelProps {
  hasTimingError: boolean;
  timingTower: ReactNode;
}

interface TrackerFocusedTelemetryPanelProps {
  telemetry: ReactNode;
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
