import type { ComponentProps } from "react";
import { RaceTimingTower } from "./RaceTimingTower";

type TrackerTimingTowerProps = Omit<
  ComponentProps<typeof RaceTimingTower>,
  "mode"
>;

export function TrackerTimingTower(props: Readonly<TrackerTimingTowerProps>) {
  return (
    <RaceTimingTower
      mode="tracker"
      drivers={props.drivers}
      positions={props.positions}
      intervals={props.intervals}
      pits={props.pits}
      laps={props.laps}
      raceControl={props.raceControl}
      stints={props.stints}
      grid={props.grid}
      sessionName={props.sessionName}
      sessionTimeMs={props.sessionTimeMs}
      sessionStartMs={props.sessionStartMs}
      isLoading={props.isLoading}
      totalLapCount={props.totalLapCount}
      selectedDriver={props.selectedDriver}
      compareDriver={props.compareDriver}
      onSelectDriver={props.onSelectDriver}
      carData={props.carData}
      showMinisectors={props.showMinisectors}
      trackerDenseMobileTelemetry={props.trackerDenseMobileTelemetry}
      trackerShowInterval={props.trackerShowInterval}
      trackerColumns={props.trackerColumns}
      mobileColumns={props.mobileColumns}
      chequeredMs={props.chequeredMs}
    />
  );
}
