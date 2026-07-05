import { useEffect, useMemo, useState } from "react";
import { PlaybackBar } from "@/components/PlaybackBar";
import {
  TrackMap,
  type ActiveTrackFlagState,
  type ActiveTrackVehicles,
} from "@/components/TrackMap/TrackMap";
import { LiveTiming } from "@/components/LiveTiming/LiveTiming";
import { RaceControlFeed } from "@/components/RaceControl/RaceControl";
import { WeatherPanel } from "@/components/Weather/WeatherPanel";
import { StrategyBar } from "@/components/Strategy/StrategyBar";
import { TeamRadioFeed } from "@/components/TeamRadio/TeamRadio";
import { OvertakeFeed } from "@/components/Overtakes/OvertakeFeed";
import { FocusedTelemetry } from "@/components/FocusedTelemetry/FocusedTelemetry";
import { LapChart } from "@/components/LapChart/LapChart";
import { GapChart } from "@/components/GapChart/GapChart";
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
  buildRaceChapters,
  clusterRaceControlMarkers,
  computeWhatChanged,
  deriveTrackFlagState,
  normalizeRaceControl,
  summarizeMarkers,
} from "@/timeline/raceControl";
import { RaceChapters } from "@/components/RaceChapters/RaceChapters";
import { useEventToasts } from "@/hooks/useEventToasts";
import { useCatchupSummary } from "@/hooks/useCatchupSummary";
import { EventToastStack } from "@/components/EventToast/EventToastStack";
import { KeyMoments } from "@/components/KeyMoments/KeyMoments";
import { CatchupSummary } from "@/components/CatchupSummary/CatchupSummary";
import type { FastestLapPayload } from "@/timeline/events";
import { isSessionLive } from "@/utils/live";
import { teamColor } from "@/utils/color";
import { DEFAULT_SESSION_MS } from "@/constants";
import { useSettings } from "@/stores/settings";
import { deriveRetiredDrivers } from "@/utils/retirement";
import {
  getSafetyControlPhase,
  isTrackClearSignal,
} from "@/utils/raceControlFlags";
import {
  isTimedSession,
  isQualiSession,
  detectQualiPhase,
} from "@/utils/session";
import type { MainView } from "@/components/Nav";
import type { Stint, CarData } from "@/api/types";

// Sub-tab options per view
type TrackerTab = "timing" | "chart" | "gap" | "map" | "strategy";
type CommentaryTab = "rc" | "radio" | "passes" | "moments" | "chapters";

export interface KeyMoment {
  ms: number;
  kind: "lead_change" | "fastest_lap" | "safety_car" | "vsc" | "red_flag";
  label: string;
  sublabel?: string;
  color: string;
}

const PANEL = "bg-surface border border-panel";
const PANEL_TITLE =
  "text-[10px] font-bold text-muted px-3 py-2 border-b border-[#38383f] uppercase tracking-[0.12em] border-l-2 border-l-f1red bg-track";
const OVERTAKE_PULSE_MS = 4_000;

