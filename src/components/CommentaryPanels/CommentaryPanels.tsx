import { lazy, Suspense, useMemo } from "react";
import type { ReactNode } from "react";
import { ErrorMessage } from "@/components/ErrorMessage";
import { useTimeline } from "@/timeline/clock";
import type { FastestLapPayload, ToastEvent } from "@/timeline/events";
import { buildRaceChapters, computeWhatChanged } from "@/timeline/raceControl";
import { getSafetyControlPhase } from "@/utils/raceControlFlags";
import { teamColor } from "@/utils/color";
import type {
  Driver,
  Lap,
  Overtake,
  Pit,
  Position,
  RaceControl,
  TeamRadio,
} from "@/api/types";
import type { IncidentWindow } from "@/timeline/raceControl";
import type { KeyMoment } from "@/components/KeyMoments/types";

export type CommentaryTab =
  | "rc"
  | "radio"
  | "pits"
  | "passes"
  | "moments"
  | "chapters";

const RaceControlFeed = lazy(() =>
  import("@/components/RaceControl/RaceControl").then((m) => ({
    default: m.RaceControlFeed,
  })),
);
const TeamRadioFeed = lazy(() =>
  import("@/components/TeamRadio/TeamRadio").then((m) => ({
    default: m.TeamRadioFeed,
  })),
);
const PitFeed = lazy(() =>
  import("@/components/Pits/PitFeed").then((m) => ({
    default: m.PitFeed,
  })),
);
const OvertakeFeed = lazy(() =>
  import("@/components/Overtakes/OvertakeFeed").then((m) => ({
    default: m.OvertakeFeed,
  })),
);
const KeyMoments = lazy(() =>
  import("@/components/KeyMoments/KeyMoments").then((m) => ({
    default: m.KeyMoments,
  })),
);
const RaceChapters = lazy(() =>
  import("@/components/RaceChapters/RaceChapters").then((m) => ({
    default: m.RaceChapters,
  })),
);

function PanelFallback() {
  return (
    <div className="flex h-full min-h-[120px] items-center justify-center text-[10px] font-bold uppercase tracking-[0.12em] text-muted animate-pulse">
      Loading Panel
    </div>
  );
}

type Props = {
  commentaryTab: CommentaryTab;
  raceControlError: boolean;
  teamRadioError: boolean;
  pitsError: boolean;
  overtakesError: boolean;
  raceControlEntries: RaceControl[];
  teamRadioEntries: TeamRadio[];
  pitEntries: Pit[];
  overtakeEntries: Overtake[];
  drivers: Driver[];
  laps: Lap[];
  positions: Position[];
  incidentWindows: IncidentWindow[];
  sessionKey: number | null;
  sessionYear: number | null;
  sessionTimeMs: number;
  sessionStartMs: number;
  toastEvents: ToastEvent[];
  showAllItems: boolean;
  focusDriver: number | null;
  onClearFocus?: () => void;
  onPlayWindow: (startMs: number, endMs: number) => void;
};

type TimedPositionPoint = {
  ms: number;
  num: number;
  position: number;
};

type RenderContext = Readonly<{
  commentaryTab: CommentaryTab;
  raceControlError: boolean;
  teamRadioError: boolean;
  pitsError: boolean;
  overtakesError: boolean;
  raceControlEntries: RaceControl[];
  teamRadioEntries: TeamRadio[];
  pitEntries: Pit[];
  overtakeEntries: Overtake[];
  drivers: Driver[];
  laps: Lap[];
  sessionKey: number | null;
  sessionYear: number | null;
  sessionTimeMs: number;
  sessionStartMs: number;
  showAllItems: boolean;
  focusDriver: number | null;
  onClearFocus?: () => void;
  keyMoments: KeyMoment[];
  raceChapters: ReturnType<typeof buildRaceChapters>;
  whatChangedSnapshots: ReturnType<typeof computeWhatChanged>;
  onPlayWindow: (startMs: number, endMs: number) => void;
}>;

function collectLeadChangeMoments(
  timedPositions: TimedPositionPoint[],
  drivers: Driver[],
): KeyMoment[] {
  const driverMap = new Map(drivers.map((d) => [d.driver_number, d]));
  const moments: KeyMoment[] = [];
  const p1Events = timedPositions
    .filter((p) => p.position === 1 && p.ms >= 0)
    .map((p) => ({ ms: p.ms, num: p.num }));

  let lastLeader = -1;
  for (const ev of p1Events) {
    if (ev.num === lastLeader) continue;
    if (lastLeader !== -1) {
      const d = driverMap.get(ev.num);
      moments.push({
        ms: ev.ms,
        kind: "lead_change",
        label: `${d?.name_acronym ?? ev.num} takes lead`,
        color: teamColor(d?.team_colour),
      });
    }
    lastLeader = ev.num;
  }

  return moments;
}

