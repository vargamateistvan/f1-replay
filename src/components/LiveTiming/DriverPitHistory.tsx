import type { ReactNode } from "react";
import type { Driver, Pit, Stint } from "@/api/types";
import { PitFeed } from "@/components/Pits/PitFeed";
import { useSettings } from "@/stores/settings";
import type { PitBattle } from "@/utils/undercut";
import { TimingHistoryPopover } from "./TimingHistoryPopover";

export function DriverPitHistory({
  driver,
  drivers,
  pitBattles,
  driverNumber,
  pits,
  stints,
  sessionTimeMs,
  sessionStartMs,
  label,
  children,
}: {
  driver?: Driver;
  drivers: Driver[];
  pitBattles?: PitBattle[];
  driverNumber: number;
  pits: Pit[];
  stints: Stint[];
  sessionTimeMs: number;
  sessionStartMs: number;
  label: string;
  children: ReactNode;
}) {
  const enabled = useSettings((s) => s.timingPitHistoryEnabled);
  const identity = driver?.name_acronym ?? String(driverNumber);
  return (
    <TimingHistoryPopover
      enabled={enabled}
      title="Pit stops"
      identity={identity}
      triggerLabel={`${label} for ${identity}: show pit stops`}
      dialogLabel={`Pit stops for ${identity}`}
      closeLabel="Close pit stops"
      content={
        <PitFeed
          compact
          entries={pits.filter((pit) => pit.driver_number === driverNumber)}
          pitBattles={pitBattles}
          stints={stints}
          drivers={drivers}
          sessionTimeMs={sessionTimeMs}
          sessionStartMs={sessionStartMs}
        />
      }
    >
      {children}
    </TimingHistoryPopover>
  );
}
