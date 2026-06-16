import { useEffect, useMemo, useState } from "react";
import { PlaybackBar } from "@/components/PlaybackBar";
import {
  TrackMap,
  type ActiveTrackFlag,
  type ActiveTrackVehicles,
  type LeaderboardRow,
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
import { FlagBanner } from "@/components/FlagBanner";
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
import { useTimeline } from "@/timeline/clock";
import { useCoarseTime } from "@/hooks/useCoarseTime";
import { useLocationChunks, chunkIndexFor } from "@/hooks/useLocationChunks";
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
  normalizeRaceControl,
  summarizeMarkers,
} from "@/timeline/raceControl";
import { RaceChapters } from "@/components/RaceChapters/RaceChapters";
import { useEventToasts } from "@/hooks/useEventToasts";
import { useCatchupSummary } from "@/hooks/useCatchupSummary";
import { EventToastStack } from "@/components/EventToast/EventToastStack";
import { KeyMoments } from "@/components/KeyMoments/KeyMoments";
import { CatchupSummary } from "@/components/CatchupSummary/CatchupSummary";
import { ResizeHandle } from "@/components/ResizeHandle";
import { useVerticalResize } from "@/hooks/useVerticalResize";
import type { FastestLapPayload } from "@/timeline/events";
import { isSessionLive } from "@/utils/live";
import { teamColor } from "@/utils/color";
import { DEFAULT_SESSION_MS } from "@/constants";
import { useSettings } from "@/stores/settings";
import { deriveRetiredDrivers } from "@/utils/retirement";
import {
  isTimedSession,
  isQualiSession,
  detectQualiPhase,
} from "@/utils/session";
import type { MainView } from "@/components/Nav";
import type { Stint, CarData } from "@/api/types";