function collectFastestLapMoments(
  toastEvents: ToastEvent[],
  drivers: Driver[],
): KeyMoment[] {
  const driverMap = new Map(drivers.map((d) => [d.driver_number, d]));
  const moments: KeyMoment[] = [];

  for (const ev of toastEvents) {
    if (ev.kind !== "fastest_lap") continue;
    const payload = ev.payload as FastestLapPayload;
    const d = driverMap.get(payload.driverNumber);
    const minutes = Math.floor(payload.lapTime / 60);
    const seconds = (payload.lapTime % 60).toFixed(3).padStart(6, "0");
    moments.push({
      ms: ev.ms,
      kind: "fastest_lap",
      label: `Fastest: ${d?.name_acronym ?? payload.driverNumber}`,
      sublabel: minutes > 0 ? `${minutes}:${seconds}` : seconds,
      color: "#9b59f5",
    });
  }

  return moments;
}

function collectRaceControlMoments(
  raceControlEntries: RaceControl[],
  sessionStartMs: number,
): KeyMoment[] {
  const moments: KeyMoment[] = [];
  for (const entry of raceControlEntries) {
    const ms = new Date(entry.date).getTime() - sessionStartMs;
    if (ms < 0) continue;

    const phase = getSafetyControlPhase(entry);
    if (phase === "safety_car_start") {
      moments.push({
        ms,
        kind: "safety_car",
        label: "Safety Car deployed",
        color: "#f5a623",
      });
    }
    if (phase === "safety_car_end") {
      moments.push({
        ms,
        kind: "safety_car",
        label: "Safety Car in this lap",
        color: "#f5a623",
      });
    }
    if (phase === "vsc_start") {
      moments.push({
        ms,
        kind: "vsc",
        label: "Virtual Safety Car",
        color: "#f5a623",
      });
    }
    if (phase === "vsc_end") {
      moments.push({
        ms,
        kind: "vsc",
        label: "VSC ending",
        color: "#f5a623",
      });
    }
    if (entry.flag === "RED") {
      moments.push({
        ms,
        kind: "red_flag",
        label: "Red Flag",
        color: "#e8002d",
      });
    }
  }
  return moments;
}

function buildKeyMoments(
  timedPositions: TimedPositionPoint[],
  toastEvents: ToastEvent[],
  raceControlEntries: RaceControl[],
  drivers: Driver[],
  sessionStartMs: number,
): KeyMoment[] {
  const leadChanges = collectLeadChangeMoments(timedPositions, drivers);
  const fastestLaps = collectFastestLapMoments(toastEvents, drivers);
  const raceControlMoments = collectRaceControlMoments(
    raceControlEntries,
    sessionStartMs,
  );
  return [...leadChanges, ...fastestLaps, ...raceControlMoments].sort(
    (a, b) => a.ms - b.ms,
  );
}

function renderCommentaryTabContent(ctx: RenderContext): ReactNode {
  switch (ctx.commentaryTab) {
    case "rc": {
      if (ctx.raceControlError)
        return <ErrorMessage message="Failed to load race control" />;
      return (
        <Suspense fallback={<PanelFallback />}>
          <RaceControlFeed
            entries={ctx.raceControlEntries}
            sessionKey={ctx.sessionKey}
            sessionTimeMs={ctx.sessionTimeMs}
            sessionStartMs={ctx.sessionStartMs}
            showAllItems={ctx.showAllItems}
            drivers={ctx.drivers}
            focusDriver={ctx.focusDriver}
            onClearFocus={
              ctx.focusDriver !== null ? ctx.onClearFocus : undefined
            }
          />
        </Suspense>
      );
    }
    case "radio": {
      if (ctx.teamRadioError)
        return <ErrorMessage message="Failed to load team radio" />;
      return (
        <Suspense fallback={<PanelFallback />}>
          <TeamRadioFeed
            entries={ctx.teamRadioEntries}
            sessionKey={ctx.sessionKey}
            sessionYear={ctx.sessionYear}
            drivers={ctx.drivers}
            laps={ctx.laps}
            sessionTimeMs={ctx.sessionTimeMs}
            sessionStartMs={ctx.sessionStartMs}
            showAllItems={ctx.showAllItems}
          />
        </Suspense>
      );
    }
    case "pits": {
      if (ctx.pitsError)
        return <ErrorMessage message="Failed to load pit stops" />;
      return (
        <Suspense fallback={<PanelFallback />}>
          <PitFeed
            entries={ctx.pitEntries}
            sessionKey={ctx.sessionKey}
            drivers={ctx.drivers}
            sessionTimeMs={ctx.sessionTimeMs}
            sessionStartMs={ctx.sessionStartMs}
            showAllItems={ctx.showAllItems}
          />
        </Suspense>
      );
    }
    case "passes": {
      if (ctx.overtakesError)
        return <ErrorMessage message="Failed to load overtakes" />;
      return (
        <Suspense fallback={<PanelFallback />}>
          <OvertakeFeed
            entries={ctx.overtakeEntries}
            sessionKey={ctx.sessionKey}
            drivers={ctx.drivers}
            laps={ctx.laps}
            sessionTimeMs={ctx.sessionTimeMs}
            sessionStartMs={ctx.sessionStartMs}
            showAllItems={ctx.showAllItems}
          />
        </Suspense>
      );
    }
    case "moments": {
      return (
        <Suspense fallback={<PanelFallback />}>
          <KeyMoments
            moments={ctx.keyMoments}
            laps={ctx.laps}
            sessionStartMs={ctx.sessionStartMs}
            sessionTimeMs={ctx.sessionTimeMs}
            showAllItems={ctx.showAllItems}
            onJump={(ms) => useTimeline.getState().setT(ms)}
          />
        </Suspense>
      );
    }
    case "chapters": {
      return (
        <Suspense fallback={<PanelFallback />}>
          <RaceChapters
            chapters={ctx.raceChapters}
            snapshots={ctx.whatChangedSnapshots}
            drivers={ctx.drivers}
            laps={ctx.laps}
            sessionStartMs={ctx.sessionStartMs}
            sessionTimeMs={ctx.sessionTimeMs}
            showAllItems={ctx.showAllItems}
            onJump={(ms) => useTimeline.getState().setT(ms)}
            onPlayWindow={ctx.onPlayWindow}
          />
        </Suspense>
      );
    }
    default:
      return null;
  }
}