export default function RaceWeekend() {
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
  const [focusDriver] = useNumberParam("focus", null);
  const [compareDriver] = useNumberParam("compare", null);
  const [, setSearchParams] = useSearchParams();
  const isCompactViewport = useMediaQuery("(max-width: 767px)");
  const [isResultsDialogOpen, setIsResultsDialogOpen] = useState(false);
  const [isQualiEliminationsDialogOpen, setIsQualiEliminationsDialogOpen] =
    useState(false);
  const [incidentReplayEndMs, setIncidentReplayEndMs] = useState<number | null>(
    null,
  );
  const [incidentReplayHint, setIncidentReplayHint] = useState<string | null>(
    null,
  );

  const sessions = useSessions(meetingKey);
  const session = sessions.data?.find((s) => s.session_key === sessionKey);
  const live = isSessionLive(session);

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

  const sessionStartMs = session ? new Date(session.date_start).getTime() : 0;
  const sessionEndMs = session ? new Date(session.date_end).getTime() : 0;
  const durationMs = sessionEndMs - sessionStartMs;

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
    (!isCompactViewport || (trackerTab ?? "timing") === "map");
  const location = useLocationChunks(
    isMapVisible ? sessionKey : null,
    isMapVisible ? sessionStartMs || null : null,
    locationChunkIdx,
    isMapVisible ? t : undefined,
    {
      includeNextChunk: !isCompactViewport,
      prefetchChunks: !isCompactViewport,
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
    if (!sessionStartMs || !laps.data?.length) return null;
    let min = Infinity;
    for (const l of laps.data) {
      if (l.lap_number !== 1 || !l.date_start) continue;
      const ms = new Date(l.date_start).getTime() - sessionStartMs;
      if (ms < min) min = ms;
    }
    return min === Infinity ? null : min;
  }, [laps.data, sessionStartMs]);
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

  // ── Phase 3: chapters + what-changed ────────────────────────────────────────
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

  const chequeredMs = useMemo(() => {
    if (!sessionStartMs) return null;
    let lastChequered: number | null = null;
    for (const entry of raceControl.data ?? []) {
      if (entry.flag !== "CHEQUERED") continue;
      lastChequered = new Date(entry.date).getTime() - sessionStartMs;
    }
    return lastChequered;
  }, [raceControl.data, sessionStartMs]);

  const raceChapters = useMemo(
    () =>
      buildRaceChapters(
        incidentWindows,
        durationMs || DEFAULT_SESSION_MS,
        chequeredMs,
      ),
    [incidentWindows, durationMs, chequeredMs],
  );

  const whatChangedSnapshots = useMemo(
    () =>
      computeWhatChanged(
        incidentWindows,
        positions.data ?? [],
        pits.data ?? [],
        sessionStartMs,
      ),
    [incidentWindows, positions.data, pits.data, sessionStartMs],
  );

  const nextReplayIncident = useMemo(() => {
    const MIN_AHEAD_MS = 250;
    return incidentWindows.find(
      (w) => w.endMs !== null && w.startMs > t + MIN_AHEAD_MS,
    );
  }, [incidentWindows, t]);

  const firstReplayIncident = useMemo(
    () => incidentWindows.find((w) => w.endMs !== null),
    [incidentWindows],
  );

  const pulseDrivers = useMemo(() => {
    const out: number[] = [];
    for (const o of overtakes.data ?? []) {
      const ms = new Date(o.date).getTime() - sessionStartMs;
      if (ms <= t && t - ms <= OVERTAKE_PULSE_MS) {
        out.push(o.overtaking_driver_number, o.overtaken_driver_number);
      }
    }
    return out;
  }, [overtakes.data, sessionStartMs, t]);

  // Last completed lap number for the focused driver — used to load heat overlay data.
  // Use the latest lap with a valid duration whose end time is at/before the playhead.
  const focusDriverLap = useMemo(() => {
    if (focusDriver === null || !laps.data?.length || !sessionStartMs)
      return null;
    let latestCompleted: number | null = null;
    for (const lap of laps.data) {
      if (lap.driver_number !== focusDriver || !lap.date_start) continue;
      if (lap.lap_duration === null) continue;
      const lapStart = new Date(lap.date_start).getTime() - sessionStartMs;
      const lapEnd = lapStart + lap.lap_duration * 1000;
      if (lapEnd > t) continue;
      if (latestCompleted === null || lap.lap_number > latestCompleted)
        latestCompleted = lap.lap_number;
    }
    return latestCompleted;
  }, [focusDriver, laps.data, sessionStartMs, t]);

  const compareDriverLap = useMemo(() => {
    if (compareDriver === null || !laps.data?.length || !sessionStartMs)
      return null;
    let latestCompleted: number | null = null;
    for (const lap of laps.data) {
      if (lap.driver_number !== compareDriver || !lap.date_start) continue;
      if (lap.lap_duration === null) continue;
      const lapStart = new Date(lap.date_start).getTime() - sessionStartMs;
      const lapEnd = lapStart + lap.lap_duration * 1000;
      if (lapEnd > t) continue;
      if (latestCompleted === null || lap.lap_number > latestCompleted)
        latestCompleted = lap.lap_number;
    }
    return latestCompleted;
  }, [compareDriver, laps.data, sessionStartMs, t]);

  // Current tyre compound + age per driver at the playhead.
  // Rebuilds when lap/stint data arrives or when the coarse time crosses a lap boundary.
  const activeCompounds = useMemo(() => {
    const result = new Map<
      number,
      { compound: Stint["compound"]; age: number }
    >();
    if (!laps.data?.length || !stints.data?.length || !sessionStartMs)
      return result;
    const currentLapByDriver = new Map<number, number>();
    for (const lap of laps.data) {
      if (!lap.date_start) continue;
      const lapRelMs = new Date(lap.date_start).getTime() - sessionStartMs;
      if (lapRelMs > t) continue;
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
  }, [laps.data, stints.data, sessionStartMs, t]);

  // Cars within 1.0 s of the car ahead → highlight DRS battle on the map.
  const battlingDrivers = useMemo(() => {
    const result = new Set<number>();
    if (!intervals.data?.length || !sessionStartMs) return result;
    const cutoffMs = sessionStartMs + t;
    const latest = new Map<
      number,
      { ms: number; interval: number | string | null }
    >();
    for (const iv of intervals.data) {
      const ms = new Date(iv.date).getTime();
      if (ms > cutoffMs) continue;
      const prev = latest.get(iv.driver_number);
      if (!prev || ms > prev.ms)
        latest.set(iv.driver_number, { ms, interval: iv.interval });
    }
    for (const [num, { interval }] of latest) {
      if (typeof interval === "number" && interval <= 1.0) result.add(num);
    }
    return result;
  }, [intervals.data, sessionStartMs, t]);

  const retiredDrivers = useMemo((): ReadonlySet<number> => {
    return deriveRetiredDrivers({
      positions: positions.data ?? [],
      laps: laps.data ?? [],
      raceControl: raceControl.data ?? [],
      currentT: sessionStartMs + t,
      isRaceSession,
    });
  }, [
    positions.data,
    laps.data,
    raceControl.data,
    sessionStartMs,
    t,
    isRaceSession,
  ]);

  // Current session global/sector track flag state at playhead.
  const activeTrackFlagState = useMemo<ActiveTrackFlagState | null>(() => {
    if (!sessionStartMs) return null;
    return deriveTrackFlagState(
      raceControl.data ?? [],
      sessionStartMs,
      sessionStartMs + t,
    );
  }, [raceControl.data, sessionStartMs, t]);

  const activeTrackVehicles = useMemo<ActiveTrackVehicles | null>(() => {
    if (!sessionStartMs) return null;

    let safetyCar = false;
    let vsc = false;
    let medicalCar = false;
    const LIGHTS_SEQUENCE_MS = 5_000;
    const formationLap =
      isRaceSession &&
      lightsOutMs != null &&
      t >= 0 &&
      t < Math.max(0, lightsOutMs - LIGHTS_SEQUENCE_MS);
    const cutoff = sessionStartMs + t;

    for (const entry of raceControl.data ?? []) {
      if (new Date(entry.date).getTime() > cutoff) break;

      const phase = getSafetyControlPhase(entry);
      const message = (entry.message ?? "").toUpperCase();
      const clearsTrack = isTrackClearSignal(entry);

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

      if (message.includes("MEDICAL CAR")) {
        if (
          message.includes("IN THIS LAP") ||
          message.includes("ENDING") ||
          message.includes("HAS ENDED") ||
          message.includes("RETURN") ||
          message.includes("WITHDRAW")
        ) {
          medicalCar = false;
        } else {
          medicalCar = true;
        }
      }
    }

    if (!safetyCar && !vsc && !medicalCar && !formationLap) return null;
    return { safetyCar, vsc, medicalCar, formationLap };
  }, [raceControl.data, sessionStartMs, t, isRaceSession, lightsOutMs]);

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
  const trackerTimingTelemetryEnabled =
    (leaderboardTelemetry ||
      trackerTimingTelemetry ||
      trackerTimingMobileCarData) &&
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
      let lo = 0;
      let hi = arr.length;
      while (lo < hi) {
        const mid = (lo + hi) >>> 1;
        if (arr[mid]!.ms <= t) lo = mid + 1;
        else hi = mid;
      }
      const s = arr[lo - 1]?.d;
      if (s) m.set(num, s);
    }
    return m;
  }, [carSamplesByDriver, t]);

  // Latest weather sample at or before the playhead.
  const weatherAtT = useMemo(() => {
    if (!sessionStartMs || !(weather.data?.length ?? 0)) return null;
    const cutoff = sessionStartMs + t;
    let latest = null;
    for (const w of weather.data ?? []) {
      if (new Date(w.date).getTime() > cutoff) break;
      latest = w;
    }
    return latest;
  }, [weather.data, sessionStartMs, t]);

  // Apply default speed when a new session loads.
  useEffect(() => {
    if (!sessionKey) return;
    useTimeline.getState().setSpeed(defaultSpeed);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [sessionKey]);

  const toastEvents = useMemo(
    () =>
      sessionStartMs
        ? buildToastEvents(
            teamRadio.data ?? [],
            raceControl.data ?? [],
            overtakes.data ?? [],
            pits.data ?? [],
            sessionStartMs,
            laps.data ?? [],
          )
        : [],
    [
      teamRadio.data,
      raceControl.data,
      overtakes.data,
      pits.data,
      sessionStartMs,
      laps.data,
    ],
  );

  const filteredToastEvents = useMemo(() => {
    if (!toastsEnabled) return [];
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

  // Key moments: lead changes + fastest laps (from toastEvents) + SC/Red flag events.
  const keyMoments = useMemo((): KeyMoment[] => {
    if (!sessionStartMs) return [];
    const driverMap = new Map(
      (drivers.data ?? []).map((d) => [d.driver_number, d]),
    );
    const moments: KeyMoment[] = [];

    // Lead changes: find P1 position events and detect driver transitions
    const p1Events = (positions.data ?? [])
      .filter((p) => p.position === 1)
      .map((p) => ({
        ms: new Date(p.date).getTime() - sessionStartMs,
        num: p.driver_number,
      }))
      .filter((p) => p.ms >= 0)
      .sort((a, b) => a.ms - b.ms);

    let lastLeader = -1;
    for (const ev of p1Events) {
      if (ev.num !== lastLeader) {
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
    }

    // Fastest laps from the toast event pipeline
    for (const ev of toastEvents) {
      if (ev.kind !== "fastest_lap") continue;
      const p = ev.payload as FastestLapPayload;
      const d = driverMap.get(p.driverNumber);
      const m = Math.floor(p.lapTime / 60);
      const s = (p.lapTime % 60).toFixed(3).padStart(6, "0");
      moments.push({
        ms: ev.ms,
        kind: "fastest_lap",
        label: `Fastest: ${d?.name_acronym ?? p.driverNumber}`,
        sublabel: m > 0 ? `${m}:${s}` : s,
        color: "#9b59f5",
      });
    }

    // SC / VSC / Red flag milestones from race control
    for (const e of raceControl.data ?? []) {
      const ms = new Date(e.date).getTime() - sessionStartMs;
      if (ms < 0) continue;
      const phase = getSafetyControlPhase(e);
      if (phase === "safety_car_start") {
        moments.push({
          ms,
          kind: "safety_car",
          label: "Safety Car deployed",
          color: "#f5a623",
        });
      } else if (phase === "safety_car_end") {
        moments.push({
          ms,
          kind: "safety_car",
          label: "Safety Car in this lap",
          color: "#f5a623",
        });
      } else if (phase === "vsc_start") {
        moments.push({
          ms,
          kind: "vsc",
          label: "Virtual Safety Car",
          color: "#f5a623",
        });
      } else if (phase === "vsc_end") {
        moments.push({
          ms,
          kind: "vsc",
          label: "VSC ending",
          color: "#f5a623",
        });
      } else if (e.flag === "RED") {
        const message = (e.message ?? "").trim();
        moments.push({
          ms,
          kind: "red_flag",
          label: "Red Flag",
          sublabel: message.length > 50 ? message.slice(0, 47) + "…" : message,
          color: "#e8002d",
        });
      }
    }

    return moments.sort((a, b) => a.ms - b.ms);
  }, [
    positions.data,
    toastEvents,
    raceControl.data,
    drivers.data,
    sessionStartMs,
  ]);

  const effectiveDuration = durationMs || DEFAULT_SESSION_MS;

  // Calculate extended duration to include post-race laps and radios (outlap + post-race comms)
  const postRaceDurationMs = useMemo(() => {
    if (!isRaceSession || chequeredMs === null || !sessionStartMs) return null;

    let latestMs = chequeredMs;

    // Check for post-race laps (outlaps)
    if (laps.data?.length) {
      for (const lap of laps.data) {
        if (lap.date_start && lap.lap_duration && lap.lap_duration > 0) {
          const lapStartMs =
            new Date(lap.date_start).getTime() - sessionStartMs;
          const lapEndMs = lapStartMs + lap.lap_duration * 1000;
          if (lapEndMs > chequeredMs) {
            latestMs = Math.max(latestMs, lapEndMs);
          }
        }
      }
    }

    // Check for post-race radio messages
    if (teamRadio.data?.length) {
      for (const radio of teamRadio.data) {
        const radioMs = new Date(radio.date).getTime() - sessionStartMs;
        if (radioMs > chequeredMs) {
          latestMs = Math.max(latestMs, radioMs);
        }
      }
    }

    return latestMs > chequeredMs ? latestMs : null;
  }, [isRaceSession, chequeredMs, sessionStartMs, laps.data, teamRadio.data]);

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
    for (const entry of raceControl.data ?? []) {
      const relMs = new Date(entry.date).getTime() - sessionStartMs;
      const msg = (entry.message ?? "").toUpperCase();
      if (q2StartMs === null && /\bQ2\b/.test(msg)) q2StartMs = relMs;
      if (q3StartMs === null && /\bQ3\b/.test(msg)) q3StartMs = relMs;
      if (q2StartMs !== null && q3StartMs !== null) break;
    }

    return { q2StartMs, q3StartMs };
  }, [raceControl.data, sessionName, sessionStartMs]);

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

  function setFocusSelection(focus: number | null, compare: number | null) {
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
      setFocusSelection(num, null);
      return;
    }
    if (focusDriver === num) {
      setFocusSelection(null, null);
      return;
    }
    // Clicking a different driver should move focus to that driver immediately.
    // This keeps row/map interactions predictable (focus follows click).
    setFocusSelection(num, null);
  };

  const clearFocusSelection = () => {
    setFocusSelection(null, null);
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

      {sessionStartMs > 0 && isQualiSession(sessionName) && qualiPhase && (
        <QualifyingBanner
          phase={qualiPhase}
          drivers={drivers.data ?? []}
          positions={positions.data ?? []}
          sessionTimeMs={t}
          sessionStartMs={sessionStartMs}
          countdownMs={countdownMs}
        />
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
                    onClick={() => setTrackerTab(tab)}
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
                  canReplayNextIncident={
                    nextReplayIncident !== undefined ||
                    firstReplayIncident !== undefined
                  }
                  onReplayNextIncident={() => {
                    const chosen = nextReplayIncident ?? firstReplayIncident;
                    if (!chosen || chosen.endMs === null) return;
                    if (!nextReplayIncident && firstReplayIncident) {
                      setIncidentReplayHint("Wrapped to first incident");
                    }
                    setTimelineT(chosen.startMs);
                    setIncidentReplayEndMs(chosen.endMs);
                    setTimelinePlaying(true);
                  }}
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
                        trackMap
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
                      <StrategyBar
                        stints={stints.data ?? []}
                        drivers={drivers.data ?? []}
                        laps={laps.data ?? []}
                        pits={pits.data ?? []}
                        sessionTimeMs={t}
                        sessionStartMs={sessionStartMs}
                        currentLap={currentLap}
                      />
                    </div>
                  </div>
                )}

                {(trackerTab ?? "timing") === "chart" && (
                  <div className="h-[52vh] min-h-[280px] bg-[#10101a]">
                    <LapChart
                      drivers={drivers.data ?? []}
                      positions={positions.data ?? []}
                      lapStarts={lapMarks}
                      sessionStartMs={sessionStartMs}
                      sessionTimeMs={t}
                      currentLap={currentLap}
                    />
                  </div>
                )}

                {(trackerTab ?? "timing") === "gap" && (
                  <div className="h-[52vh] min-h-[280px] bg-[#10101a]">
                    <GapChart
                      drivers={drivers.data ?? []}
                      intervals={intervals.data ?? []}
                      lapStarts={lapMarks}
                      currentLap={currentLap}
                      sessionStartMs={sessionStartMs}
                      sessionTimeMs={t}
                    />
                  </div>
                )}
              </div>
            </div>

            {/* Desktop layout: split panel (hidden md:flex) */}
            <div className="hidden md:flex flex-1 min-h-0 overflow-hidden">
              {/* Left data panel */}
              <div className="md:w-[745px] lg:w-[905px] xl:w-[905px] shrink-0 flex flex-col border-r border-panel overflow-hidden">
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
                      onClick={() => setTrackerTab(tab)}
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
                        <StrategyBar
                          stints={stints.data ?? []}
                          drivers={drivers.data ?? []}
                          laps={laps.data ?? []}
                          pits={pits.data ?? []}
                          sessionTimeMs={t}
                          sessionStartMs={sessionStartMs}
                          currentLap={currentLap}
                        />
                      </div>
                    </div>
                  )}
                  {(trackerTab ?? "timing") === "chart" && (
                    <LapChart
                      drivers={drivers.data ?? []}
                      positions={positions.data ?? []}
                      lapStarts={lapMarks}
                      sessionStartMs={sessionStartMs}
                      sessionTimeMs={t}
                      currentLap={currentLap}
                    />
                  )}
                  {(trackerTab ?? "timing") === "gap" && (
                    <GapChart
                      drivers={drivers.data ?? []}
                      intervals={intervals.data ?? []}
                      lapStarts={lapMarks}
                      currentLap={currentLap}
                      sessionStartMs={sessionStartMs}
                      sessionTimeMs={t}
                    />
                  )}
                </div>

                {/* Focused driver telemetry */}
                {focusDriver !== null && (
                  <div className="shrink-0 border-t border-panel">
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
                  </div>
                )}
              </div>

              {/* Track map — fills remaining width */}
              <div className="flex-1 min-w-0 bg-[#10101a] flex flex-col">
                <div className="relative flex-1 min-h-0">
                  {drivers.isError ? (
                    <ErrorMessage message="Failed to load driver data" />
                  ) : (
                    trackMap
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

          {/* Compact weather strip */}
          <div className="shrink-0 border-b border-panel">
            {weather.isError ? (
              <ErrorMessage message="Failed to load weather" compact />
            ) : (
              <WeatherPanel
                entries={weather.data ?? []}
                sessionKey={sessionKey}
                sessionTimeMs={t}
                sessionStartMs={sessionStartMs}
              />
            )}
          </div>

          {/* Sub-tabs */}
          <div className="grid grid-cols-5 w-full border-b border-panel shrink-0 bg-track sm:flex sm:overflow-x-auto">
            {(
              [
                ["rc", "Race Control", "RC"],
                ["radio", "Team Radio", "Radio"],
                ["passes", "Overtakes", "Passes"],
                ["moments", "Key Moments", "Moments"],
                ["chapters", "Chapters", "Chptrs"],
              ] as [CommentaryTab, string, string][]
            ).map(([tab, label, shortLabel]) => (
              <button
                key={tab}
                onClick={() => setCommentaryTab(tab)}
                className={`w-full px-1.5 py-2 text-[10px] font-bold uppercase tracking-wider transition-colors border-b-2 sm:shrink-0 sm:w-auto sm:px-4 sm:text-[11px] ${
                  (commentaryTab ?? "rc") === tab
                    ? "text-white border-f1red -mb-px"
                    : "text-muted border-transparent hover:text-white"
                }`}
              >
                <span className="sm:hidden">{shortLabel}</span>
                <span className="hidden sm:inline">{label}</span>
              </button>
            ))}
          </div>

          {/* Live lap status */}
          <div className="shrink-0 border-b border-panel bg-surface/70 px-3 py-1.5">
            <span className="text-[10px] font-black uppercase tracking-[0.12em] text-muted">
              Lap{" "}
              <span className="text-white tabular-nums">
                {commentaryLapLabel}
              </span>
            </span>
          </div>

          {/* Content */}
          <div className="flex flex-col md:flex-1 md:min-h-0 md:overflow-hidden">
            {(commentaryTab ?? "rc") === "rc" &&
              (raceControl.isError ? (
                <ErrorMessage message="Failed to load race control" />
              ) : (
                <RaceControlFeed
                  entries={raceControl.data ?? []}
                  sessionKey={sessionKey}
                  sessionTimeMs={t}
                  sessionStartMs={sessionStartMs}
                  drivers={drivers.data ?? []}
                  focusDriver={focusDriver}
                  onClearFocus={
                    focusDriver !== null ? clearFocusSelection : undefined
                  }
                />
              ))}
            {commentaryTab === "radio" &&
              (teamRadio.isError ? (
                <ErrorMessage message="Failed to load team radio" />
              ) : (
                <TeamRadioFeed
                  entries={teamRadio.data ?? []}
                  sessionKey={sessionKey}
                  sessionYear={session?.year ?? null}
                  drivers={drivers.data ?? []}
                  sessionTimeMs={t}
                  sessionStartMs={sessionStartMs}
                />
              ))}
            {commentaryTab === "passes" &&
              (overtakes.isError ? (
                <ErrorMessage message="Failed to load overtakes" />
              ) : (
                <OvertakeFeed
                  entries={overtakes.data ?? []}
                  sessionKey={sessionKey}
                  drivers={drivers.data ?? []}
                  sessionTimeMs={t}
                  sessionStartMs={sessionStartMs}
                />
              ))}
            {commentaryTab === "moments" && (
              <KeyMoments
                moments={keyMoments}
                sessionTimeMs={t}
                onJump={(ms) => useTimeline.getState().setT(ms)}
              />
            )}
            {commentaryTab === "chapters" && (
              <RaceChapters
                chapters={raceChapters}
                snapshots={whatChangedSnapshots}
                drivers={drivers.data ?? []}
                sessionTimeMs={t}
                onJump={(ms) => useTimeline.getState().setT(ms)}
                onPlayWindow={(startMs, endMs) => {
                  setTimelineT(startMs);
                  setIncidentReplayEndMs(endMs);
                  setTimelinePlaying(true);
                }}
              />
            )}
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
          canReplayNextIncident={
            nextReplayIncident !== undefined ||
            firstReplayIncident !== undefined
          }
          onReplayNextIncident={() => {
            const chosen = nextReplayIncident ?? firstReplayIncident;
            if (!chosen || chosen.endMs === null) return;
            if (!nextReplayIncident && firstReplayIncident) {
              setIncidentReplayHint("Wrapped to first incident");
            }
            setTimelineT(chosen.startMs);
            setIncidentReplayEndMs(chosen.endMs);
            setTimelinePlaying(true);
          }}
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
