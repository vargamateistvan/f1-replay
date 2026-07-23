import { lazy, Suspense, useEffect, useMemo, useRef, useState } from "react";
import { PlaybackBar } from "@/components/PlaybackBar";
import type {
  ActiveTrackFlagState,
  ActiveTrackVehicles,
} from "@/components/TrackMap/TrackMap";
import LiveTiming from "@/components/LiveTiming/LiveTiming";
import { WeatherPanel } from "@/components/Weather/WeatherPanel";
import { QualifyingBanner } from "@/components/QualifyingBanner";
import { StartingLights } from "@/components/StartingLights";
import { SessionInfoBar } from "@/components/SessionInfoBar";
import { ErrorMessage } from "@/components/ErrorMessage";
import { FinalClassificationDialog } from "@/components/FinalClassification";
import {
  useDrivers,
  usePositions,
  useIntervals,
  useStints,
  useLaps,
  useRaceControl,
  useWeather,
  useSessions,
  usePits,
  useTeamRadio,
  useStartingGrid,
  useOvertakes,
  useSessionResult,
} from "@/hooks/useSession";
import { useSearchParams } from "react-router-dom";
import { useTimeline } from "@/timeline/clock";
import { useCoarseTime } from "@/hooks/useCoarseTime";
import { useMediaQuery } from "@/hooks/useMediaQuery";
import { useOpenF1LiveMqtt } from "@/hooks/useOpenF1LiveMqtt";
import {
  chunkIndexFor,
  useLocationChunks,
  locationChunkIndexFor,
} from "@/hooks/useLocationChunks";
import { useAllCarDataWindow } from "@/hooks/useAllCarDataWindow";
import { useNumberParam, useStringParam } from "@/hooks/useSearchParamState";
import { useTimelineUrlSync } from "@/hooks/useTimelineUrlSync";
import { useKeyboardShortcuts } from "@/hooks/useKeyboardShortcuts";
import {
  lapStartTimes,
  pitTimes,
  flagTimes,
  safetyCarTimes,
  overtakeTimes,
  radioTimes,
  buildToastEvents,
} from "@/timeline/events";
import {
  buildRaceControlMarkers,
  buildIncidentWindows,
  clusterRaceControlMarkers,
  deriveTrackFlagState,
  normalizeRaceControl,
  summarizeMarkers,
} from "@/timeline/raceControl";
import { useEventToasts } from "@/hooks/useEventToasts";
import { useCatchupSummary } from "@/hooks/useCatchupSummary";
import { EventToastStack } from "@/components/EventToast/EventToastStack";
import { CatchupSummary } from "@/components/CatchupSummary/CatchupSummary";
import { ResizeHandle } from "@/components/ResizeHandle";
import { isSessionLive } from "@/utils/live";
import { DEFAULT_SESSION_MS } from "@/constants";
import { useSettings } from "@/stores/settings";
import { deriveRetiredDrivers } from "@/utils/retirement";
import { computeBattlingDrivers } from "@/utils/battles";
import { weatherAtSessionTime } from "@/utils/weather";
import { buildKeyMoments } from "@/components/CommentaryPanels/keyMoments";
import {
  getSafetyControlPhase,
  isTrackClearSignal,
} from "@/utils/raceControlFlags";
import {
  isTimedSession,
  isQualiSession,
  detectQualiPhase,
} from "@/utils/session";
import {
  lastAtOrBefore,
  upperBoundByValue,
  windowBoundsByValue,
} from "@/utils/sortedTime";
import { trackEvent } from "@/lib/analytics";
import type { MainView } from "@/components/Nav";
import type {
  Stint,
  CarData,
  Lap,
  RaceControl,
  Overtake,
  TeamRadio,
} from "@/api/types";
import type { CommentaryTab } from "@/components/CommentaryPanels/CommentaryPanels";

// Sub-tab options per view
type TrackerTab = "timing" | "chart" | "gap" | "map" | "strategy";
type CommentaryTimeMode = "elapsed" | "all";

const PANEL = "bg-surface border border-panel";
const PANEL_TITLE =
  "text-[10px] font-bold text-muted px-3 py-2 border-b border-[#38383f] uppercase tracking-[0.12em] border-l-2 border-l-f1red bg-track";
const OVERTAKE_PULSE_MS = 4_000;
const TRACKER_DESKTOP_PANEL_WIDTH_STORAGE_KEY =
  "f1-replay.tracker.desktopPanelWidth";
const TRACKER_DESKTOP_PANEL_MIN_WIDTH = 420;
const TRACKER_DESKTOP_MAP_MIN_WIDTH = 320;

function clamp(value: number, min: number, max: number) {
  return Math.max(min, Math.min(max, value));
}

function defaultTrackerDesktopPanelWidth() {
  if (typeof window === "undefined") return 905;
  return window.innerWidth >= 1024 ? 905 : 745;
}

type TimedRow<T> = { row: T; absMs: number; relMs: number };
type TimedRaceControlSignal = {
  row: RaceControl;
  absMs: number;
  relMs: number;
  phase: ReturnType<typeof getSafetyControlPhase>;
  messageUpper: string;
  clearsTrack: boolean;
};

type TrackVehicleStatePoint = {
  absMs: number;
  safetyCar: boolean;
  vsc: boolean;
  medicalCar: boolean;
};

type CompletedLapPoint = {
  endMs: number;
  lapNumber: number;
};

type ClosedIncidentWindow = ReturnType<typeof buildIncidentWindows>[number] & {
  endMs: number;
};

function isClosedIncidentWindow(
  window: ReturnType<typeof buildIncidentWindows>[number],
): window is ClosedIncidentWindow {
  return window.endMs !== null;
}

const TrackMap = lazy(() =>
  import("@/components/TrackMap/TrackMap").then((m) => ({
    default: m.TrackMap,
  })),
);

const FocusedTelemetry = lazy(() =>
  import("@/components/FocusedTelemetry/FocusedTelemetry").then((m) => ({
    default: m.FocusedTelemetry,
  })),
);
const StrategyBar = lazy(() =>
  import("@/components/Strategy/StrategyBar").then((m) => ({
    default: m.StrategyBar,
  })),
);
const LapChart = lazy(() =>
  import("@/components/LapChart/LapChart").then((m) => ({
    default: m.LapChart,
  })),
);
const GapChart = lazy(() =>
  import("@/components/GapChart/GapChart").then((m) => ({
    default: m.GapChart,
  })),
);
const CommentaryPanels = lazy(() =>
  import("@/components/CommentaryPanels/CommentaryPanels").then((m) => ({
    default: m.CommentaryPanels,
  })),
);

function PanelFallback() {
  return (
    <div className="flex h-full min-h-[120px] items-center justify-center text-[10px] font-bold uppercase tracking-[0.12em] text-muted animate-pulse">
      Loading Panel
    </div>
  );
}

