import { StartingLights } from "@/components/StartingLights";

interface RaceWeekendTopOverlaysAdapterProps {
  isLoadingEventSession: boolean;
  showStartingLights: boolean;
  sessionTimeMs: number;
  lightsOutMs: number | null;
}

export function RaceWeekendTopOverlaysAdapter({
  isLoadingEventSession,
  showStartingLights,
  sessionTimeMs,
  lightsOutMs,
}: Readonly<RaceWeekendTopOverlaysAdapterProps>) {
  return (
    <>
      {isLoadingEventSession && (
        <div className="absolute inset-0 z-40 flex items-center justify-center bg-[#0b0c12]/86 backdrop-blur-sm">
          <div className="mx-4 w-full max-w-sm rounded border border-panel bg-surface px-4 py-4 text-center shadow-2xl">
            <div className="text-f1red text-[11px] font-black uppercase tracking-[0.16em] animate-pulse">
              Loading Event
            </div>
            <div className="mt-2 text-xs text-muted">
              Fetching the latest session and preparing track data.
            </div>
          </div>
        </div>
      )}

      {showStartingLights && lightsOutMs != null && (
        <StartingLights t={sessionTimeMs} lightsOutMs={lightsOutMs} />
      )}
    </>
  );
}
