import { lazy } from "react";
import type { Driver, Interval, Position } from "@/api/types";
import { TrackerPanelFrame } from "./TrackerPanelFrame";

const LapChart = lazy(() =>
  import("@/components/LapChart/LapChart").then((m) => ({
    default: m.LapChart,
  })),
);

const GapChart = lazy(() =>
  import("@/components/GapChart/GapChart").then((m) => ({
    default: m.GapChart,
  })),
);

interface TrackerLapChartPanelProps {
  drivers: Driver[];
  positions: Position[];
  lapStarts: number[];
  sessionStartMs: number;
  sessionTimeMs: number;
  currentLap: number;
  mobile?: boolean;
}

interface TrackerGapChartPanelProps {
  drivers: Driver[];
  intervals: Interval[];
  lapStarts: number[];
  currentLap: number;
  sessionStartMs: number;
  sessionTimeMs: number;
  mobile?: boolean;
}

export function TrackerLapChartPanel({
  drivers,
  positions,
  lapStarts,
  sessionStartMs,
  sessionTimeMs,
  currentLap,
  mobile = false,
}: Readonly<TrackerLapChartPanelProps>) {
  return (
    <TrackerPanelFrame mobile={mobile}>
      <LapChart
        drivers={drivers}
        positions={positions}
        lapStarts={lapStarts}
        sessionStartMs={sessionStartMs}
        sessionTimeMs={sessionTimeMs}
        currentLap={currentLap}
      />
    </TrackerPanelFrame>
  );
}

export function TrackerGapChartPanel({
  drivers,
  intervals,
  lapStarts,
  currentLap,
  sessionStartMs,
  sessionTimeMs,
  mobile = false,
}: Readonly<TrackerGapChartPanelProps>) {
  return (
    <TrackerPanelFrame mobile={mobile}>
      <GapChart
        drivers={drivers}
        intervals={intervals}
        lapStarts={lapStarts}
        currentLap={currentLap}
        sessionStartMs={sessionStartMs}
        sessionTimeMs={sessionTimeMs}
      />
    </TrackerPanelFrame>
  );
}
