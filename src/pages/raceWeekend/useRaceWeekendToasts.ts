import { useMemo } from "react";
import type { Lap, Overtake, Pit, RaceControl, TeamRadio } from "@/api/types";
import { useCatchupSummary } from "@/hooks/useCatchupSummary";
import { useEventToasts } from "@/hooks/useEventToasts";
import { buildToastEvents } from "@/timeline/events";

interface UseRaceWeekendToastsArgs {
  teamRadioEntries: TeamRadio[];
  raceControlEntries: RaceControl[];
  overtakeEntries: Overtake[];
  pitEntries: Pit[];
  laps: Lap[];
  sessionStartMs: number;
  sessionTimeMs: number;
  shouldBuildToastEvents: boolean;
  shouldTrackToasts: boolean;
  toastsEnabled: boolean;
  toastRadioEnabled: boolean;
  toastFlagEnabled: boolean;
  toastInvestigationEnabled: boolean;
  toastPenaltyEnabled: boolean;
  toastOvertakeEnabled: boolean;
  toastPitEnabled: boolean;
  toastFastestLapEnabled: boolean;
}

export function useRaceWeekendToasts({
  teamRadioEntries,
  raceControlEntries,
  overtakeEntries,
  pitEntries,
  laps,
  sessionStartMs,
  sessionTimeMs,
  shouldBuildToastEvents,
  shouldTrackToasts,
  toastsEnabled,
  toastRadioEnabled,
  toastFlagEnabled,
  toastInvestigationEnabled,
  toastPenaltyEnabled,
  toastOvertakeEnabled,
  toastPitEnabled,
  toastFastestLapEnabled,
}: Readonly<UseRaceWeekendToastsArgs>) {
  const toastEvents = useMemo(() => {
    if (!shouldBuildToastEvents || !sessionStartMs) return [];
    return buildToastEvents(
      teamRadioEntries,
      raceControlEntries,
      overtakeEntries,
      pitEntries,
      sessionStartMs,
      laps,
    );
  }, [
    teamRadioEntries,
    raceControlEntries,
    overtakeEntries,
    pitEntries,
    sessionStartMs,
    laps,
    shouldBuildToastEvents,
  ]);

  const filteredToastEvents = useMemo(() => {
    if (!shouldTrackToasts || !toastsEnabled) return [];
    return toastEvents.filter((event) => {
      if (event.kind === "radio") return toastRadioEnabled;
      if (event.kind === "flag") return toastFlagEnabled;
      if (event.kind === "investigation") return toastInvestigationEnabled;
      if (event.kind === "penalty") return toastPenaltyEnabled;
      if (event.kind === "overtake") return toastOvertakeEnabled;
      if (event.kind === "pit") return toastPitEnabled;
      if (event.kind === "fastest_lap") return toastFastestLapEnabled;
      return true;
    });
  }, [
    toastEvents,
    shouldTrackToasts,
    toastsEnabled,
    toastRadioEnabled,
    toastFlagEnabled,
    toastInvestigationEnabled,
    toastPenaltyEnabled,
    toastOvertakeEnabled,
    toastPitEnabled,
    toastFastestLapEnabled,
  ]);

  const { toasts, dismiss } = useEventToasts(
    filteredToastEvents,
    sessionTimeMs,
  );
  const { summary: catchupSummary, dismiss: dismissCatchup } =
    useCatchupSummary(filteredToastEvents, sessionTimeMs);

  return {
    toastEvents,
    toasts,
    dismiss,
    catchupSummary,
    dismissCatchup,
  } as const;
}
