import { lazy, Suspense } from "react";
import type { Driver, Lap, Pit, Stint } from "@/api/types";
import { PanelFallback } from "./PanelFallback";
import { TrackerStrategyContent } from "./TrackerStrategyContent";

const StrategyBar = lazy(() =>
  import("@/components/Strategy/StrategyBar").then((m) => ({
    default: m.StrategyBar,
  })),
);

interface TrackerStrategyPanelProps {
  stints: Stint[];
  drivers: Driver[];
  laps: Lap[];
  pits: Pit[];
  sessionTimeMs: number;
  sessionStartMs: number;
  currentLap: number;
}

export function TrackerStrategyPanel({
  stints,
  drivers,
  laps,
  pits,
  sessionTimeMs,
  sessionStartMs,
  currentLap,
}: Readonly<TrackerStrategyPanelProps>) {
  return (
    <TrackerStrategyContent>
      <Suspense fallback={<PanelFallback />}>
        <StrategyBar
          stints={stints}
          drivers={drivers}
          laps={laps}
          pits={pits}
          sessionTimeMs={sessionTimeMs}
          sessionStartMs={sessionStartMs}
          currentLap={currentLap}
        />
      </Suspense>
    </TrackerStrategyContent>
  );
}
