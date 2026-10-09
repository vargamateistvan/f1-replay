import { lazy, Suspense, useMemo } from "react";
import type { ReactNode } from "react";
import { ErrorMessage } from "@/components/ErrorMessage";
import { useTimeline } from "@/timeline/clock";
import type { ToastEvent } from "@/timeline/events";
import {
  buildRaceChapters,
  computeWhatChanged,
  normalizeRaceControl,
  buildPhaseAtMsLookup,
  toFlagKey,
} from "@/timeline/raceControl";
import type {
  Driver,
  Lap,
  Overtake,
  Pit,
  Position,
  RaceControl,
  Stint,
  TeamRadio,
  Weather,
} from "@/api/types";
import {
  buildKeyMoments,
  type TimedPositionPoint,
} from "@/components/CommentaryPanels/keyMoments";
import type { IncidentWindow } from "@/timeline/raceControl";
import type { KeyMoment } from "@/components/KeyMoments/types";

export type CommentaryTab =
  "rc" | "radio" | "pits" | "passes" | "moments" | "chapters" | "weather";

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
const WeatherHistory = lazy(() =>
  import("@/components/Weather/WeatherHistory").then((m) => ({
    default: m.WeatherHistory,
  })),
);

function PanelFallback() {
  return (
    <div className="flex h-full min-h-[120px] items-center justify-center text-[10px] font-bold uppercase tracking-[0.12em] text-muted">
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
  weatherError: boolean;
  raceControlEntries: RaceControl[];
  teamRadioEntries: TeamRadio[];
  pitEntries: Pit[];
  stints: Stint[];
  overtakeEntries: Overtake[];
  weatherEntries: Weather[];
  drivers: Driver[];
  laps: Lap[];
  positions: Position[];
  incidentWindows: IncidentWindow[];
  sessionKey: number | null;
  sessionYear: number | null;
  sessionType: string | undefined;
  sessionTimeMs: number;
  sessionStartMs: number;
  /** Session-relative lights-out time; races only. */
  raceStartMs?: number | null;
  toastEvents: ToastEvent[];
  showAllItems: boolean;
  focusDriver: number | null;
  onClearFocus?: () => void;
  onPlayWindow: (startMs: number, endMs: number) => void;
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
  stints: Stint[];
  overtakeEntries: Overtake[];
  weatherError: boolean;
  weatherEntries: Weather[];
  drivers: Driver[];
  laps: Lap[];
  sessionKey: number | null;
  sessionYear: number | null;
  sessionType: string | undefined;
  sessionTimeMs: number;
  sessionStartMs: number;
  showAllItems: boolean;
  focusDriver: number | null;
  onClearFocus?: () => void;
  keyMoments: KeyMoment[];
  raceChapters: ReturnType<typeof buildRaceChapters>;
  whatChangedSnapshots: ReturnType<typeof computeWhatChanged>;
  onPlayWindow: (startMs: number, endMs: number) => void;
  phaseLookup: (ms: number) => number | null;
}>;

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
            sessionType={ctx.sessionType}
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
            sessionType={ctx.sessionType}
            drivers={ctx.drivers}
            laps={ctx.laps}
            sessionTimeMs={ctx.sessionTimeMs}
            sessionStartMs={ctx.sessionStartMs}
            showAllItems={ctx.showAllItems}
            phaseLookup={ctx.phaseLookup}
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
            stints={ctx.stints}
            sessionKey={ctx.sessionKey}
            sessionType={ctx.sessionType}
            drivers={ctx.drivers}
            sessionTimeMs={ctx.sessionTimeMs}
            sessionStartMs={ctx.sessionStartMs}
            showAllItems={ctx.showAllItems}
            phaseLookup={ctx.phaseLookup}
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
            sessionType={ctx.sessionType}
            drivers={ctx.drivers}
            laps={ctx.laps}
            sessionTimeMs={ctx.sessionTimeMs}
            sessionStartMs={ctx.sessionStartMs}
            showAllItems={ctx.showAllItems}
            phaseLookup={ctx.phaseLookup}
          />
        </Suspense>
      );
    }
    case "moments": {
      return (
        <Suspense fallback={<PanelFallback />}>
          <KeyMoments
            moments={ctx.keyMoments}
            sessionType={ctx.sessionType}
            laps={ctx.laps}
            sessionStartMs={ctx.sessionStartMs}
            sessionTimeMs={ctx.sessionTimeMs}
            showAllItems={ctx.showAllItems}
            phaseLookup={ctx.phaseLookup}
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
            sessionType={ctx.sessionType}
            drivers={ctx.drivers}
            laps={ctx.laps}
            sessionStartMs={ctx.sessionStartMs}
            sessionTimeMs={ctx.sessionTimeMs}
            showAllItems={ctx.showAllItems}
            phaseLookup={ctx.phaseLookup}
            onJump={(ms) => useTimeline.getState().setT(ms)}
            onPlayWindow={ctx.onPlayWindow}
          />
        </Suspense>
      );
    }
    case "weather": {
      if (ctx.weatherError)
        return <ErrorMessage message="Failed to load weather" />;
      return (
        <Suspense fallback={<PanelFallback />}>
          <WeatherHistory
            entries={ctx.weatherEntries}
            sessionKey={ctx.sessionKey}
            sessionTimeMs={ctx.sessionTimeMs}
            sessionStartMs={ctx.sessionStartMs}
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
  weatherError,
  raceControlEntries,
  teamRadioEntries,
  pitEntries,
  stints,
  overtakeEntries,
  weatherEntries,
  drivers,
  laps,
  positions,
  incidentWindows,
  sessionKey,
  sessionYear,
  sessionType,
  sessionTimeMs,
  sessionStartMs,
  raceStartMs = null,
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
      const flagKey = toFlagKey(entry.flag);
      const message = (entry.message ?? "").toUpperCase();
      if (flagKey !== "CHEQUERED" && !message.includes("CHEQUERED")) {
        continue;
      }
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
    return buildRaceChapters(
      incidentWindows,
      sessionDurationMs,
      chequeredMs,
      raceStartMs,
    );
  }, [
    incidentWindows,
    sessionDurationMs,
    chequeredMs,
    raceStartMs,
    shouldBuildChapters,
  ]);

  const whatChangedSnapshots = useMemo(() => {
    if (!shouldBuildChapters) return [];
    return computeWhatChanged(
      incidentWindows,
      positions,
      pitEntries,
      sessionStartMs,
      laps,
      raceControlEntries,
      sessionType === "Race" || sessionType === "Sprint",
    );
  }, [
    incidentWindows,
    positions,
    pitEntries,
    sessionStartMs,
    laps,
    raceControlEntries,
    sessionType,
    shouldBuildChapters,
  ]);

  const phaseLookup = useMemo(() => {
    if (!sessionStartMs || !raceControlEntries.length) {
      return () => null;
    }
    const normalized = normalizeRaceControl(raceControlEntries, sessionStartMs);
    return buildPhaseAtMsLookup(normalized);
  }, [raceControlEntries, sessionStartMs]);

  return renderCommentaryTabContent({
    commentaryTab,
    raceControlError,
    teamRadioError,
    pitsError,
    overtakesError,
    weatherError,
    raceControlEntries,
    teamRadioEntries,
    pitEntries,
    stints,
    overtakeEntries,
    weatherEntries,
    drivers,
    laps,
    sessionKey,
    sessionYear,
    sessionType,
    sessionTimeMs,
    sessionStartMs,
    showAllItems,
    focusDriver,
    onClearFocus,
    keyMoments,
    raceChapters,
    whatChangedSnapshots,
    onPlayWindow,
    phaseLookup,
  });
}