// Sub-tab options per view
type TrackerTab = "timing" | "chart" | "gap" | "map";
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
  const [view] = useStringParam<MainView>("view", "leaderboard");
  const VALID_VIEWS: MainView[] = ["leaderboard", "tracker", "commentary"];
  const currentView: MainView = VALID_VIEWS.includes(view as MainView)
    ? (view as MainView)
    : "leaderboard";

  // Sub-tab state for tracker + commentary views
  const [trackerTab, setTrackerTab] = useStringParam<TrackerTab>(
    "ttab",
    "timing",
  );
  const [commentaryTab, setCommentaryTab] = useStringParam<CommentaryTab>(
    "ctab",
    "rc",
  );
  const [focusDriver, setFocusDriver] = useNumberParam("focus", null);
  const [compareDriver, setCompareDriver] = useNumberParam("compare", null);
  const [isResultsDialogOpen, setIsResultsDialogOpen] = useState(false);

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
  // Throttled to ~10 Hz. Step-based panels (LiveTiming, Strategy, Weather, etc.)
  // don't need 60 fps; TrackMap drives its own 60 Hz loop internally.
  const t = useCoarseTime();

  const sessionStartMs = session ? new Date(session.date_start).getTime() : 0;
  const sessionEndMs = session ? new Date(session.date_end).getTime() : 0;
  const durationMs = sessionEndMs - sessionStartMs;

  useEffect(() => {
    if (sessionStartMs) setSessionStart(sessionStartMs);
  }, [sessionStartMs, setSessionStart]);

  useTimelineUrlSync(sessionKey, sessionStartMs > 0);

  const isLoadingSessionData =
    sessionKey !== null &&
    (drivers.isPending || positions.isPending || intervals.isPending);

  const chunkIdx = chunkIndexFor(t);
  const location = useLocationChunks(
    sessionKey,
    sessionStartMs || null,
    chunkIdx,
    t,
  );

  const lapMarks = useMemo(
    () => lapStartTimes(laps.data ?? [], sessionStartMs),
    [laps.data, sessionStartMs],
  );

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
  // Uses previous lap (not current in-progress) because incomplete laps have no lap_duration.
  const focusDriverLap = useMemo(() => {
    if (focusDriver === null || !laps.data?.length || !sessionStartMs)
      return null;
    let current: number | null = null;
    for (const lap of laps.data) {
      if (lap.driver_number !== focusDriver || !lap.date_start) continue;
      if (new Date(lap.date_start).getTime() - sessionStartMs > t) continue;
      if (current === null || lap.lap_number > current)
        current = lap.lap_number;
    }
    return current !== null && current > 1 ? current - 1 : null;
  }, [focusDriver, laps.data, sessionStartMs, t]);

  const compareDriverLap = useMemo(() => {
    if (compareDriver === null || !laps.data?.length || !sessionStartMs)
      return null;
    let current: number | null = null;
    for (const lap of laps.data) {
      if (lap.driver_number !== compareDriver || !lap.date_start) continue;
      if (new Date(lap.date_start).getTime() - sessionStartMs > t) continue;
      if (current === null || lap.lap_number > current)
        current = lap.lap_number;
    }
    return current !== null && current > 1 ? current - 1 : null;
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

  // Top-5 leaderboard snapshot for the track-map overlay.
  const mapLeaderboard = useMemo((): LeaderboardRow[] => {
    if (!sessionStartMs || !positions.data?.length) return [];
    const cutoff = sessionStartMs + t;
    const posMap = new Map<number, number>();
    for (const p of positions.data) {
      if (new Date(p.date).getTime() <= cutoff)
        posMap.set(p.driver_number, p.position);
    }
    const intMap = new Map<number, string>();
    for (const iv of intervals.data ?? []) {
      if (new Date(iv.date).getTime() > cutoff) continue;
      const gap = iv.gap_to_leader;
      intMap.set(
        iv.driver_number,
        gap === null
          ? "LEAD"
          : typeof gap === "number"
            ? `+${gap.toFixed(1)}`
            : String(gap),
      );
    }
    const driverMap = new Map(
      (drivers.data ?? []).map((d) => [d.driver_number, d]),
    );
    return [...posMap.entries()]
      .sort((a, b) => a[1] - b[1])
      .slice(0, 5)
      .map(([num, pos]) => {
        const d = driverMap.get(num);
        return {
          num,
          pos,
          acronym: d?.name_acronym ?? String(num),
          color: teamColor(d?.team_colour),
          gap: intMap.get(num) ?? "—",
        };
      });
  }, [positions.data, intervals.data, drivers.data, sessionStartMs, t]);

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

  // Current session flag (last flag-bearing RC entry at/before playhead).
  const activeSectorFlag = useMemo<ActiveTrackFlag | null>(() => {
    const cutoff = sessionStartMs + t;
    let active: ActiveTrackFlag | null = null;
    for (const e of raceControl.data ?? []) {
      if (new Date(e.date).getTime() > cutoff) break;
      if (e.flag && e.flag !== "") {
        active = {
          flag: e.flag,
          scope: e.scope,
          sector: e.sector,
        };
      }
    }
    return active;
  }, [raceControl.data, sessionStartMs, t]);

  const activeTrackVehicles = useMemo<ActiveTrackVehicles | null>(() => {
    if (!sessionStartMs) return null;

    let safetyCar = false;
    let medicalCar = false;
    const cutoff = sessionStartMs + t;

    for (const entry of raceControl.data ?? []) {
      if (new Date(entry.date).getTime() > cutoff) break;

      const message = entry.message.toUpperCase();
      const clearsTrack =
        entry.flag === "GREEN" ||
        entry.flag === "CLEAR" ||
        message.includes("TRACK CLEAR") ||
        message.includes("GREEN FLAG");

      if (clearsTrack) {
        safetyCar = false;
        medicalCar = false;
      }

      if (entry.flag === "SAFETY_CAR") {
        safetyCar = true;
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

      if (message.includes("SAFETY CAR") && !message.includes("VIRTUAL")) {
        if (
          message.includes("IN THIS LAP") ||
          message.includes("ENDING") ||
          message.includes("HAS ENDED") ||
          message.includes("RESTART")
        ) {
          safetyCar = false;
        } else {
          safetyCar = true;
        }
      }
    }

    if (!safetyCar && !medicalCar) return null;
    return { safetyCar, medicalCar };
  }, [raceControl.data, sessionStartMs, t]);

  const {
    toastsEnabled,
    toastRadio: settingToastRadio,
    toastFlag: settingToastFlag,
    toastOvertake: settingToastOvertake,
    toastPit: settingToastPit,
    toastFastestLap: settingToastFastestLap,
    mapShowLeaderboard,
    mapShowCompoundBadges,
    mapShowBattleRings,
    mapShowDriverHud,
    mapShowSectorFlags,
    leaderboardTelemetry,
    defaultSpeed,
    catchupSummaryEnabled,
  } = useSettings();

  // ── Live car telemetry for the leaderboard (all drivers) ────────────────────
  // Fetched only when the leaderboard view is active AND the setting is on — it's
  // a ~22k-row window per chunk, so we don't pay for it on other views.
  const telemetryEnabled =
    leaderboardTelemetry && currentView === "leaderboard";
  const allCarData = useAllCarDataWindow(
    sessionKey,
    sessionStartMs,
    chunkIdx,
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
      if (e.flag === "SAFETY_CAR") {
        moments.push({
          ms,
          kind: "safety_car",
          label: "Safety Car deployed",
          color: "#f5a623",
        });
      } else if (e.flag === "VIRTUAL_SC") {
        moments.push({
          ms,
          kind: "vsc",
          label: "Virtual Safety Car",
          color: "#f5a623",
        });
      } else if (e.flag === "RED") {
        moments.push({
          ms,
          kind: "red_flag",
          label: "Red Flag",
          sublabel:
            e.message.length > 50 ? e.message.slice(0, 47) + "…" : e.message,
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
  const playbackDurationMs: number =
    isRaceSession && chequeredMs !== null ? chequeredMs : effectiveDuration;
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

  // ── Session countdown (practice / qualifying) ────────────────────────────
  const sessionName = session?.session_name ?? "";
  const countdownMs =
    isTimedSession(sessionName) && effectiveDuration > 0
      ? Math.max(0, effectiveDuration - t)
      : null;
  const qualiPhase = isQualiSession(sessionName)
    ? detectQualiPhase(raceControl.data ?? [], sessionStartMs, t)
    : null;

  useEffect(() => {
    if (!showFinalClassification) {
      setIsResultsDialogOpen(false);
      return;
    }
    if (!sessionResult.isError) {
      setIsResultsDialogOpen(true);
    }
  }, [showFinalClassification, sessionResult.isError]);

  useKeyboardShortcuts({
    lapStarts: lapMarks,
    durationMs: playbackDurationMs,
    enabled: sessionKey !== null,
  });

  const toggleFocus = (num: number) => {
    if (focusDriver === null) {
      setFocusDriver(num);
      setCompareDriver(null);
      return;
    }
    if (focusDriver === num) {
      setFocusDriver(null);
      setCompareDriver(null);
      return;
    }
    if (compareDriver === num) {
      setCompareDriver(null);
      return;
    }
    setCompareDriver(num);
  };

  const clearFocusSelection = () => {
    setFocusDriver(null);
    setCompareDriver(null);
  };

  const {
    height: strategyHeight,
    handleProps: strategyHandleProps,
    reset: resetStrategyHeight,
  } = useVerticalResize({ initialHeight: 120, minHeight: 48, maxHeight: 340 });

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
      focusDriverLap={mapShowDriverHud ? focusDriverLap : null}
      leaderboard={mapShowLeaderboard ? mapLeaderboard : undefined}
      activeSectorFlag={mapShowSectorFlags ? activeSectorFlag : null}
      activeTrackVehicles={activeTrackVehicles}
      retiredDrivers={retiredDrivers}
      onSelectDriver={toggleFocus}
    />
  );

  // ── View layouts ─────────────────────────────────────────────────────────────

  return (
    <div className="flex flex-col relative md:h-full md:overflow-hidden">
      {/* Flag banner — spans full width below nav */}
      {sessionStartMs > 0 && (
        <FlagBanner
          entries={raceControl.data ?? []}
          sessionTimeMs={t}
          sessionStartMs={sessionStartMs}
          isRaceSession={isRaceSession}
          lightsOutMs={lightsOutMs}
        />
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
          {/* Loading indicator */}
          {isLoadingSessionData && (
            <div className="text-f1red text-[10px] px-4 py-1 animate-pulse border-b border-panel bg-track">
              Loading session data…
            </div>
          )}

          {/* Full-width timing tower — fills remaining vertical space */}
          <div className="flex flex-col md:flex-1 md:min-h-0 md:overflow-hidden">
            {positions.isError ? (
              <ErrorMessage message="Failed to load timing data" />
            ) : (
              leaderboardTower
            )}
          </div>

          {/* Drag handle */}
          <ResizeHandle
            {...strategyHandleProps}
            onDoubleClick={resetStrategyHeight}
          />

          {/* Strategy strip — height controlled by drag */}
          <div
            className={`${PANEL} shrink-0 flex flex-col overflow-hidden`}
            style={{ height: strategyHeight }}
          >
            <div className={`${PANEL_TITLE} shrink-0`}>Tyre Strategy</div>
            <div className="flex-1 min-h-0 overflow-auto">
              <StrategyBar
                stints={stints.data ?? []}
                drivers={drivers.data ?? []}
                laps={laps.data ?? []}
                pits={pits.data ?? []}
                sessionTimeMs={t}
                sessionStartMs={sessionStartMs}
              />
            </div>
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
            isRaceSession={isRaceSession}
            lightsOutMs={lightsOutMs}
            totalLapCount={totalLapCount}
            onShowResults={
              showFinalClassification && !sessionResult.isError
                ? () => setIsResultsDialogOpen(true)
                : undefined
            }
          />
          <div className="flex flex-col md:flex-1 md:min-h-0 md:overflow-hidden relative">
            {/* Toast overlay — covers both mobile and desktop tracker content */}
            <EventToastStack
              toasts={toasts}
              drivers={drivers.data ?? []}
              onDismiss={dismiss}
            />

            {/* Phone layout: tab-switched (md:hidden) */}
            <div className="md:hidden flex flex-col w-full">
              {/* Tab chips */}
              <div className="flex border-b border-panel shrink-0 bg-track">
                {(
                  [
                    ["timing", "Timing"],
                    ["map", "Map"],
                    ["chart", "Chart"],
                    ["gap", "Gap"],
                  ] as [TrackerTab, string][]
                ).map(([tab, label]) => (
                  <button
                    key={tab}
                    onClick={() => setTrackerTab(tab)}
                    className={`${tab === "timing" ? "flex-[1.2]" : "flex-1"} py-1.5 text-[10px] font-bold uppercase tracking-wider transition-colors ${
                      (trackerTab ?? "timing") === tab
                        ? "text-white border-b-2 border-f1red -mb-px"
                        : "text-muted hover:text-white border-b-2 border-transparent"
                    }`}
                  >
                    {label}
                  </button>
                ))}
              </div>

              {/* Tab content */}
              <div className="flex flex-col md:flex-1 md:min-h-0 md:overflow-hidden">
                {(trackerTab ?? "timing") === "timing" && (
                  <>
                    {/* Weather accordion */}
                    <div className="shrink-0 border-b border-panel">
                      {weather.isError ? (
                        <ErrorMessage
                          message="Failed to load weather"
                          compact
                        />
                      ) : (
                        <WeatherPanel
                          entries={weather.data ?? []}
                          sessionTimeMs={t}
                          sessionStartMs={sessionStartMs}
                        />
                      )}
                    </div>
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
                          onClearCompare={() => setCompareDriver(null)}
                        />
                      </div>
                    )}
                  </>
                )}

                {(trackerTab ?? "timing") === "map" && (
                  <div className="min-h-[80vw] bg-[#10101a] relative md:flex-1 md:min-w-0">
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
                )}

                {(trackerTab ?? "timing") === "chart" && (
                  <LapChart
                    drivers={drivers.data ?? []}
                    positions={positions.data ?? []}
                    lapStarts={lapMarks}
                    sessionStartMs={sessionStartMs}
                    sessionTimeMs={t}
                  />
                )}

                {(trackerTab ?? "timing") === "gap" && (
                  <GapChart
                    drivers={drivers.data ?? []}
                    intervals={intervals.data ?? []}
                    sessionStartMs={sessionStartMs}
                    sessionTimeMs={t}
                  />
                )}
              </div>
            </div>

            {/* Desktop layout: split panel (hidden md:flex) */}
            <div className="hidden md:flex flex-1 min-h-0 overflow-hidden">
              {/* Left data panel */}
              <div className="md:w-[620px] lg:w-[660px] xl:w-[700px] shrink-0 flex flex-col border-r border-panel overflow-hidden">
                {/* Sub-tabs */}
                <div className="flex border-b border-panel shrink-0">
                  {(
                    [
                      ["timing", "Timing"],
                      ["chart", "Lap Chart"],
                      ["gap", "Gap Chart"],
                    ] as [TrackerTab, string][]
                  ).map(([tab, label]) => (
                    <button
                      key={tab}
                      onClick={() => setTrackerTab(tab)}
                      className={`${tab === "timing" ? "flex-[1.2]" : "flex-1"} py-1.5 text-[10px] font-bold uppercase tracking-wider transition-colors ${
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
                  {(trackerTab ?? "timing") === "chart" && (
                    <LapChart
                      drivers={drivers.data ?? []}
                      positions={positions.data ?? []}
                      lapStarts={lapMarks}
                      sessionStartMs={sessionStartMs}
                      sessionTimeMs={t}
                    />
                  )}
                  {(trackerTab ?? "timing") === "gap" && (
                    <GapChart
                      drivers={drivers.data ?? []}
                      intervals={intervals.data ?? []}
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
                      onClearCompare={() => setCompareDriver(null)}
                    />
                  </div>
                )}

                {/* Weather strip */}
                <div className={`shrink-0 border-t border-panel`}>
                  {weather.isError ? (
                    <ErrorMessage message="Failed to load weather" compact />
                  ) : (
                    <WeatherPanel
                      entries={weather.data ?? []}
                      sessionTimeMs={t}
                      sessionStartMs={sessionStartMs}
                    />
                  )}
                </div>
              </div>

              {/* Track map — fills remaining width */}
              <div className="flex-1 min-w-0 bg-[#10101a] relative">
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
      )}

      {/* ── COMMENTARY VIEW ───────────────────────────────────────────── */}
      {currentView === "commentary" && (
        <div className="flex flex-col md:flex-1 md:min-h-0 md:overflow-hidden">
          {/* Compact weather strip */}
          <div className="shrink-0 border-b border-panel">
            {weather.isError ? (
              <ErrorMessage message="Failed to load weather" compact />
            ) : (
              <WeatherPanel
                entries={weather.data ?? []}
                sessionTimeMs={t}
                sessionStartMs={sessionStartMs}
              />
            )}
          </div>

          {/* Sub-tabs */}
          <div className="flex border-b border-panel shrink-0 bg-track overflow-x-auto">
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
                className={`shrink-0 px-4 py-2 text-[11px] font-bold uppercase tracking-wider transition-colors border-b-2 ${
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

          {/* Content */}
          <div className="flex flex-col md:flex-1 md:min-h-0 md:overflow-hidden">
            {(commentaryTab ?? "rc") === "rc" &&
              (raceControl.isError ? (
                <ErrorMessage message="Failed to load race control" />
              ) : (
                <RaceControlFeed
                  entries={raceControl.data ?? []}
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

      {/* Playback bar — always visible */}
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
        countdownMs={countdownMs}
        qualiPhase={qualiPhase}
      />
    </div>
  );
}
