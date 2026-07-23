import LiveTiming from "@/components/LiveTiming/LiveTiming";
import type {
  CarData,
  Driver,
  Interval,
  Lap,
  Pit,
  Position,
  RaceControl,
  StartingGrid,
  Stint,
} from "@/api/types";

type TimingMode = "tracker" | "leaderboard";

interface MobileColumns {
  showPosition: boolean;
  showDriver: boolean;
  showAlerts: boolean;
  showBestLap: boolean;
  showLastLap: boolean;
  showGap: boolean;
  showS1: boolean;
  showS2: boolean;
  showS3: boolean;
  showPosDelta: boolean;
  showTyre: boolean;
  showPitCount: boolean;
  showInterval: boolean;
  showLap: boolean;
}

interface TrackerColumns {
  position: boolean;
  driver: boolean;
  alerts: boolean;
  bestLap: boolean;
  lastLap: boolean;
  gap: boolean;
  interval: boolean;
  s1: boolean;
  s2: boolean;
  s3: boolean;
  posDelta: boolean;
  tyre: boolean;
  pit: boolean;
  currentLap: boolean;
  speed: boolean;
  gear: boolean;
  rpm: boolean;
  thrBrk: boolean;
  drs: boolean;
}

interface RaceTimingTowerProps {
  mode: TimingMode;
  drivers: Driver[];
  positions: Position[];
  intervals: Interval[];
  pits: Pit[];
  laps: Lap[];
  raceControl: RaceControl[];
  stints: Stint[];
  grid: StartingGrid[];
  sessionName: string | undefined;
  sessionTimeMs: number;
  sessionStartMs: number;
  isLoading: boolean;
  totalLapCount: number | null;
  selectedDriver: number | null;
  compareDriver: number | null;
  onSelectDriver: (num: number) => void;
  carData?: ReadonlyMap<number, CarData>;
  showMinisectors: boolean;
  mobileColumns: MobileColumns;
  chequeredMs: number | null;
  trackerDenseMobileTelemetry?: boolean;
  trackerShowInterval?: boolean;
  trackerColumns?: TrackerColumns;
}

export function RaceTimingTower({
  mode,
  drivers,
  positions,
  intervals,
  pits,
  laps,
  raceControl,
  stints,
  grid,
  sessionName,
  sessionTimeMs,
  sessionStartMs,
  isLoading,
  totalLapCount,
  selectedDriver,
  compareDriver,
  onSelectDriver,
  carData,
  showMinisectors,
  mobileColumns,
  chequeredMs,
  trackerDenseMobileTelemetry,
  trackerShowInterval,
  trackerColumns,
}: Readonly<RaceTimingTowerProps>) {
  const showMobileSectorsColumns =
    mobileColumns.showS1 || mobileColumns.showS2 || mobileColumns.showS3;

  if (mode === "tracker") {
    return (
      <LiveTiming
        drivers={drivers}
        positions={positions}
        intervals={intervals}
        pits={pits}
        laps={laps}
        raceControl={raceControl}
        stints={stints}
        grid={grid}
        sessionName={sessionName}
        sessionTimeMs={sessionTimeMs}
        sessionStartMs={sessionStartMs}
        isLoading={isLoading}
        totalLapCount={totalLapCount}
        selectedDriver={selectedDriver}
        compareDriver={compareDriver}
        onSelectDriver={onSelectDriver}
        carData={carData}
        showMinisectors={showMinisectors}
        showDenseMobileTelemetry={trackerDenseMobileTelemetry}
        showMobilePositionColumn={mobileColumns.showPosition}
        showMobileDriverColumn={mobileColumns.showDriver}
        showMobileAlertsColumn={mobileColumns.showAlerts}
        showMobileBestLapColumn={mobileColumns.showBestLap}
        showMobileLastLapColumn={mobileColumns.showLastLap}
        showMobileGapColumn={mobileColumns.showGap}
        showMobileS1Column={mobileColumns.showS1}
        showMobileS2Column={mobileColumns.showS2}
        showMobileS3Column={mobileColumns.showS3}
        showMobilePosDeltaColumn={mobileColumns.showPosDelta}
        showMobileTyreColumn={mobileColumns.showTyre}
        showMobilePitCountColumn={mobileColumns.showPitCount}
        showIntervalColumn={trackerShowInterval}
        showMobileIntervalColumn={mobileColumns.showInterval}
        showMobileCurrentLapColumn={mobileColumns.showLap}
        showMobileSectorsColumns={showMobileSectorsColumns}
        columnVisibility={trackerColumns}
        compactDriverColumn
        dense
        chequeredMs={chequeredMs}
      />
    );
  }

  return (
    <LiveTiming
      drivers={drivers}
      positions={positions}
      intervals={intervals}
      pits={pits}
      laps={laps}
      raceControl={raceControl}
      stints={stints}
      grid={grid}
      sessionName={sessionName}
      sessionTimeMs={sessionTimeMs}
      sessionStartMs={sessionStartMs}
      isLoading={isLoading}
      totalLapCount={totalLapCount}
      selectedDriver={selectedDriver}
      compareDriver={compareDriver}
      onSelectDriver={onSelectDriver}
      carData={carData}
      showMinisectors={showMinisectors}
      showIntervalColumn
      showFullLastName
      showMobilePositionColumn={mobileColumns.showPosition}
      showMobileDriverColumn={mobileColumns.showDriver}
      showMobileAlertsColumn={mobileColumns.showAlerts}
      showMobileBestLapColumn={mobileColumns.showBestLap}
      showMobileLastLapColumn={mobileColumns.showLastLap}
      showMobileGapColumn={mobileColumns.showGap}
      showMobileS1Column={mobileColumns.showS1}
      showMobileS2Column={mobileColumns.showS2}
      showMobileS3Column={mobileColumns.showS3}
      showMobilePosDeltaColumn={mobileColumns.showPosDelta}
      showMobileTyreColumn={mobileColumns.showTyre}
      showMobilePitCountColumn={mobileColumns.showPitCount}
      showMobileIntervalColumn={mobileColumns.showInterval}
      showMobileCurrentLapColumn={mobileColumns.showLap}
      showMobileSectorsColumns={showMobileSectorsColumns}
      wideSectors
      dense
      fullWidthTable
      chequeredMs={chequeredMs}
    />
  );
}
