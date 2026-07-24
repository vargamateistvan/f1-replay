import { lazy, Suspense } from "react";
import { ErrorMessage } from "@/components/ErrorMessage";
import type {
  ActiveTrackFlagState,
  ActiveTrackVehicles,
} from "@/components/TrackMap/TrackMap";
import type { Driver, Location, Stint, Weather } from "@/api/types";
import { PanelFallback } from "./PanelFallback";

const TrackMap = lazy(() =>
  import("@/components/TrackMap/TrackMap").then((m) => ({
    default: m.TrackMap,
  })),
);

interface TrackerMapContentProps {
  sessionKey: number | null;
  drivers: Driver[];
  hasDriversError: boolean;
  locationData: Location[];
  sessionStartMs: number;
  focusDriver: number | null;
  pulseDrivers: readonly number[];
  circuitShortName: string | null;
  circuitKey: number | null;
  year: number | null;
  activeCompounds?: ReadonlyMap<
    number,
    { compound: Stint["compound"]; age: number }
  >;
  battlingDrivers?: ReadonlySet<number>;
  retiredDrivers?: ReadonlySet<number>;
  focusDriverLap: number | null;
  weatherOverlay: Weather | null;
  activeTrackFlagState: ActiveTrackFlagState | null;
  activeTrackVehicles: ActiveTrackVehicles | null;
  showSectorBox: boolean;
  showTrackControls: boolean;
  showCompass: boolean;
  showFocusedHud: boolean;
  showTrackScreenshot: boolean;
  showEnhancedVisuals: boolean;
  onSelectDriver: (driverNumber: number) => void;
}

export function TrackerMapContent({
  sessionKey,
  drivers,
  hasDriversError,
  locationData,
  sessionStartMs,
  focusDriver,
  pulseDrivers,
  circuitShortName,
  circuitKey,
  year,
  activeCompounds,
  battlingDrivers,
  retiredDrivers,
  focusDriverLap,
  weatherOverlay,
  activeTrackFlagState,
  activeTrackVehicles,
  showSectorBox,
  showTrackControls,
  showCompass,
  showFocusedHud,
  showTrackScreenshot,
  showEnhancedVisuals,
  onSelectDriver,
}: Readonly<TrackerMapContentProps>) {
  if (hasDriversError) {
    return <ErrorMessage message="Failed to load driver data" />;
  }

  return (
    <Suspense fallback={<PanelFallback />}>
      <TrackMap
        sessionKey={sessionKey}
        drivers={drivers}
        locationData={locationData}
        sessionStartMs={sessionStartMs}
        focusDriver={focusDriver}
        pulseDrivers={pulseDrivers}
        circuitShortName={circuitShortName}
        circuitKey={circuitKey}
        year={year}
        activeCompounds={activeCompounds}
        battlingDrivers={battlingDrivers}
        retiredDrivers={retiredDrivers}
        focusDriverLap={focusDriverLap}
        showFocusedHud={showFocusedHud}
        activeTrackFlagState={activeTrackFlagState}
        showSectorBox={showSectorBox}
        showTrackControls={showTrackControls}
        showCompass={showCompass}
        showTrackScreenshot={showTrackScreenshot}
        showEnhancedVisuals={showEnhancedVisuals}
        weatherOverlay={weatherOverlay}
        activeTrackVehicles={activeTrackVehicles}
        onSelectDriver={onSelectDriver}
      />
    </Suspense>
  );
}