export function CommentaryPanels({
  commentaryTab,
  raceControlError,
  teamRadioError,
  pitsError,
  overtakesError,
  raceControlEntries,
  teamRadioEntries,
  pitEntries,
  overtakeEntries,
  drivers,
  laps,
  positions,
  incidentWindows,
  sessionKey,
  sessionYear,
  sessionTimeMs,
  sessionStartMs,
  toastEvents,
  showAllItems,
  focusDriver,
  onClearFocus,
  onPlayWindow,
}: Readonly<Props>) {
  const shouldBuildMoments = commentaryTab === "moments";
  const shouldBuildChapters = commentaryTab === "chapters";

  const timedPositions = useMemo<TimedPositionPoint[]>(() => {
    if (!sessionStartMs || !positions.length) return [];
    return positions
      .map((entry) => ({
        ms: new Date(entry.date).getTime() - sessionStartMs,
        num: entry.driver_number,
        position: entry.position,
      }))
      .sort((a, b) => a.ms - b.ms);
  }, [positions, sessionStartMs]);

  const keyMoments = useMemo((): KeyMoment[] => {
    if (!shouldBuildMoments || !sessionStartMs) return [];
    return buildKeyMoments(
      timedPositions,
      toastEvents,
      raceControlEntries,
      drivers,
      sessionStartMs,
    );
  }, [
    shouldBuildMoments,
    sessionStartMs,
    drivers,
    timedPositions,
    toastEvents,
    raceControlEntries,
  ]);

  const chequeredMs = useMemo(() => {
    if (!raceControlEntries.length || !sessionStartMs) return null;
    let lastChequered: number | null = null;
    for (const entry of raceControlEntries) {
      if (entry.flag !== "CHEQUERED") continue;
      lastChequered = new Date(entry.date).getTime() - sessionStartMs;
    }
    return lastChequered;
  }, [raceControlEntries, sessionStartMs]);

  const sessionDurationMs = useMemo(() => {
    if (!sessionStartMs) return 0;
    const marks = [
      ...positions.map(
        (entry) => new Date(entry.date).getTime() - sessionStartMs,
      ),
      ...pitEntries.map(
        (entry) => new Date(entry.date).getTime() - sessionStartMs,
      ),
      ...raceControlEntries.map(
        (entry) => new Date(entry.date).getTime() - sessionStartMs,
      ),
    ].filter((ms) => Number.isFinite(ms) && ms >= 0);
    if (!marks.length) return 0;
    return Math.max(...marks);
  }, [positions, pitEntries, raceControlEntries, sessionStartMs]);

  const raceChapters = useMemo(() => {
    if (!shouldBuildChapters) return [];
    return buildRaceChapters(incidentWindows, sessionDurationMs, chequeredMs);
  }, [incidentWindows, sessionDurationMs, chequeredMs, shouldBuildChapters]);

  const whatChangedSnapshots = useMemo(() => {
    if (!shouldBuildChapters) return [];
    return computeWhatChanged(
      incidentWindows,
      positions,
      pitEntries,
      sessionStartMs,
    );
  }, [
    incidentWindows,
    positions,
    pitEntries,
    sessionStartMs,
    shouldBuildChapters,
  ]);

  return renderCommentaryTabContent({
    commentaryTab,
    raceControlError,
    teamRadioError,
    pitsError,
    overtakesError,
    raceControlEntries,
    teamRadioEntries,
    pitEntries,
    overtakeEntries,
    drivers,
    laps,
    sessionKey,
    sessionYear,
    sessionTimeMs,
    sessionStartMs,
    showAllItems,
    focusDriver,
    onClearFocus,
    keyMoments,
    raceChapters,
    whatChangedSnapshots,
    onPlayWindow,
  });
}
