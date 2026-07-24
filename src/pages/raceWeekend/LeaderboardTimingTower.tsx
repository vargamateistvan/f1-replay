import type { ComponentProps } from "react";
import { RaceTimingTower } from "./RaceTimingTower";

type LeaderboardTimingTowerProps = Omit<
  ComponentProps<typeof RaceTimingTower>,
  "mode"
>;

export function LeaderboardTimingTower(
  props: Readonly<LeaderboardTimingTowerProps>,
) {
  return (
    <RaceTimingTower
      mode="leaderboard"
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
      mobileColumns={props.mobileColumns}
      chequeredMs={props.chequeredMs}
    />
  );
}