export default function RaceWeekend() {
  const trackerDesktopSplitRef = useRef<HTMLDivElement | null>(null);
  const trackerDesktopDragRef = useRef<{
    startX: number;
    startWidth: number;
  } | null>(null);
  // Session selection is driven by the URL — Nav writes these, we just read them
  const [meetingKey] = useNumberParam("meeting", null);
  const [sessionKey] = useNumberParam("session", null);

  // Main view driven by the Nav's view tab buttons.
  // Clamp to valid values so old `?view=map` deep links fall back gracefully.
  const [view, setView] = useStringParam<MainView>("view", "tracker");
  const VALID_VIEWS: MainView[] = ["leaderboard", "tracker", "commentary"];
  const currentView: MainView = VALID_VIEWS.includes(view as MainView)
    ? (view as MainView)
    : "tracker";

  // Sub-tab state for tracker + commentary views
  const [trackerTab, setTrackerTab] = useStringParam<TrackerTab>(
    "ttab",
    "timing",
  );
  const [commentaryTab, setCommentaryTab] = useStringParam<CommentaryTab>(
    "ctab",
    "rc",
  );
  const [commentaryTimeMode, setCommentaryTimeMode] =
    useStringParam<CommentaryTimeMode>("cmode", "elapsed");
  const activeTrackerTab = trackerTab ?? "timing";
  const [focusDriver] = useNumberParam("focus", null);
  const [compareDriver] = useNumberParam("compare", null);
  const [, setSearchParams] = useSearchParams();
  const isCompactViewport = useMediaQuery("(max-width: 767px)");
  const [isResultsDialogOpen, setIsResultsDialogOpen] = useState(false);
  const [isQualiEliminationsDialogOpen, setIsQualiEliminationsDialogOpen] =
    useState(false);
  const [trackerDesktopPanelWidth, setTrackerDesktopPanelWidth] = useState(
    () => {
      if (typeof window === "undefined") {
        return defaultTrackerDesktopPanelWidth();
      }
      const stored = window.localStorage.getItem(
        TRACKER_DESKTOP_PANEL_WIDTH_STORAGE_KEY,
      );
      const parsed = stored ? Number.parseFloat(stored) : Number.NaN;
      return Number.isFinite(parsed)
        ? parsed
        : defaultTrackerDesktopPanelWidth();
    },
  );
  const [incidentReplayEndMs, setIncidentReplayEndMs] = useState<number | null>(
    null,
  );
  const [incidentReplayHint, setIncidentReplayHint] = useState<string | null>(
    null,
  );

  const sessions = useSessions(meetingKey);

  useEffect(() => {
    if (typeof window === "undefined") return;
    window.localStorage.setItem(
      TRACKER_DESKTOP_PANEL_WIDTH_STORAGE_KEY,
      String(Math.round(trackerDesktopPanelWidth)),
    );
  }, [trackerDesktopPanelWidth]);

  useEffect(() => {
    function clampTrackerDesktopPanelWidth() {
      const splitWidth = trackerDesktopSplitRef.current?.clientWidth ?? 0;
      if (splitWidth <= 0) return;
      const maxWidth = Math.max(
        TRACKER_DESKTOP_PANEL_MIN_WIDTH,
        splitWidth - TRACKER_DESKTOP_MAP_MIN_WIDTH,
      );
      const minWidth = Math.min(TRACKER_DESKTOP_PANEL_MIN_WIDTH, maxWidth);
      setTrackerDesktopPanelWidth((currentWidth) =>
        clamp(currentWidth, minWidth, maxWidth),
      );
    }

    clampTrackerDesktopPanelWidth();
    window.addEventListener("resize", clampTrackerDesktopPanelWidth);
    return () =>
      window.removeEventListener("resize", clampTrackerDesktopPanelWidth);
  }, []);

  useEffect(() => {
    function updateTrackerDesktopPanelWidth(clientX: number) {
      const drag = trackerDesktopDragRef.current;
      const splitWidth = trackerDesktopSplitRef.current?.clientWidth ?? 0;
      if (!drag || splitWidth <= 0) return;
      const maxWidth = Math.max(
        TRACKER_DESKTOP_PANEL_MIN_WIDTH,
        splitWidth - TRACKER_DESKTOP_MAP_MIN_WIDTH,
      );
      const minWidth = Math.min(TRACKER_DESKTOP_PANEL_MIN_WIDTH, maxWidth);
      setTrackerDesktopPanelWidth(
        clamp(drag.startWidth + (clientX - drag.startX), minWidth, maxWidth),
      );
    }

    function stopTrackerDesktopPanelDrag() {
      trackerDesktopDragRef.current = null;
      document.body.style.cursor = "";
      document.body.style.userSelect = "";
    }

    function onMouseMove(event: MouseEvent) {
      updateTrackerDesktopPanelWidth(event.clientX);
    }

    function onTouchMove(event: TouchEvent) {
      if (!trackerDesktopDragRef.current) return;
      const touch = event.touches[0];
      if (!touch) return;
      event.preventDefault();
      updateTrackerDesktopPanelWidth(touch.clientX);
    }

    window.addEventListener("mousemove", onMouseMove);
    window.addEventListener("mouseup", stopTrackerDesktopPanelDrag);
    window.addEventListener("touchmove", onTouchMove, { passive: false });
    window.addEventListener("touchend", stopTrackerDesktopPanelDrag);

    return () => {
      window.removeEventListener("mousemove", onMouseMove);
      window.removeEventListener("mouseup", stopTrackerDesktopPanelDrag);
      window.removeEventListener("touchmove", onTouchMove);
      window.removeEventListener("touchend", stopTrackerDesktopPanelDrag);
    };
  }, []);

  function startTrackerDesktopPanelDrag(clientX: number) {
    trackerDesktopDragRef.current = {
      startX: clientX,
      startWidth: trackerDesktopPanelWidth,
    };
    document.body.style.cursor = "ew-resize";
    document.body.style.userSelect = "none";
  }

  const trackerDesktopResizeHandleProps = {
    onMouseDown(event: { preventDefault: () => void; clientX: number }) {
      event.preventDefault();
      startTrackerDesktopPanelDrag(event.clientX);
    },
    onTouchStart(event: { touches: ArrayLike<{ clientX: number }> }) {
      const touch = event.touches[0];
      if (!touch) return;
      startTrackerDesktopPanelDrag(touch.clientX);
    },
    onDoubleClick() {
      setTrackerDesktopPanelWidth(defaultTrackerDesktopPanelWidth());
    },
  };
  const session = sessions.data?.find((s) => s.session_key === sessionKey);
  const live = isSessionLive(session);
  useOpenF1LiveMqtt(sessionKey, live);

  const drivers = useDrivers(sessionKey);
  const positions = usePositions(sessionKey, live);
  const intervals = useIntervals(sessionKey, live);
  const stints = useStints(sessionKey);
  const laps = useLaps(sessionKey, undefined, live);
  const pits = usePits(sessionKey);
  const grid = useStartingGrid(sessionKey);
  const sessionResult = useSessionResult(sessionKey);
  const overtakes = useOvertakes(sessionKey, live);
  const raceControl = useRaceControl(sessionKey, live);
  const teamRadio = useTeamRadio(sessionKey, live);
  const weather = useWeather(sessionKey, live);

  // Stable selector — won't re-render on every t tick.
  const setSessionStart = useTimeline((s) => s.setSessionStart);
  const setTimelineT = useTimeline((s) => s.setT);
  const setTimelinePlaying = useTimeline((s) => s.setPlaying);
  const playbackSpeed = useTimeline((s) => s.speed);
  // Throttled to ~10 Hz. Step-based panels (LiveTiming, Strategy, Weather, etc.)
  // don't need 60 fps; TrackMap drives its own 60 Hz loop internally.
  const t = useCoarseTime();
  // Coarse time at 2 Hz (500 ms) — for memos that are time-aware but don't need
  // frame-rate updates (lap state, battle detection, etc.)
  const tSlow = useCoarseTime(500);

  const sessionStartMs = session ? new Date(session.date_start).getTime() : 0;
  const sessionEndMs = session ? new Date(session.date_end).getTime() : 0;
  const durationMs = sessionEndMs - sessionStartMs;

  const timedLaps = useMemo((): TimedRow<Lap>[] => {
    if (!sessionStartMs || !laps.data?.length) return [];
    return laps.data
      .filter((lap) => Boolean(lap.date_start))
      .map((lap) => {
        const absMs = new Date(lap.date_start as string).getTime();
        return { row: lap, absMs, relMs: absMs - sessionStartMs };
      })
      .sort((a, b) => a.absMs - b.absMs);
  }, [laps.data, sessionStartMs]);

  const timedRaceControl = useMemo((): TimedRow<RaceControl>[] => {
    if (!sessionStartMs || !raceControl.data?.length) return [];
    return raceControl.data
      .map((entry) => {
        const absMs = new Date(entry.date).getTime();
        return { row: entry, absMs, relMs: absMs - sessionStartMs };
      })
      .sort((a, b) => a.absMs - b.absMs);
  }, [raceControl.data, sessionStartMs]);

  const timedRaceControlSignals = useMemo((): TimedRaceControlSignal[] => {
    if (!timedRaceControl.length) return [];
    return timedRaceControl.map(({ row, absMs, relMs }) => ({
      row,
      absMs,
      relMs,
      phase: getSafetyControlPhase(row),
      messageUpper: (row.message ?? "").toUpperCase(),
      clearsTrack: isTrackClearSignal(row),
    }));
  }, [timedRaceControl]);

  const trackVehicleStateTimeline = useMemo((): TrackVehicleStatePoint[] => {
    if (!timedRaceControlSignals.length) return [];

    let safetyCar = false;
    let vsc = false;
    let medicalCar = false;
    const timeline: TrackVehicleStatePoint[] = [];

    for (const signal of timedRaceControlSignals) {
      const { absMs, phase, messageUpper, clearsTrack } = signal;

      if (clearsTrack) {
        safetyCar = false;
        vsc = false;
        medicalCar = false;
      }

      if (phase === "safety_car_start") {
        safetyCar = true;
        vsc = false;
      } else if (phase === "safety_car_end") {
        safetyCar = false;
      }

      if (phase === "vsc_start") {
        vsc = true;
        safetyCar = false;
      } else if (phase === "vsc_end") {
        vsc = false;
      }

      if (messageUpper.includes("MEDICAL CAR")) {
        if (
          messageUpper.includes("IN THIS LAP") ||
          messageUpper.includes("ENDING") ||
          messageUpper.includes("HAS ENDED") ||
          messageUpper.includes("RETURN") ||
          messageUpper.includes("WITHDRAW")
        ) {
          medicalCar = false;
        } else {
          medicalCar = true;
        }
      }

      timeline.push({ absMs, safetyCar, vsc, medicalCar });
    }

    return timeline;
  }, [timedRaceControlSignals]);

  const timedOvertakes = useMemo((): TimedRow<Overtake>[] => {
    if (!sessionStartMs || !overtakes.data?.length) return [];
    return overtakes.data
      .map((entry) => {
        const absMs = new Date(entry.date).getTime();
        return { row: entry, absMs, relMs: absMs - sessionStartMs };
      })
      .sort((a, b) => a.absMs - b.absMs);
  }, [overtakes.data, sessionStartMs]);

  const timedTeamRadio = useMemo((): TimedRow<TeamRadio>[] => {
    if (!sessionStartMs || !teamRadio.data?.length) return [];
    return teamRadio.data
      .map((entry) => {
        const absMs = new Date(entry.date).getTime();
        return { row: entry, absMs, relMs: absMs - sessionStartMs };
      })
      .sort((a, b) => a.absMs - b.absMs);
  }, [teamRadio.data, sessionStartMs]);

  useEffect(() => {
    if (sessionStartMs) setSessionStart(sessionStartMs);
  }, [sessionStartMs, setSessionStart]);

  useEffect(() => {
    if (incidentReplayEndMs === null) return;
    if (t < incidentReplayEndMs) return;
    setTimelinePlaying(false);
    setIncidentReplayEndMs(null);
  }, [incidentReplayEndMs, setTimelinePlaying, t]);

  useEffect(() => {
    setIncidentReplayEndMs(null);
    setIncidentReplayHint(null);
  }, [sessionKey]);

  useEffect(() => {
    if (!incidentReplayHint) return;
    const id = window.setTimeout(() => setIncidentReplayHint(null), 2200);
    return () => window.clearTimeout(id);
  }, [incidentReplayHint]);

  useTimelineUrlSync(sessionKey, sessionStartMs > 0);

  const isLoadingSessionData =
    sessionKey !== null &&
    (drivers.isPending || positions.isPending || intervals.isPending);
  const isLoadingEventSession =
    meetingKey !== null &&
    (sessionKey === null || sessions.isPending || isLoadingSessionData);

  const locationChunkIdx = locationChunkIndexFor(t);
  const telemetryChunkIdx = chunkIndexFor(t);
  const isMapVisible =
    currentView === "tracker" &&
    (!isCompactViewport || activeTrackerTab === "map");
  const shouldPrefetchMapChunks =
    !isCompactViewport && isMapVisible && playbackSpeed >= 4;
  const shouldTrackToasts = currentView === "tracker";
  const shouldBuildCommentaryMoments = currentView === "commentary";
  const shouldBuildToastEvents =
    shouldTrackToasts || shouldBuildCommentaryMoments;
  const location = useLocationChunks(
    isMapVisible ? sessionKey : null,
    isMapVisible ? sessionStartMs || null : null,
    locationChunkIdx,
    isMapVisible ? t : undefined,
    {
      includeNextChunk: !isCompactViewport,
      prefetchChunks: shouldPrefetchMapChunks,
      playbackSpeed,
    },
  );

  const lapMarks = useMemo(
    () => lapStartTimes(laps.data ?? [], sessionStartMs),
    [laps.data, sessionStartMs],
  );

  const currentLap = useMemo(() => {
    let lap = 0;
    for (let i = 0; i < lapMarks.length; i++) {
      if (lapMarks[i]! <= t) lap = i + 1;
    }
    return lap;
  }, [lapMarks, t]);

  const isRaceSession = useMemo(() => {
    const type = session?.session_type ?? "";
    return type === "Race" || type === "Sprint";
  }, [session?.session_type]);

  // Session-relative ms of lights out = earliest lap-1 start across all drivers.
  const lightsOutMs = useMemo(() => {
    if (!timedLaps.length) return null;
    let min = Infinity;
    for (const { row: l, relMs: ms } of timedLaps) {
      if (l.lap_number !== 1 || !l.date_start) continue;
      if (ms < min) min = ms;
    }
    return min === Infinity ? null : min;
  }, [timedLaps]);
  const pitMarks = useMemo(
    () => pitTimes(pits.data ?? [], sessionStartMs),
    [pits.data, sessionStartMs],
  );
  const flagMarks = useMemo(
    () => flagTimes(raceControl.data ?? [], sessionStartMs),
    [raceControl.data, sessionStartMs],
  );
  const safetyCarMarks = useMemo(
    () => safetyCarTimes(raceControl.data ?? [], sessionStartMs),
    [raceControl.data, sessionStartMs],
  );
  const overtakeMarks = useMemo(
    () => overtakeTimes(overtakes.data ?? [], sessionStartMs),
    [overtakes.data, sessionStartMs],
  );

  const radioMarks = useMemo(
    () => radioTimes(teamRadio.data ?? [], sessionStartMs),
    [teamRadio.data, sessionStartMs],
  );

  const keyMomentMarks = useMemo(() => {
    return [
      ...new Set([...flagMarks, ...pitMarks, ...overtakeMarks, ...radioMarks]),
    ]
      .filter((ms) => ms >= 0)
      .sort((a, b) => a - b);
  }, [flagMarks, pitMarks, overtakeMarks, radioMarks]);

  // ── Race control state markers + incident windows ───────────────────────────
  const normalizedRcEvents = useMemo(
    () => normalizeRaceControl(raceControl.data ?? [], sessionStartMs),
    [raceControl.data, sessionStartMs],
  );

  const raceControlMarkers = useMemo(() => {
    const raw = buildRaceControlMarkers(normalizedRcEvents);
    return clusterRaceControlMarkers(raw);
  }, [normalizedRcEvents]);

  const markerSummary = useMemo(
    () => summarizeMarkers(raceControlMarkers),
    [raceControlMarkers],
  );

  const incidentWindows = useMemo(
    () => buildIncidentWindows(normalizedRcEvents),
    [normalizedRcEvents],
  );

  const closedIncidentWindows = useMemo(
    () => incidentWindows.filter(isClosedIncidentWindow),
    [incidentWindows],
  );

  const chequeredMs = useMemo(() => {
    if (!timedRaceControl.length) return null;
    let lastChequered: number | null = null;
    for (const { row: entry, relMs } of timedRaceControl) {
      if (entry.flag !== "CHEQUERED") continue;
      lastChequered = relMs;
    }
    return lastChequered;
  }, [timedRaceControl]);

  const nextReplayIncident = useMemo(() => {
    const MIN_AHEAD_MS = 250;
    const nextIdx = upperBoundByValue(
      closedIncidentWindows,
      tSlow + MIN_AHEAD_MS,
      (window) => window.startMs,
    );
    return closedIncidentWindows[nextIdx];
  }, [closedIncidentWindows, tSlow]);

  const currentReplayIncident = useMemo(() => {
    const currentWindow = lastAtOrBefore(
      closedIncidentWindows,
      tSlow,
      (window) => window.startMs,
    );
    if (!currentWindow) return undefined;
    return currentWindow.endMs >= tSlow ? currentWindow : undefined;
  }, [closedIncidentWindows, tSlow]);

  const firstReplayIncident = useMemo(
    () => closedIncidentWindows[0],
    [closedIncidentWindows],
  );

  const replayCurrentIncident = () => {
    const chosen = currentReplayIncident;
    if (!chosen || chosen.endMs === null) return;
    setIncidentReplayHint("Replaying current incident");
    setTimelineT(chosen.startMs);
    setIncidentReplayEndMs(chosen.endMs);
    setTimelinePlaying(true);
  };

  const replayNextIncident = () => {
    const chosen = nextReplayIncident ?? firstReplayIncident;
    if (!chosen || chosen.endMs === null) return;
    if (!nextReplayIncident && firstReplayIncident) {
      setIncidentReplayHint("Wrapped to first incident");
    }
    setTimelineT(chosen.startMs);
    setIncidentReplayEndMs(chosen.endMs);
    setTimelinePlaying(true);
  };

  const pulseDrivers = useMemo(() => {
    if (!isMapVisible) return [];
    const { startIndex, endIndex } = windowBoundsByValue(
      timedOvertakes,
      tSlow - OVERTAKE_PULSE_MS,
      tSlow,
      (overtake) => overtake.relMs,
    );
    const out: number[] = [];
    for (let idx = startIndex; idx < endIndex; idx++) {
      const overtake = timedOvertakes[idx];
      if (!overtake) continue;
      out.push(
        overtake.row.overtaking_driver_number,
        overtake.row.overtaken_driver_number,
      );
    }
    return out;
  }, [timedOvertakes, tSlow, isMapVisible]);

  const completedLapsByDriver = useMemo(() => {
    const byDriver = new Map<number, CompletedLapPoint[]>();
    for (const { row: lap, relMs: lapStart } of timedLaps) {
      if (lap.lap_duration === null) continue;
      const endMs = lapStart + lap.lap_duration * 1000;
      let lapsForDriver = byDriver.get(lap.driver_number);
      if (!lapsForDriver) {
        lapsForDriver = [];
        byDriver.set(lap.driver_number, lapsForDriver);
      }
      lapsForDriver.push({ endMs, lapNumber: lap.lap_number });
    }
    for (const lapsForDriver of byDriver.values()) {
      lapsForDriver.sort((a, b) => a.endMs - b.endMs);
    }
    return byDriver;
  }, [timedLaps]);

  // Last completed lap number for the focused driver — used to load heat overlay data.
  // Use the latest lap with a valid duration whose end time is at/before the playhead.
  const focusDriverLap = useMemo(() => {
    if (!isMapVisible) return null;
    if (focusDriver === null) return null;
    return (
      lastAtOrBefore(
        completedLapsByDriver.get(focusDriver) ?? [],
        tSlow,
        (lap) => lap.endMs,
      )?.lapNumber ?? null
    );
  }, [completedLapsByDriver, focusDriver, tSlow, isMapVisible]);

  const compareDriverLap = useMemo(() => {
    if (!isMapVisible) return null;
    if (compareDriver === null) return null;
    return (
      lastAtOrBefore(
        completedLapsByDriver.get(compareDriver) ?? [],
        tSlow,
        (lap) => lap.endMs,
      )?.lapNumber ?? null
    );
  }, [completedLapsByDriver, compareDriver, tSlow, isMapVisible]);

  // Current tyre compound + age per driver at the playhead.
  // Rebuilds when lap/stint data arrives or when the coarse time crosses a lap boundary.
  const activeCompounds = useMemo(() => {
    const result = new Map<
      number,
      { compound: Stint["compound"]; age: number }
    >();
    if (!isMapVisible) return result;
    if (!timedLaps.length || !stints.data?.length) return result;
    const currentLapByDriver = new Map<number, number>();
    for (const { row: lap, relMs: lapRelMs } of timedLaps) {
      if (lapRelMs > tSlow) continue;
      const prev = currentLapByDriver.get(lap.driver_number);
      if (prev === undefined || lap.lap_number > prev)
        currentLapByDriver.set(lap.driver_number, lap.lap_number);
    }
    for (const [driverNum, currentLap] of currentLapByDriver) {
      const stint = stints.data.find(
        (s) =>
          s.driver_number === driverNum &&
          s.lap_start <= currentLap &&
          s.lap_end >= currentLap,
      );
      if (stint)
        result.set(driverNum, {
          compound: stint.compound,
          age: currentLap - stint.lap_start + stint.tyre_age_at_start,
        });
    }
    return result;
  }, [timedLaps, stints.data, tSlow, isMapVisible]);

  // Cars within 1.0 s of the car ahead → highlight DRS battle on the map.
  const battlingDrivers = useMemo(() => {
    if (!isMapVisible) return new Set<number>();
    if (!intervals.data?.length || !sessionStartMs) return new Set<number>();
    return computeBattlingDrivers(intervals.data, sessionStartMs + tSlow, 1.0);
  }, [intervals.data, sessionStartMs, tSlow, isMapVisible]);

  const retiredDrivers = useMemo((): ReadonlySet<number> => {
    if (!isMapVisible) return new Set<number>();
    return deriveRetiredDrivers({
      positions: positions.data ?? [],
      laps: laps.data ?? [],
      raceControl: raceControl.data ?? [],
      currentT: sessionStartMs + tSlow,
      isRaceSession,
    });
  }, [
    positions.data,
    laps.data,
    raceControl.data,
    sessionStartMs,
    tSlow,
    isMapVisible,
    isRaceSession,
  ]);

  // Current session global/sector track flag state at playhead.
  const activeTrackFlagState = useMemo<ActiveTrackFlagState | null>(() => {
    if (!isMapVisible) return null;
    if (!sessionStartMs) return null;
    return deriveTrackFlagState(
      raceControl.data ?? [],
      sessionStartMs,
      sessionStartMs + tSlow,
    );
  }, [raceControl.data, sessionStartMs, tSlow, isMapVisible]);

  const activeTrackVehicles = useMemo<ActiveTrackVehicles | null>(() => {
    if (!isMapVisible) return null;
    if (!sessionStartMs) return null;
    const LIGHTS_SEQUENCE_MS = 5_000;
    const formationLap =
      isRaceSession &&
      lightsOutMs != null &&
      tSlow >= 0 &&
      tSlow < Math.max(0, lightsOutMs - LIGHTS_SEQUENCE_MS);
    const cutoff = sessionStartMs + tSlow;

    const state =
      lastAtOrBefore(
        trackVehicleStateTimeline,
        cutoff,
        (point) => point.absMs,
      ) ?? null;
    const safetyCar = state?.safetyCar ?? false;
    const vsc = state?.vsc ?? false;
    const medicalCar = state?.medicalCar ?? false;

    if (!safetyCar && !vsc && !medicalCar && !formationLap) return null;
    return { safetyCar, vsc, medicalCar, formationLap };
  }, [
    trackVehicleStateTimeline,
    sessionStartMs,
    tSlow,
    isRaceSession,
    lightsOutMs,
    isMapVisible,
  ]);

  const {
    toastsEnabled,
    toastRadio: settingToastRadio,
    toastRadioAutoplay: settingToastRadioAutoplay,
    toastSoundsEnabled,
    toastFlag: settingToastFlag,
    toastOvertake: settingToastOvertake,
    toastPit: settingToastPit,
    toastFastestLap: settingToastFastestLap,
    notificationMaxVisible,
    mapShowCompoundBadges,
    mapShowBattleRings,
    mapShowDriverHud,
    mapShowSectorFlags,
    mapShowSectorBox,
    mapShowTrackControls,
    mapShowCompass,
    mapShowWeather,
    mapShowEnhancedVisuals,
    leaderboardTelemetry,
    timingShowMinisectors,
    trackerTimingTelemetry,
    trackerTimingMobileCarData,
    trackerTimingShowPosition,
    trackerTimingShowDriver,
    trackerTimingShowAlerts,
    trackerTimingShowBestLap,
    trackerTimingShowLastLap,
    trackerTimingShowGap,
    trackerTimingShowInterval,
    trackerTimingShowS1,
    trackerTimingShowS2,
    trackerTimingShowS3,
    trackerTimingShowPosDelta,
    trackerTimingShowTyre,
    trackerTimingShowPit,
    trackerTimingShowLap,
    trackerTimingShowSpeed,
    trackerTimingShowGear,
    trackerTimingShowRpm,
    trackerTimingShowThrBrk,
    trackerTimingShowDrs,
    timingMobileShowPosition,
    timingMobileShowDriver,
    timingMobileShowAlerts,
    timingMobileShowBestLap,
    timingMobileShowLastLap,
    timingMobileShowGap,
    timingMobileShowS1,
    timingMobileShowS2,
    timingMobileShowS3,
    timingMobileShowPosDelta,
    timingMobileShowTyre,
    timingMobileShowPitCount,
    timingMobileShowInterval,
    timingMobileShowLap,
    trackScreenshotPngEnabled,
    defaultSpeed,
    showPlaybackSpeedControls,
    showPlaybackEventChips,
    catchupSummaryEnabled,
    isHelpOpen,
    isOpen: isSettingsOpen,
    openHelp,
  } = useSettings();

  // ── Live car telemetry for the leaderboard (all drivers) ────────────────────
  // Fetched only when the leaderboard view is active AND the setting is on — it's
  // a ~22k-row window per chunk, so we don't pay for it on other views.
  const trackerTimingDesktopTelemetryEnabled =
    trackerTimingTelemetry &&
    (trackerTimingShowSpeed ||
      trackerTimingShowGear ||
      trackerTimingShowRpm ||
      trackerTimingShowThrBrk ||
      trackerTimingShowDrs);
  const trackerTimingTelemetryEnabled =
    (trackerTimingDesktopTelemetryEnabled || trackerTimingMobileCarData) &&
    currentView === "tracker" &&
    (trackerTab ?? "timing") === "timing";
  const telemetryEnabled =
    (leaderboardTelemetry && currentView === "leaderboard") ||
    trackerTimingTelemetryEnabled;
  const allCarData = useAllCarDataWindow(
    sessionKey,
    sessionStartMs,
    telemetryChunkIdx,
    telemetryEnabled,
    {
      includePreviousChunk: false,
      includeNextChunk: false,
    },
  );

  // Group samples per driver, sorted by session-relative ms. Rebuilds only when
  // the fetched window changes (every ~5 min of session time), not every tick.
  const carSamplesByDriver = useMemo(() => {
    const m = new Map<number, { ms: number; d: CarData }[]>();
    if (!sessionStartMs) return m;
    for (const d of allCarData.data) {
      const ms = new Date(d.date).getTime() - sessionStartMs;
      let arr = m.get(d.driver_number);
      if (!arr) {
        arr = [];
        m.set(d.driver_number, arr);
      }
      arr.push({ ms, d });
    }
    for (const arr of m.values()) arr.sort((a, b) => a.ms - b.ms);
    return m;
  }, [allCarData.data, sessionStartMs]);

  // Latest car-data sample per driver at the playhead (binary search per driver).
  const carDataAtT = useMemo((): ReadonlyMap<number, CarData> => {
    const m = new Map<number, CarData>();
    for (const [num, arr] of carSamplesByDriver) {
      const s = lastAtOrBefore(arr, tSlow, (sample) => sample.ms)?.d;
      if (s) m.set(num, s);
    }
    return m;
  }, [carSamplesByDriver, tSlow]);

  // Latest weather sample at or before the playhead.
  const weatherAtT = useMemo(() => {
    return weatherAtSessionTime(weather.data ?? [], sessionStartMs, t);
  }, [weather.data, sessionStartMs, t]);

  // Apply default speed when a new session loads.
  useEffect(() => {
    if (!sessionKey) return;
    useTimeline.getState().setSpeed(defaultSpeed);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [sessionKey]);

  const toastEvents = useMemo(() => {
    if (!shouldBuildToastEvents || !sessionStartMs) return [];
    return buildToastEvents(
      teamRadio.data ?? [],
      raceControl.data ?? [],
      overtakes.data ?? [],
      pits.data ?? [],
      sessionStartMs,
      laps.data ?? [],
    );
  }, [
    teamRadio.data,
    raceControl.data,
    overtakes.data,
    pits.data,
    sessionStartMs,
    laps.data,
    shouldBuildToastEvents,
  ]);

  const filteredToastEvents = useMemo(() => {
    if (!shouldTrackToasts || !toastsEnabled) return [];
    return toastEvents.filter((ev) => {
      if (ev.kind === "radio") return settingToastRadio;
      if (
        ev.kind === "flag" ||
        ev.kind === "investigation" ||
        ev.kind === "penalty"
      )
        return settingToastFlag;
      if (ev.kind === "overtake") return settingToastOvertake;
      if (ev.kind === "pit") return settingToastPit;
      if (ev.kind === "fastest_lap") return settingToastFastestLap;
      return true;
    });
  }, [
    toastEvents,
    shouldTrackToasts,
    toastsEnabled,
    settingToastRadio,
    settingToastFlag,
    settingToastOvertake,
    settingToastPit,
    settingToastFastestLap,
  ]);

  const { toasts, dismiss } = useEventToasts(filteredToastEvents, t);
  const { summary: catchupSummary, dismiss: dismissCatchup } =
    useCatchupSummary(filteredToastEvents, t);

  const effectiveDuration = durationMs || DEFAULT_SESSION_MS;

  // Calculate extended duration to include post-race laps and radios (outlap + post-race comms)
  const postRaceDurationMs = useMemo(() => {
    if (!isRaceSession || chequeredMs === null || !sessionStartMs) return null;

    let latestMs = chequeredMs;

    // Check for post-race laps (outlaps)
    if (timedLaps.length) {
      for (const { row: lap, relMs: lapStartMs } of timedLaps) {
        if (lap.date_start && lap.lap_duration && lap.lap_duration > 0) {
          const lapEndMs = lapStartMs + lap.lap_duration * 1000;
          if (lapEndMs > chequeredMs) {
            latestMs = Math.max(latestMs, lapEndMs);
          }
        }
      }
    }

    // Check for post-race radio messages
    if (timedTeamRadio.length) {
      for (const { relMs: radioMs } of timedTeamRadio) {
        if (radioMs > chequeredMs) {
          latestMs = Math.max(latestMs, radioMs);
        }
      }
    }

    return latestMs > chequeredMs ? latestMs : null;
  }, [isRaceSession, chequeredMs, sessionStartMs, timedLaps, timedTeamRadio]);

  const playbackDurationMs: number =
    isRaceSession && chequeredMs !== null && postRaceDurationMs !== null
      ? postRaceDurationMs
      : isRaceSession && chequeredMs !== null
        ? chequeredMs
        : effectiveDuration;
  const finalClassificationTriggerMs: number | null =
    chequeredMs ?? (durationMs > 0 ? durationMs : null);
  const showFinalClassification =
    finalClassificationTriggerMs === null
      ? false
      : t >= finalClassificationTriggerMs &&
        (sessionResult.data?.length ?? 0) > 0;
  const totalLapCount = useMemo(() => {
    if (!isRaceSession) return null;

    const observedLapCount = Math.max(
      0,
      ...(laps.data ?? []).map((lap) => lap.lap_number),
    );
    const classifiedLapCount = Math.max(
      0,
      ...(sessionResult.data ?? []).map((result) => result.number_of_laps ?? 0),
    );
    const total = Math.max(observedLapCount, classifiedLapCount);

    return total > 0 ? total : null;
  }, [isRaceSession, laps.data, sessionResult.data]);

  const commentaryLapLabel = useMemo(() => {
    if (currentLap <= 0) return "—";
    if (totalLapCount === null) return String(currentLap);
    return `${currentLap}/${totalLapCount}`;
  }, [currentLap, totalLapCount]);

  const commentaryTimedPositions = useMemo(() => {
    if (!sessionStartMs || !positions.data?.length) return [];
    return positions.data
      .map((entry) => ({
        ms: new Date(entry.date).getTime() - sessionStartMs,
        num: entry.driver_number,
        position: entry.position,
      }))
      .sort((a, b) => a.ms - b.ms);
  }, [positions.data, sessionStartMs]);

  const commentaryKeyMoments = useMemo(() => {
    if (!sessionStartMs) return [];
    return buildKeyMoments(
      commentaryTimedPositions,
      toastEvents,
      raceControl.data ?? [],
      drivers.data ?? [],
      sessionStartMs,
    );
  }, [
    commentaryTimedPositions,
    toastEvents,
    raceControl.data,
    drivers.data,
    sessionStartMs,
  ]);

  const commentaryKeyMomentsCount = useMemo(() => {
    if (commentaryTimeMode === "all") return commentaryKeyMoments.length;
    return commentaryKeyMoments.filter((moment) => moment.ms <= t).length;
  }, [commentaryKeyMoments, commentaryTimeMode, t]);

  const commentaryTabs = useMemo(
    () =>
      [
        ["rc", "Race Control", "RC", raceControl.data?.length ?? 0, "entries"],
        ["radio", "Team Radio", "Radio", teamRadio.data?.length ?? 0, "clips"],
        ["pits", "Pit Stops", "Pits", pits.data?.length ?? 0, "stops"],
        ["passes", "Overtakes", "Passes", overtakes.data?.length ?? 0, "moves"],
        [
          "moments",
          "Key Moments",
          "Moments",
          commentaryKeyMomentsCount,
          "beats",
        ],
        ["chapters", "Chapters", "Chptrs", incidentWindows.length, "windows"],
      ] as const,
    [
      commentaryKeyMomentsCount,
      incidentWindows.length,
      overtakes.data?.length,
      pits.data?.length,
      raceControl.data?.length,
      teamRadio.data?.length,
    ],
  );

  // ── Session countdown (practice / qualifying) ────────────────────────────
  const sessionName = session?.session_name ?? "";
  const countdownMs =
    isTimedSession(sessionName) && effectiveDuration > 0
      ? Math.max(0, effectiveDuration - t)
      : null;
  const qualiPhase = isQualiSession(sessionName)
    ? detectQualiPhase(raceControl.data ?? [], sessionStartMs, t)
    : null;

  const qualiPhaseStartTimes = useMemo(() => {
    if (!sessionStartMs || !isQualiSession(sessionName)) {
      return {
        q2StartMs: null as number | null,
        q3StartMs: null as number | null,
      };
    }

    let q2StartMs: number | null = null;
    let q3StartMs: number | null = null;
    for (const { row: entry, relMs } of timedRaceControl) {
      const msg = (entry.message ?? "").toUpperCase();
      if (q2StartMs === null && /\bQ2\b/.test(msg)) q2StartMs = relMs;
      if (q3StartMs === null && /\bQ3\b/.test(msg)) q3StartMs = relMs;
      if (q2StartMs !== null && q3StartMs !== null) break;
    }

    return { q2StartMs, q3StartMs };
  }, [timedRaceControl, sessionName, sessionStartMs]);

  useEffect(() => {
    if (!showFinalClassification) {
      setIsResultsDialogOpen(false);
      return;
    }
    if (!sessionResult.isError) {
      setIsResultsDialogOpen(true);
    }
  }, [showFinalClassification, sessionResult.isError]);

  useEffect(() => {
    if (!isQualiSession(sessionName) || !qualiPhase) {
      setIsQualiEliminationsDialogOpen(false);
    }
  }, [qualiPhase, sessionName]);

  useKeyboardShortcuts({
    lapStarts: lapMarks,
    eventTimes: keyMomentMarks,
    durationMs: playbackDurationMs,
    setView,
    isModalOpen: isHelpOpen || isSettingsOpen,
    onOpenHelp: openHelp,
    enabled: sessionKey !== null,
  });

  function setFocusSelection(
    focus: number | null,
    compare: number | null,
    source: string = "unknown",
  ) {
    trackEvent("raceweekend_focus_changed", {
      focus_driver: focus ?? -1,
      compare_driver: compare ?? -1,
      source,
    });
    setSearchParams(
      (prev) => {
        const next = new URLSearchParams(prev);
        if (focus === null || Number.isNaN(focus)) next.delete("focus");
        else next.set("focus", String(focus));
        if (compare === null || Number.isNaN(compare)) next.delete("compare");
        else next.set("compare", String(compare));
        return next;
      },
      { replace: true },
    );
  }

  const toggleFocus = (num: number) => {
    if (focusDriver === null) {
      setFocusSelection(num, null, "select_initial");
      return;
    }
    if (focusDriver === num) {
      setFocusSelection(null, null, "deselect_same");
      return;
    }
    // Clicking a different driver should move focus to that driver immediately.
    // This keeps row/map interactions predictable (focus follows click).
    setFocusSelection(num, null, "switch_focus");
  };

  const clearFocusSelection = () => {
    setFocusSelection(null, null, "clear_focus");
  };

  const showTrackerInlinePlayback = false;

  // ── Shared sub-components ────────────────────────────────────────────────────

  const timingTower = (
    <LiveTiming
      drivers={drivers.data ?? []}
      positions={positions.data ?? []}
      intervals={intervals.data ?? []}
      pits={pits.data ?? []}
      laps={laps.data ?? []}
      raceControl={raceControl.data ?? []}
      stints={stints.data ?? []}
      grid={grid.data ?? []}
      sessionName={session?.session_name}
      sessionTimeMs={t}
      sessionStartMs={sessionStartMs}
      isLoading={positions.isPending && sessionKey !== null}
      totalLapCount={totalLapCount}
      selectedDriver={focusDriver}
      compareDriver={compareDriver}
      onSelectDriver={toggleFocus}
      carData={trackerTimingTelemetryEnabled ? carDataAtT : undefined}
      showMinisectors={timingShowMinisectors}
      showDenseMobileTelemetry={trackerTimingMobileCarData}
      showMobilePositionColumn={timingMobileShowPosition}
      showMobileDriverColumn={timingMobileShowDriver}
      showMobileAlertsColumn={timingMobileShowAlerts}
      showMobileBestLapColumn={timingMobileShowBestLap}
      showMobileLastLapColumn={timingMobileShowLastLap}
      showMobileGapColumn={timingMobileShowGap}
      showMobileS1Column={timingMobileShowS1}
      showMobileS2Column={timingMobileShowS2}
      showMobileS3Column={timingMobileShowS3}
      showMobilePosDeltaColumn={timingMobileShowPosDelta}
      showMobileTyreColumn={timingMobileShowTyre}
      showMobilePitCountColumn={timingMobileShowPitCount}
      showIntervalColumn={trackerTimingShowInterval}
      showMobileIntervalColumn={timingMobileShowInterval}
      showMobileCurrentLapColumn={timingMobileShowLap}
      showMobileSectorsColumns={
        timingMobileShowS1 || timingMobileShowS2 || timingMobileShowS3
      }
      columnVisibility={{
        position: trackerTimingShowPosition,
        driver: trackerTimingShowDriver,
        alerts: trackerTimingShowAlerts,
        bestLap: trackerTimingShowBestLap,
        lastLap: trackerTimingShowLastLap,
        gap: trackerTimingShowGap,
        interval: trackerTimingShowInterval,
        s1: trackerTimingShowS1,
        s2: trackerTimingShowS2,
        s3: trackerTimingShowS3,
        posDelta: trackerTimingShowPosDelta,
        tyre: trackerTimingShowTyre,
        pit: trackerTimingShowPit,
        currentLap: trackerTimingShowLap,
        speed: trackerTimingShowSpeed,
        gear: trackerTimingShowGear,
        rpm: trackerTimingShowRpm,
        thrBrk: trackerTimingShowThrBrk,
        drs: trackerTimingShowDrs,
      }}
      compactDriverColumn
      dense
      chequeredMs={chequeredMs}
    />
  );

  // Leaderboard view gets the same tower plus live car-data columns.
  const leaderboardTower = (
    <LiveTiming
      drivers={drivers.data ?? []}
      positions={positions.data ?? []}
      intervals={intervals.data ?? []}
      pits={pits.data ?? []}
      laps={laps.data ?? []}
      raceControl={raceControl.data ?? []}
      stints={stints.data ?? []}
      grid={grid.data ?? []}
      sessionName={session?.session_name}
      sessionTimeMs={t}
      sessionStartMs={sessionStartMs}
      isLoading={positions.isPending && sessionKey !== null}
      totalLapCount={totalLapCount}
      selectedDriver={focusDriver}
      compareDriver={compareDriver}
      onSelectDriver={toggleFocus}
      carData={telemetryEnabled ? carDataAtT : undefined}
      showMinisectors={timingShowMinisectors}
      showIntervalColumn
      showFullLastName
      showMobilePositionColumn={timingMobileShowPosition}
      showMobileDriverColumn={timingMobileShowDriver}
      showMobileAlertsColumn={timingMobileShowAlerts}
      showMobileBestLapColumn={timingMobileShowBestLap}
      showMobileLastLapColumn={timingMobileShowLastLap}
      showMobileGapColumn={timingMobileShowGap}
      showMobileS1Column={timingMobileShowS1}
      showMobileS2Column={timingMobileShowS2}
      showMobileS3Column={timingMobileShowS3}
      showMobilePosDeltaColumn={timingMobileShowPosDelta}
      showMobileTyreColumn={timingMobileShowTyre}
      showMobilePitCountColumn={timingMobileShowPitCount}
      showMobileIntervalColumn={timingMobileShowInterval}
      showMobileCurrentLapColumn={timingMobileShowLap}
      showMobileSectorsColumns={
        timingMobileShowS1 || timingMobileShowS2 || timingMobileShowS3
      }
      wideSectors
      dense
      fullWidthTable
      chequeredMs={chequeredMs}
    />
  );

  const trackMap = (
    <TrackMap
      sessionKey={sessionKey}
      drivers={drivers.data ?? []}
      locationData={location.data}
      sessionStartMs={sessionStartMs}
      focusDriver={focusDriver}
      pulseDrivers={pulseDrivers}
      circuitShortName={session?.circuit_short_name}
      circuitKey={session?.circuit_key ?? null}
      year={session?.year ?? null}
      activeCompounds={mapShowCompoundBadges ? activeCompounds : undefined}
      battlingDrivers={mapShowBattleRings ? battlingDrivers : undefined}
      focusDriverLap={focusDriverLap}
      showFocusedHud={mapShowDriverHud}
      activeTrackFlagState={mapShowSectorFlags ? activeTrackFlagState : null}
      showSectorBox={mapShowSectorBox}
      showTrackControls={mapShowTrackControls}
      showCompass={mapShowCompass}
      showTrackScreenshot={trackScreenshotPngEnabled}
      showEnhancedVisuals={mapShowEnhancedVisuals}
      weatherOverlay={mapShowWeather ? weatherAtT : null}
      activeTrackVehicles={activeTrackVehicles}
      retiredDrivers={retiredDrivers}
      onSelectDriver={toggleFocus}
    />
  );

  // ── View layouts ─────────────────────────────────────────────────────────────

  return (
    <div className="relative flex flex-col overflow-x-hidden pb-[calc(7.5rem+env(safe-area-inset-bottom))] md:h-full md:min-h-0 md:flex-1 md:overflow-hidden md:pb-0">
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

      {/* Starting lights — absolute overlay, race sessions only */}
      {sessionStartMs > 0 && isRaceSession && lightsOutMs != null && (
        <StartingLights t={t} lightsOutMs={lightsOutMs} />
      )}

      {/* ── LEADERBOARD VIEW ──────────────────────────────────────────── */}
      {currentView === "leaderboard" && (
        <div className="flex flex-col md:flex-1 md:min-h-0 md:overflow-hidden">
          <SessionInfoBar
            laps={laps.data ?? []}
            raceControl={raceControl.data ?? []}
            sessionTimeMs={t}
            sessionStartMs={sessionStartMs}
            qualiPhase={qualiPhase}
            countdownMs={countdownMs}
            airTemp={weatherAtT?.air_temperature ?? null}
            trackTemp={weatherAtT?.track_temperature ?? null}
            isRaceSession={isRaceSession}
            lightsOutMs={lightsOutMs}
            totalLapCount={totalLapCount}
            onShowEliminations={
              isQualiSession(sessionName) && qualiPhase
                ? () => setIsQualiEliminationsDialogOpen(true)
                : undefined
            }
            onShowResults={
              showFinalClassification && !sessionResult.isError
                ? () => setIsResultsDialogOpen(true)
                : undefined
            }
            onJumpToSessionTime={(sessionTimeMs) => setTimelineT(sessionTimeMs)}
          />

          {/* Loading indicator */}
          {isLoadingSessionData && (
            <div className="border-b border-panel bg-track px-3 py-2 sm:px-4">
              <div className="rounded-sm border border-panel bg-surface px-3 py-2">
                <div className="text-f1red text-[10px] font-black uppercase tracking-[0.14em] animate-pulse">
                  Loading session data
                </div>
                <div className="mt-1 text-xs text-muted">
                  Preparing timing and event feeds for this session.
                </div>
              </div>
            </div>
          )}

          <div className="flex flex-col md:flex-1 md:min-h-0 md:overflow-hidden">
            {positions.isError ? (
              <ErrorMessage message="Failed to load timing data" />
            ) : (
              leaderboardTower
            )}
          </div>
        </div>
      )}

      {/* ── DRIVER TRACKER VIEW ───────────────────────────────────────── */}
      {currentView === "tracker" && (
        <div className="flex flex-col md:flex-1 md:min-h-0 md:overflow-hidden">
          <SessionInfoBar
            laps={laps.data ?? []}
            raceControl={raceControl.data ?? []}
            sessionTimeMs={t}
            sessionStartMs={sessionStartMs}
            qualiPhase={qualiPhase}
            countdownMs={countdownMs}
            airTemp={weatherAtT?.air_temperature ?? null}
            trackTemp={weatherAtT?.track_temperature ?? null}
            isRaceSession={isRaceSession}
            lightsOutMs={lightsOutMs}
            totalLapCount={totalLapCount}
            onShowEliminations={
              isQualiSession(sessionName) && qualiPhase
                ? () => setIsQualiEliminationsDialogOpen(true)
                : undefined
            }
            onShowResults={
              showFinalClassification && !sessionResult.isError
                ? () => setIsResultsDialogOpen(true)
                : undefined
            }
            onJumpToSessionTime={(sessionTimeMs) => setTimelineT(sessionTimeMs)}
          />
          <div className="flex flex-col md:flex-1 md:min-h-0 md:overflow-hidden relative">
            {/* Toast overlay — covers both mobile and desktop tracker content */}
            {(trackerTab ?? "timing") !== "map" && (
              <EventToastStack
                toasts={toasts}
                drivers={drivers.data ?? []}
                onDismiss={dismiss}
                radioAutoplay={settingToastRadioAutoplay}
                soundsEnabled={toastSoundsEnabled}
                maxVisible={notificationMaxVisible}
                layout="overlay"
              />
            )}

            {/* Phone layout: tab-switched (md:hidden) */}
            <div className="md:hidden flex flex-col w-full">
              {/* Tab chips */}
              <div className="sticky top-0 z-20 grid grid-cols-5 w-full border-b border-panel shrink-0 bg-track/95 backdrop-blur">
                {(
                  [
                    ["timing", "Timing"],
                    ["map", "Track"],
                    ["strategy", "Tyre Strategy"],
                    ["chart", "Chart"],
                    ["gap", "Gap"],
                  ] as [TrackerTab, string][]
                ).map(([tab, label]) => (
                  <button
                    key={tab}
                    onClick={() => {
                      trackEvent("raceweekend_tracker_tab_changed", {
                        tab,
                        source: "mobile",
                      });
                      setTrackerTab(tab);
                    }}
                    className={`w-full px-1.5 py-2 text-[10px] font-bold uppercase tracking-wider border-b-2 -mb-px transition-colors ${
                      (trackerTab ?? "timing") === tab
                        ? "text-white border-f1red bg-surface"
                        : "text-muted border-transparent hover:text-white"
                    }`}
                  >
                    {label}
                  </button>
                ))}
              </div>

              {showTrackerInlinePlayback && (
                <PlaybackBar
                  durationMs={playbackDurationMs}
                  lapStarts={lapMarks}
                  pitTimes={pitMarks}
                  flagTimes={flagMarks}
                  safetyCarTimes={safetyCarMarks}
                  overtakeTimes={overtakeMarks}
                  radioTimes={radioMarks}
                  raceControlMarkers={raceControlMarkers}
                  markerSummary={markerSummary}
                  canReplayCurrentIncident={currentReplayIncident !== undefined}
                  onReplayCurrentIncident={replayCurrentIncident}
                  canReplayNextIncident={
                    nextReplayIncident !== undefined ||
                    firstReplayIncident !== undefined
                  }
                  onReplayNextIncident={replayNextIncident}
                  incidentReplayHint={incidentReplayHint}
                  countdownMs={countdownMs}
                  qualiPhase={qualiPhase}
                  q2StartMs={qualiPhaseStartTimes.q2StartMs}
                  q3StartMs={qualiPhaseStartTimes.q3StartMs}
                  mobileInline
                  showSpeedControls={showPlaybackSpeedControls}
                  showEventChips={showPlaybackEventChips}
                />
              )}

              {/* Tab content */}
              <div className="flex flex-col md:flex-1 md:min-h-0 md:overflow-hidden">
                {(trackerTab ?? "timing") === "timing" && (
                  <>
                    {/* Timing tower */}
                    <div className="flex flex-col md:flex-1 md:min-h-0 md:overflow-hidden">
                      {positions.isError ? (
                        <ErrorMessage message="Failed to load timing data" />
                      ) : (
                        timingTower
                      )}
                    </div>
                    {/* Focused telemetry */}
                    {focusDriver !== null && (
                      <div className="shrink-0 border-t border-panel">
                        <Suspense fallback={<PanelFallback />}>
                          <FocusedTelemetry
                            sessionKey={sessionKey}
                            driver={
                              drivers.data?.find(
                                (d) => d.driver_number === focusDriver,
                              ) ?? null
                            }
                            compareDriver={
                              drivers.data?.find(
                                (d) => d.driver_number === compareDriver,
                              ) ?? null
                            }
                            sessionStartMs={sessionStartMs}
                            driverLap={focusDriverLap}
                            compareDriverLap={compareDriverLap}
                            onClear={clearFocusSelection}
                            onClearCompare={() =>
                              setFocusSelection(focusDriver, null)
                            }
                          />
                        </Suspense>
                      </div>
                    )}
                  </>
                )}

                {(trackerTab ?? "timing") === "map" && (
                  <div className="min-h-[80vw] bg-[#10101a] flex flex-col md:flex-1 md:min-w-0">
                    {mapShowWeather && (
                      <div className="shrink-0 border-b border-panel">
                        {weather.isError ? (
                          <ErrorMessage
                            message="Failed to load weather"
                            compact
                          />
                        ) : (
                          <WeatherPanel
                            entries={weather.data ?? []}
                            sessionKey={sessionKey}
                            sessionTimeMs={t}
                            sessionStartMs={sessionStartMs}
                          />
                        )}
                      </div>
                    )}
                    <div className="relative flex-1 min-h-[64vw]">
                      <EventToastStack
                        toasts={toasts}
                        drivers={drivers.data ?? []}
                        onDismiss={dismiss}
                        radioAutoplay={settingToastRadioAutoplay}
                        soundsEnabled={toastSoundsEnabled}
                        maxVisible={notificationMaxVisible}
                        layout="overlay"
                      />
                      {drivers.isError ? (
                        <ErrorMessage message="Failed to load driver data" />
                      ) : (
                        <Suspense fallback={<PanelFallback />}>
                          {trackMap}
                        </Suspense>
                      )}
                      {isLoadingSessionData && (
                        <span className="absolute top-2 right-2 text-f1red text-[10px] animate-pulse">
                          Loading…
                        </span>
                      )}
                    </div>
                  </div>
                )}

                {(trackerTab ?? "timing") === "strategy" && (
                  <div
                    className={`${PANEL} flex-1 flex flex-col overflow-hidden border-0`}
                  >
                    <div className={`${PANEL_TITLE} shrink-0`}>
                      Tyre Strategy
                    </div>
                    <div className="min-h-0 overflow-y-auto md:panel-scroll [-webkit-overflow-scrolling:touch]">
                      <Suspense fallback={<PanelFallback />}>
                        <StrategyBar
                          stints={stints.data ?? []}
                          drivers={drivers.data ?? []}
                          laps={laps.data ?? []}
                          pits={pits.data ?? []}
                          sessionTimeMs={t}
                          sessionStartMs={sessionStartMs}
                          currentLap={currentLap}
                        />
                      </Suspense>
                    </div>
                  </div>
                )}

                {(trackerTab ?? "timing") === "chart" && (
                  <div className="h-[52vh] min-h-[280px] bg-[#10101a]">
                    <Suspense fallback={<PanelFallback />}>
                      <LapChart
                        drivers={drivers.data ?? []}
                        positions={positions.data ?? []}
                        lapStarts={lapMarks}
                        sessionStartMs={sessionStartMs}
                        sessionTimeMs={t}
                        currentLap={currentLap}
                      />
                    </Suspense>
                  </div>
                )}

                {(trackerTab ?? "timing") === "gap" && (
                  <div className="h-[52vh] min-h-[280px] bg-[#10101a]">
                    <Suspense fallback={<PanelFallback />}>
                      <GapChart
                        drivers={drivers.data ?? []}
                        intervals={intervals.data ?? []}
                        lapStarts={lapMarks}
                        currentLap={currentLap}
                        sessionStartMs={sessionStartMs}
                        sessionTimeMs={t}
                      />
                    </Suspense>
                  </div>
                )}
              </div>
            </div>

            {/* Desktop layout: split panel (hidden md:flex) */}
            <div
              ref={trackerDesktopSplitRef}
              className="hidden md:flex flex-1 min-h-0 overflow-hidden"
            >
              {/* Left data panel */}
              <div
                className="shrink-0 flex flex-col border-r border-panel overflow-hidden"
                style={{ width: `${trackerDesktopPanelWidth}px` }}
              >
                {/* Sub-tabs */}
                <div className="flex border-b border-panel shrink-0">
                  {(
                    [
                      ["timing", "Timing"],
                      ["strategy", "Tyre Strategy"],
                      ["chart", "Laps"],
                      ["gap", "Gap"],
                    ] as [TrackerTab, string][]
                  ).map(([tab, label]) => (
                    <button
                      key={tab}
                      onClick={() => {
                        trackEvent("raceweekend_tracker_tab_changed", {
                          tab,
                          source: "desktop",
                        });
                        setTrackerTab(tab);
                      }}
                      className={`flex-1 px-2 py-1 text-[10px] font-bold uppercase tracking-wider transition-colors ${
                        (trackerTab ?? "timing") === tab
                          ? "text-white border-b-2 border-f1red -mb-px bg-surface"
                          : "text-muted hover:text-white bg-track"
                      }`}
                    >
                      {label}
                    </button>
                  ))}
                </div>

                {/* Panel content */}
                <div className="flex-1 min-h-0 flex flex-col overflow-hidden">
                  {(trackerTab ?? "timing") === "timing" &&
                    (positions.isError ? (
                      <ErrorMessage message="Failed to load timing data" />
                    ) : (
                      timingTower
                    ))}
                  {(trackerTab ?? "timing") === "strategy" && (
                    <div
                      className={`${PANEL} flex-1 flex flex-col overflow-hidden border-0`}
                    >
                      <div className={`${PANEL_TITLE} shrink-0`}>
                        Tyre Strategy
                      </div>
                      <div className="min-h-0 overflow-y-auto md:panel-scroll [-webkit-overflow-scrolling:touch]">
                        <Suspense fallback={<PanelFallback />}>
                          <StrategyBar
                            stints={stints.data ?? []}
                            drivers={drivers.data ?? []}
                            laps={laps.data ?? []}
                            pits={pits.data ?? []}
                            sessionTimeMs={t}
                            sessionStartMs={sessionStartMs}
                            currentLap={currentLap}
                          />
                        </Suspense>
                      </div>
                    </div>
                  )}
                  {(trackerTab ?? "timing") === "chart" && (
                    <Suspense fallback={<PanelFallback />}>
                      <LapChart
                        drivers={drivers.data ?? []}
                        positions={positions.data ?? []}
                        lapStarts={lapMarks}
                        sessionStartMs={sessionStartMs}
                        sessionTimeMs={t}
                        currentLap={currentLap}
                      />
                    </Suspense>
                  )}
                  {(trackerTab ?? "timing") === "gap" && (
                    <Suspense fallback={<PanelFallback />}>
                      <GapChart
                        drivers={drivers.data ?? []}
                        intervals={intervals.data ?? []}
                        lapStarts={lapMarks}
                        currentLap={currentLap}
                        sessionStartMs={sessionStartMs}
                        sessionTimeMs={t}
                      />
                    </Suspense>
                  )}
                </div>

                {/* Focused driver telemetry */}
                {focusDriver !== null && (
                  <div className="shrink-0 border-t border-panel">
                    <Suspense fallback={<PanelFallback />}>
                      <FocusedTelemetry
                        sessionKey={sessionKey}
                        driver={
                          drivers.data?.find(
                            (d) => d.driver_number === focusDriver,
                          ) ?? null
                        }
                        compareDriver={
                          drivers.data?.find(
                            (d) => d.driver_number === compareDriver,
                          ) ?? null
                        }
                        sessionStartMs={sessionStartMs}
                        driverLap={focusDriverLap}
                        compareDriverLap={compareDriverLap}
                        onClear={clearFocusSelection}
                        onClearCompare={() =>
                          setFocusSelection(focusDriver, null)
                        }
                      />
                    </Suspense>
                  </div>
                )}
              </div>

              <ResizeHandle
                onMouseDown={trackerDesktopResizeHandleProps.onMouseDown}
                onTouchStart={trackerDesktopResizeHandleProps.onTouchStart}
                onDoubleClick={trackerDesktopResizeHandleProps.onDoubleClick}
                orientation="vertical"
                className="border-r border-panel/60 bg-track/80 hover:bg-[#38383f] active:bg-f1red"
              />

              {/* Track map — fills remaining width */}
              <div className="flex-1 min-w-0 bg-[#10101a] flex flex-col">
                <div className="relative flex-1 min-h-0">
                  {drivers.isError ? (
                    <ErrorMessage message="Failed to load driver data" />
                  ) : (
                    <Suspense fallback={<PanelFallback />}>{trackMap}</Suspense>
                  )}
                  {isLoadingSessionData && (
                    <span className="absolute top-2 right-2 text-f1red text-[10px] animate-pulse">
                      Loading…
                    </span>
                  )}
                </div>
              </div>
            </div>
          </div>
        </div>
      )}

      {/* ── COMMENTARY VIEW ───────────────────────────────────────────── */}
      {currentView === "commentary" && (
        <div className="flex flex-col md:flex-1 md:min-h-0 md:overflow-hidden">
          <SessionInfoBar
            laps={laps.data ?? []}
            raceControl={raceControl.data ?? []}
            sessionTimeMs={t}
            sessionStartMs={sessionStartMs}
            qualiPhase={qualiPhase}
            countdownMs={countdownMs}
            airTemp={weatherAtT?.air_temperature ?? null}
            trackTemp={weatherAtT?.track_temperature ?? null}
            isRaceSession={isRaceSession}
            lightsOutMs={lightsOutMs}
            totalLapCount={totalLapCount}
            onShowEliminations={
              isQualiSession(sessionName) && qualiPhase
                ? () => setIsQualiEliminationsDialogOpen(true)
                : undefined
            }
            onShowResults={
              showFinalClassification && !sessionResult.isError
                ? () => setIsResultsDialogOpen(true)
                : undefined
            }
            onJumpToSessionTime={(sessionTimeMs) => setTimelineT(sessionTimeMs)}
          />

          {/* Sub-tabs */}
          <div className="grid grid-cols-6 w-full border-b border-panel shrink-0 bg-track sm:flex sm:overflow-x-auto">
            {commentaryTabs.map(
              ([tab, label, shortLabel, count, metaLabel]) => (
                <button
                  key={tab}
                  onClick={() => {
                    trackEvent("raceweekend_commentary_tab_changed", { tab });
                    setCommentaryTab(tab);
                  }}
                  className={`w-full px-1.5 py-2 text-[10px] font-bold uppercase tracking-wider transition-colors border-b-2 sm:shrink-0 sm:w-auto sm:px-4 sm:text-[11px] ${
                    (commentaryTab ?? "rc") === tab
                      ? "text-white border-f1red -mb-px"
                      : "text-muted border-transparent hover:text-white"
                  }`}
                >
                  <span className="block sm:hidden">{shortLabel}</span>
                  <span className="hidden sm:block">{label}</span>
                  <span
                    className={`mt-1 block font-mono text-[9px] leading-none tabular-nums ${
                      (commentaryTab ?? "rc") === tab
                        ? "text-white/70"
                        : "text-muted/80"
                    }`}
                  >
                    <span className="sm:hidden">{count}</span>
                    <span className="hidden sm:inline">
                      {count} {metaLabel}
                    </span>
                  </span>
                </button>
              ),
            )}
          </div>

          {/* Live lap status */}
          <div className="shrink-0 border-b border-panel bg-surface/70 px-3 py-1.5">
            <div className="flex items-center gap-3">
              <span className="text-[10px] font-black uppercase tracking-[0.12em] text-muted">
                Lap{" "}
                <span className="text-white tabular-nums">
                  {commentaryLapLabel}
                </span>
              </span>
              <button
                type="button"
                onClick={() =>
                  setCommentaryTimeMode(
                    (() => {
                      const nextValue =
                        commentaryTimeMode === "all" ? "elapsed" : "all";
                      trackEvent("raceweekend_commentary_time_mode_changed", {
                        mode: nextValue,
                      });
                      return nextValue;
                    })(),
                  )
                }
                className={`h-5 px-2 text-[9px] font-black uppercase tracking-widest border transition-colors ${
                  commentaryTimeMode === "all"
                    ? "border-f1red bg-f1red text-white"
                    : "border-panel bg-track text-muted hover:text-white"
                }`}
                title={
                  commentaryTimeMode === "all"
                    ? "Showing all commentary items"
                    : "Showing elapsed commentary items"
                }
              >
                {commentaryTimeMode === "all" ? "All" : "Elapsed"}
              </button>
            </div>
          </div>

          {/* Content */}
          <div className="flex flex-col md:flex-1 md:min-h-0 md:overflow-hidden">
            <Suspense fallback={<PanelFallback />}>
              <CommentaryPanels
                commentaryTab={commentaryTab ?? "rc"}
                raceControlError={raceControl.isError}
                teamRadioError={teamRadio.isError}
                pitsError={pits.isError}
                overtakesError={overtakes.isError}
                raceControlEntries={raceControl.data ?? []}
                teamRadioEntries={teamRadio.data ?? []}
                pitEntries={pits.data ?? []}
                overtakeEntries={overtakes.data ?? []}
                drivers={drivers.data ?? []}
                laps={laps.data ?? []}
                positions={positions.data ?? []}
                incidentWindows={incidentWindows}
                sessionKey={sessionKey}
                sessionYear={session?.year ?? null}
                sessionType={session?.session_type}
                sessionTimeMs={t}
                sessionStartMs={sessionStartMs}
                toastEvents={toastEvents}
                showAllItems={commentaryTimeMode === "all"}
                focusDriver={focusDriver}
                onClearFocus={clearFocusSelection}
                onPlayWindow={(startMs, endMs) => {
                  trackEvent("raceweekend_commentary_play_window", {
                    start_ms: Math.round(startMs),
                    end_ms: Math.round(endMs),
                  });
                  setTimelineT(startMs);
                  setIncidentReplayEndMs(endMs);
                  setTimelinePlaying(true);
                }}
              />
            </Suspense>
          </div>
        </div>
      )}

      {/* Catch-up summary — appears over the whole layout after a big scrub-forward */}
      {catchupSummaryEnabled && catchupSummary !== null && (
        <CatchupSummary
          summary={catchupSummary}
          drivers={drivers.data ?? []}
          onDismiss={dismissCatchup}
        />
      )}

      {showFinalClassification && sessionResult.isError && (
        <div className="shrink-0 border-t border-panel">
          <ErrorMessage message="Failed to load final classification" compact />
        </div>
      )}

      {sessionStartMs > 0 &&
        isQualiSession(sessionName) &&
        qualiPhase &&
        isQualiEliminationsDialogOpen && (
          <QualifyingBanner
            phase={qualiPhase}
            drivers={drivers.data ?? []}
            positions={positions.data ?? []}
            sessionTimeMs={t}
            sessionStartMs={sessionStartMs}
            countdownMs={countdownMs}
            openByDefault
            dialogOnly
            onClose={() => setIsQualiEliminationsDialogOpen(false)}
          />
        )}

      {showFinalClassification &&
        !sessionResult.isError &&
        isResultsDialogOpen && (
          <FinalClassificationDialog
            results={sessionResult.data ?? []}
            drivers={drivers.data ?? []}
            sessionName={session?.session_name}
            onClose={() => setIsResultsDialogOpen(false)}
          />
        )}

      {!showTrackerInlinePlayback && (
        <PlaybackBar
          durationMs={playbackDurationMs}
          lapStarts={lapMarks}
          pitTimes={pitMarks}
          flagTimes={flagMarks}
          safetyCarTimes={safetyCarMarks}
          overtakeTimes={overtakeMarks}
          radioTimes={radioMarks}
          raceControlMarkers={raceControlMarkers}
          markerSummary={markerSummary}
          canReplayCurrentIncident={currentReplayIncident !== undefined}
          onReplayCurrentIncident={replayCurrentIncident}
          canReplayNextIncident={
            nextReplayIncident !== undefined ||
            firstReplayIncident !== undefined
          }
          onReplayNextIncident={replayNextIncident}
          incidentReplayHint={incidentReplayHint}
          countdownMs={countdownMs}
          qualiPhase={qualiPhase}
          q2StartMs={qualiPhaseStartTimes.q2StartMs}
          q3StartMs={qualiPhaseStartTimes.q3StartMs}
          showSpeedControls={showPlaybackSpeedControls}
          showEventChips={showPlaybackEventChips}
        />
      )}
    </div>
  );
}
