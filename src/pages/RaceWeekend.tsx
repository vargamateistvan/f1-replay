import { useEffect } from "react";
import {
  RaceWeekendFooterPlayback,
  RaceWeekendMobilePlayback,
  type SharedPlaybackBarProps,
} from "@/components/PlaybackBar/RaceWeekendPlayback";
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
import { useLocationChunks } from "@/hooks/useLocationChunks";
import { useNumberParam, useStringParam } from "@/hooks/useSearchParamState";
import { useTimelineUrlSync } from "@/hooks/useTimelineUrlSync";
import { useKeyboardShortcuts } from "@/hooks/useKeyboardShortcuts";
import { useSettings } from "@/stores/settings";
import { isQualiSession } from "@/utils/session";
import { trackEvent } from "@/lib/analytics";
import { RaceWeekendSessionHeaderAdapter } from "./raceWeekend/RaceWeekendSessionHeaderAdapter";
import { type TrackerTab } from "./raceWeekend/TrackerTabBar";
import { TrackerStrategyPanel } from "./raceWeekend/TrackerStrategyPanel";
import { TrackerTimingTower } from "./raceWeekend/TrackerTimingTower";
import { LeaderboardTimingTower } from "./raceWeekend/LeaderboardTimingTower";
import { RaceWeekendLeaderboardSectionAdapter } from "./raceWeekend/RaceWeekendLeaderboardSectionAdapter";
import { TrackerFocusedTelemetryContent } from "./raceWeekend/TrackerFocusedTelemetryContent";
import { TrackerSectionAdapter } from "./raceWeekend/TrackerSectionAdapter";
import { TrackerMapContent } from "./raceWeekend/TrackerMapContent";
import { TrackerMobileMapContent } from "./raceWeekend/TrackerMobileMapContent";
import {
  TrackerGapChartPanel,
  TrackerLapChartPanel,
} from "./raceWeekend/TrackerTrendPanels";
import {
  useCommentaryInteractions,
  type CommentaryTimeMode,
} from "./raceWeekend/useCommentaryInteractions";
import { useIncidentReplayControls } from "./raceWeekend/useIncidentReplayControls";
import { useTrackerDesktopResize } from "./raceWeekend/useTrackerDesktopResize";
import {
  TrackerDesktopTimingContent,
  TrackerMobileTimingContent,
} from "./raceWeekend/TrackerTimingPanels";
import { RaceWeekendOverlaysAdapter } from "./raceWeekend/RaceWeekendOverlaysAdapter";
import { RaceWeekendMainViewsAdapter } from "./raceWeekend/RaceWeekendMainViewsAdapter";
import { RaceWeekendTopOverlaysAdapter } from "./raceWeekend/RaceWeekendTopOverlaysAdapter";
import { useRaceWeekendPlaybackState } from "./raceWeekend/useRaceWeekendPlaybackState";
import { useCommentaryDerivedState } from "./raceWeekend/useCommentaryDerivedState";
import { useRaceWeekendFocusSelection } from "./raceWeekend/useRaceWeekendFocusSelection";
import { useTrackerTimingConfig } from "./raceWeekend/useTrackerTimingConfig";
import { useRaceWeekendCarDataAtT } from "./raceWeekend/useRaceWeekendCarDataAtT";
import { useRaceWeekendTrackState } from "./raceWeekend/useRaceWeekendTrackState";
import { useRaceWeekendToasts } from "./raceWeekend/useRaceWeekendToasts";
import { useRaceWeekendRaceControlState } from "./raceWeekend/useRaceWeekendRaceControlState";
import { useRaceWeekendMapDerivedState } from "./raceWeekend/useRaceWeekendMapDerivedState";
import { useRaceWeekendTimelineMarks } from "./raceWeekend/useRaceWeekendTimelineMarks";
import { useRaceWeekendSessionTimeline } from "./raceWeekend/useRaceWeekendSessionTimeline";
import { useRaceWeekendViewState } from "./raceWeekend/useRaceWeekendViewState";
import { useRaceWeekendOverlayDialogs } from "./raceWeekend/useRaceWeekendOverlayDialogs";
import { useRaceWeekendPlaybackBarProps } from "./raceWeekend/useRaceWeekendPlaybackBarProps";
import { RaceWeekendCommentaryViewAdapter } from "./raceWeekend/RaceWeekendCommentaryViewAdapter";
import { useRaceWeekendSessionMeta } from "./raceWeekend/useRaceWeekendSessionMeta";
import type { MainView } from "@/components/Nav";
import type { CommentaryTab } from "@/components/CommentaryPanels/CommentaryPanels";

// Sub-tab options per view
const OVERTAKE_PULSE_MS = 4_000;

export default function RaceWeekend() {
  const {
    trackerDesktopSplitRef,
    trackerDesktopPanelWidth,
    trackerDesktopResizeHandleProps,
  } = useTrackerDesktopResize();
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
  const sessions = useSessions(meetingKey);

  const {
    session,
    live,
    sessionStartMs,
    durationMs,
    isRaceSession,
    sessionName,
  } = useRaceWeekendSessionMeta({
    sessions: sessions.data ?? [],
    sessionKey,
  });

  function handleTrackerTabChange(
    tab: TrackerTab,
    source: "mobile" | "desktop",
  ) {
    trackEvent("raceweekend_tracker_tab_changed", {
      tab,
      source,
    });
    setTrackerTab(tab);
  }

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

  const { timedLaps, timedOvertakes, timedTeamRadio, lightsOutMs } =
    useRaceWeekendSessionTimeline({
      laps: laps.data ?? [],
      overtakes: overtakes.data ?? [],
      teamRadio: teamRadio.data ?? [],
      sessionStartMs,
    });

  const {
    timedRaceControl,
    trackVehicleStateTimeline,
    raceControlMarkers,
    markerSummary,
    incidentWindows,
    chequeredMs,
    nextReplayIncident,
    currentReplayIncident,
    firstReplayIncident,
  } = useRaceWeekendRaceControlState({
    raceControlEntries: raceControl.data ?? [],
    sessionStartMs,
    sessionTimeMsSlow: tSlow,
  });

  useEffect(() => {
    if (sessionStartMs) setSessionStart(sessionStartMs);
  }, [sessionStartMs, setSessionStart]);

  useTimelineUrlSync(sessionKey, sessionStartMs > 0);

  const {
    isLoadingSessionData,
    isLoadingEventSession,
    locationChunkIdx,
    telemetryChunkIdx,
    isMapVisible,
    shouldPrefetchMapChunks,
    shouldTrackToasts,
    shouldBuildToastEvents,
  } = useRaceWeekendViewState({
    sessionKey,
    meetingKey,
    sessionsPending: sessions.isPending,
    driversPending: drivers.isPending,
    positionsPending: positions.isPending,
    intervalsPending: intervals.isPending,
    currentView,
    activeTrackerTab,
    isCompactViewport,
    playbackSpeed,
    sessionTimeMs: t,
  });
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

  const {
    lapMarks,
    currentLap,
    pitMarks,
    flagMarks,
    safetyCarMarks,
    overtakeMarks,
    radioMarks,
    keyMomentMarks,
  } = useRaceWeekendTimelineMarks({
    laps: laps.data ?? [],
    pits: pits.data ?? [],
    raceControl: raceControl.data ?? [],
    overtakes: overtakes.data ?? [],
    teamRadio: teamRadio.data ?? [],
    sessionStartMs,
    sessionTimeMs: t,
  });

  const {
    setIncidentReplayEndMs,
    incidentReplayHint,
    replayCurrentIncident,
    replayNextIncident,
  } = useIncidentReplayControls({
    sessionKey,
    sessionTimeMs: t,
    currentReplayIncident,
    nextReplayIncident,
    firstReplayIncident,
    setTimelineT,
    setTimelinePlaying,
  });

  const {
    pulseDrivers,
    focusDriverLap,
    compareDriverLap,
    activeCompounds,
    battlingDrivers,
    retiredDrivers,
  } = useRaceWeekendMapDerivedState({
    isMapVisible,
    sessionStartMs,
    sessionTimeMsSlow: tSlow,
    focusDriver,
    compareDriver,
    timedLaps,
    timedOvertakes,
    stints: stints.data ?? [],
    intervals: intervals.data ?? [],
    positions: positions.data ?? [],
    laps: laps.data ?? [],
    raceControl: raceControl.data ?? [],
    isRaceSession,
    overtakePulseMs: OVERTAKE_PULSE_MS,
  });

  const { weatherAtT, activeTrackFlagState, activeTrackVehicles } =
    useRaceWeekendTrackState({
      isMapVisible,
      sessionStartMs,
      sessionTimeMs: t,
      sessionTimeMsSlow: tSlow,
      weatherEntries: weather.data ?? [],
      raceControlEntries: raceControl.data ?? [],
      trackVehicleStateTimeline,
      isRaceSession,
      lightsOutMs,
    });

  const {
    toastsEnabled,
    toastRadio: settingToastRadio,
    toastRadioAutoplay: settingToastRadioAutoplay,
    toastSoundsEnabled,
    toastFlag: settingToastFlag,
    toastInvestigation: settingToastInvestigation,
    toastPenalty: settingToastPenalty,
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

  const {
    trackerTimingTelemetryEnabled,
    telemetryEnabled,
    timingMobileColumns,
    trackerTimingColumns,
  } = useTrackerTimingConfig({
    currentView,
    activeTrackerTab,
    leaderboardTelemetry,
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
  });

  const { carDataAtT } = useRaceWeekendCarDataAtT({
    sessionKey,
    sessionStartMs,
    telemetryChunkIdx,
    telemetryEnabled,
    sessionTimeMs: tSlow,
  });

  // Apply default speed when a new session loads.
  useEffect(() => {
    if (!sessionKey) return;
    useTimeline.getState().setSpeed(defaultSpeed);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [sessionKey]);

  const { toasts, dismiss, catchupSummary, dismissCatchup, toastEvents } =
    useRaceWeekendToasts({
      teamRadioEntries: teamRadio.data ?? [],
      raceControlEntries: raceControl.data ?? [],
      overtakeEntries: overtakes.data ?? [],
      pitEntries: pits.data ?? [],
      laps: laps.data ?? [],
      sessionStartMs,
      sessionTimeMs: t,
      shouldBuildToastEvents,
      shouldTrackToasts,
      toastsEnabled,
      toastRadioEnabled: settingToastRadio,
      toastFlagEnabled: settingToastFlag,
      toastInvestigationEnabled: settingToastInvestigation,
      toastPenaltyEnabled: settingToastPenalty,
      toastOvertakeEnabled: settingToastOvertake,
      toastPitEnabled: settingToastPit,
      toastFastestLapEnabled: settingToastFastestLap,
    });
  const {
    playbackDurationMs,
    showFinalClassification,
    totalLapCount,
    commentaryLapLabel,
    countdownMs,
    qualiPhase,
    qualiPhaseStartTimes,
  } = useRaceWeekendPlaybackState({
    isRaceSession,
    chequeredMs,
    sessionStartMs,
    durationMs,
    sessionTimeMs: t,
    currentLap,
    sessionName,
    timedLaps,
    timedTeamRadio,
    timedRaceControl,
    laps: laps.data ?? [],
    raceControl: raceControl.data ?? [],
    sessionResults: sessionResult.data ?? [],
  });

  const { commentaryTabs } = useCommentaryDerivedState({
    positions: positions.data ?? [],
    toastEvents,
    raceControl: raceControl.data ?? [],
    teamRadio: teamRadio.data ?? [],
    pits: pits.data ?? [],
    overtakes: overtakes.data ?? [],
    drivers: drivers.data ?? [],
    incidentWindowsCount: incidentWindows.length,
    sessionStartMs,
    sessionTimeMs: t,
    commentaryTimeMode,
  });

  const {
    isResultsDialogOpen,
    isQualiEliminationsDialogOpen,
    openResultsDialog,
    closeResultsDialog,
    openQualiEliminationsDialog,
    closeQualiEliminationsDialog,
  } = useRaceWeekendOverlayDialogs({
    showFinalClassification,
    hasSessionResultError: sessionResult.isError,
    sessionName,
    qualiPhase,
  });

  useKeyboardShortcuts({
    lapStarts: lapMarks,
    eventTimes: keyMomentMarks,
    durationMs: playbackDurationMs,
    setView,
    isModalOpen: isHelpOpen || isSettingsOpen,
    onOpenHelp: openHelp,
    enabled: sessionKey !== null,
  });

  const { setFocusSelection, toggleFocus, clearFocusSelection } =
    useRaceWeekendFocusSelection({
      focusDriver,
      setSearchParams,
    });

  const showTrackerInlinePlayback = false;

  // ── Shared sub-components ────────────────────────────────────────────────────

  const timingTower = (
    <TrackerTimingTower
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
      trackerDenseMobileTelemetry={trackerTimingMobileCarData}
      trackerShowInterval={trackerTimingShowInterval}
      trackerColumns={trackerTimingColumns}
      mobileColumns={timingMobileColumns}
      chequeredMs={chequeredMs}
    />
  );

  const leaderboardTower = (
    <LeaderboardTimingTower
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
      mobileColumns={timingMobileColumns}
      chequeredMs={chequeredMs}
    />
  );

  const focusedTelemetryPanel = (
    <TrackerFocusedTelemetryContent
      sessionKey={sessionKey}
      drivers={drivers.data ?? []}
      focusDriver={focusDriver}
      compareDriver={compareDriver}
      sessionStartMs={sessionStartMs}
      focusDriverLap={focusDriverLap}
      compareDriverLap={compareDriverLap}
      onClearFocus={clearFocusSelection}
      onClearCompare={() => {
        if (focusDriver === null) return;
        setFocusSelection(focusDriver, null);
      }}
    />
  );

  const trackMapContent = (
    <TrackerMapContent
      sessionKey={sessionKey}
      drivers={drivers.data ?? []}
      hasDriversError={drivers.isError}
      locationData={location.data}
      sessionStartMs={sessionStartMs}
      focusDriver={focusDriver}
      pulseDrivers={pulseDrivers}
      circuitShortName={session?.circuit_short_name ?? null}
      circuitKey={session?.circuit_key ?? null}
      year={session?.year ?? null}
      activeCompounds={mapShowCompoundBadges ? activeCompounds : undefined}
      battlingDrivers={mapShowBattleRings ? battlingDrivers : undefined}
      retiredDrivers={retiredDrivers}
      focusDriverLap={focusDriverLap}
      weatherOverlay={mapShowWeather ? weatherAtT : null}
      activeTrackFlagState={mapShowSectorFlags ? activeTrackFlagState : null}
      activeTrackVehicles={activeTrackVehicles}
      showSectorBox={mapShowSectorBox}
      showTrackControls={mapShowTrackControls}
      showCompass={mapShowCompass}
      showFocusedHud={mapShowDriverHud}
      showTrackScreenshot={trackScreenshotPngEnabled}
      showEnhancedVisuals={mapShowEnhancedVisuals}
      onSelectDriver={toggleFocus}
    />
  );

  const mobileTimingContent = (
    <TrackerMobileTimingContent
      hasTimingError={positions.isError}
      timingTower={timingTower}
      telemetry={focusedTelemetryPanel}
    />
  );

  const mobileMapContent = (
    <TrackerMobileMapContent
      mapShowWeather={mapShowWeather}
      weatherError={weather.isError}
      weatherEntries={weather.data ?? []}
      sessionKey={sessionKey}
      sessionTimeMs={t}
      sessionStartMs={sessionStartMs}
      toasts={toasts}
      drivers={drivers.data ?? []}
      onDismissToast={dismiss}
      radioAutoplay={settingToastRadioAutoplay}
      soundsEnabled={toastSoundsEnabled}
      maxVisibleToasts={notificationMaxVisible}
      mapContent={trackMapContent}
      isLoadingSessionData={isLoadingSessionData}
    />
  );

  const strategyPanelContent = (
    <TrackerStrategyPanel
      stints={stints.data ?? []}
      drivers={drivers.data ?? []}
      laps={laps.data ?? []}
      pits={pits.data ?? []}
      sessionTimeMs={t}
      sessionStartMs={sessionStartMs}
      currentLap={currentLap}
    />
  );

  const mobileChartContent = (
    <TrackerLapChartPanel
      mobile
      drivers={drivers.data ?? []}
      positions={positions.data ?? []}
      lapStarts={lapMarks}
      sessionStartMs={sessionStartMs}
      sessionTimeMs={t}
      currentLap={currentLap}
    />
  );

  const mobileGapContent = (
    <TrackerGapChartPanel
      mobile
      drivers={drivers.data ?? []}
      intervals={intervals.data ?? []}
      lapStarts={lapMarks}
      currentLap={currentLap}
      sessionStartMs={sessionStartMs}
      sessionTimeMs={t}
    />
  );

  const desktopTimingContent = (
    <TrackerDesktopTimingContent
      hasTimingError={positions.isError}
      timingTower={timingTower}
    />
  );

  const desktopChartContent = (
    <TrackerLapChartPanel
      drivers={drivers.data ?? []}
      positions={positions.data ?? []}
      lapStarts={lapMarks}
      sessionStartMs={sessionStartMs}
      sessionTimeMs={t}
      currentLap={currentLap}
    />
  );

  const desktopGapContent = (
    <TrackerGapChartPanel
      drivers={drivers.data ?? []}
      intervals={intervals.data ?? []}
      lapStarts={lapMarks}
      currentLap={currentLap}
      sessionStartMs={sessionStartMs}
      sessionTimeMs={t}
    />
  );

  const sharedSessionHeader = (
    <RaceWeekendSessionHeaderAdapter
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
      sessionName={sessionName}
      showFinalClassification={showFinalClassification}
      hasSessionResultError={sessionResult.isError}
      onOpenEliminations={openQualiEliminationsDialog}
      onOpenResults={openResultsDialog}
      onJumpToSessionTime={(sessionTimeMs: number) =>
        setTimelineT(sessionTimeMs)
      }
    />
  );

  const sharedPlaybackBarProps: SharedPlaybackBarProps =
    useRaceWeekendPlaybackBarProps({
      durationMs: playbackDurationMs,
      lapStarts: lapMarks,
      pitTimes: pitMarks,
      flagTimes: flagMarks,
      safetyCarTimes: safetyCarMarks,
      overtakeTimes: overtakeMarks,
      radioTimes: radioMarks,
      raceControlMarkers,
      markerSummary,
      canReplayCurrentIncident: currentReplayIncident !== undefined,
      onReplayCurrentIncident: replayCurrentIncident,
      canReplayNextIncident:
        nextReplayIncident !== undefined || firstReplayIncident !== undefined,
      onReplayNextIncident: replayNextIncident,
      incidentReplayHint,
      countdownMs,
      qualiPhase,
      q2StartMs: qualiPhaseStartTimes.q2StartMs,
      q3StartMs: qualiPhaseStartTimes.q3StartMs,
    });

  const trackerMobilePlayback = (
    <RaceWeekendMobilePlayback
      enabled={showTrackerInlinePlayback}
      showSpeedControls={showPlaybackSpeedControls}
      showEventChips={showPlaybackEventChips}
      playbackBarProps={sharedPlaybackBarProps}
    />
  );

  const { handleCommentaryTimeModeToggle, handleCommentaryPlayWindow } =
    useCommentaryInteractions({
      commentaryTimeMode,
      setCommentaryTimeMode,
      setTimelineT,
      setIncidentReplayEndMs,
      setTimelinePlaying,
    });

  const leaderboardView = (
    <RaceWeekendLeaderboardSectionAdapter
      header={sharedSessionHeader}
      isLoadingSessionData={isLoadingSessionData}
      hasPositionsError={positions.isError}
      leaderboardTower={leaderboardTower}
    />
  );

  const trackerView = (
    <TrackerSectionAdapter
      header={sharedSessionHeader}
      activeTab={activeTrackerTab}
      onTrackerTabChange={handleTrackerTabChange}
      toasts={toasts}
      drivers={drivers.data ?? []}
      onDismissToast={dismiss}
      radioAutoplay={settingToastRadioAutoplay}
      soundsEnabled={toastSoundsEnabled}
      maxVisibleToasts={notificationMaxVisible}
      mobilePlayback={trackerMobilePlayback}
      mobileTimingContent={mobileTimingContent}
      mobileMapContent={mobileMapContent}
      strategyContent={strategyPanelContent}
      mobileChartContent={mobileChartContent}
      mobileGapContent={mobileGapContent}
      desktopTimingContent={desktopTimingContent}
      desktopChartContent={desktopChartContent}
      desktopGapContent={desktopGapContent}
      focusedTelemetry={focusedTelemetryPanel}
      desktopSplitRef={trackerDesktopSplitRef}
      desktopPanelWidth={trackerDesktopPanelWidth}
      onDesktopResizeMouseDown={trackerDesktopResizeHandleProps.onMouseDown}
      onDesktopResizeTouchStart={trackerDesktopResizeHandleProps.onTouchStart}
      onDesktopResizeDoubleClick={trackerDesktopResizeHandleProps.onDoubleClick}
      desktopMapContent={trackMapContent}
      isLoadingSessionData={isLoadingSessionData}
    />
  );

  const commentaryView = (
    <RaceWeekendCommentaryViewAdapter
      header={sharedSessionHeader}
      tabs={commentaryTabs}
      commentaryTab={commentaryTab ?? "rc"}
      setCommentaryTab={setCommentaryTab}
      lapLabel={commentaryLapLabel}
      timeMode={commentaryTimeMode}
      onToggleTimeMode={handleCommentaryTimeModeToggle}
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
      focusDriver={focusDriver}
      onClearFocus={clearFocusSelection}
      onPlayWindow={handleCommentaryPlayWindow}
    />
  );

  // ── View layouts ─────────────────────────────────────────────────────────────

  return (
    <div className="relative flex flex-col overflow-x-hidden pb-[calc(7.5rem+env(safe-area-inset-bottom))] md:h-full md:min-h-0 md:flex-1 md:overflow-hidden md:pb-0">
      <RaceWeekendTopOverlaysAdapter
        isLoadingEventSession={isLoadingEventSession}
        showStartingLights={sessionStartMs > 0 && isRaceSession}
        sessionTimeMs={t}
        lightsOutMs={lightsOutMs}
      />

      <RaceWeekendMainViewsAdapter
        currentView={currentView}
        leaderboardView={leaderboardView}
        trackerView={trackerView}
        commentaryView={commentaryView}
      />

      <RaceWeekendOverlaysAdapter
        catchupSummaryEnabled={catchupSummaryEnabled}
        catchupSummary={catchupSummary}
        drivers={drivers.data ?? []}
        onDismissCatchup={dismissCatchup}
        showFinalClassification={showFinalClassification}
        hasSessionResultError={sessionResult.isError}
        showQualifyingBanner={
          sessionStartMs > 0 &&
          isQualiSession(sessionName) &&
          !!qualiPhase &&
          isQualiEliminationsDialogOpen
        }
        qualiPhase={qualiPhase}
        positions={positions.data ?? []}
        sessionTimeMs={t}
        sessionStartMs={sessionStartMs}
        countdownMs={countdownMs}
        onCloseQualifyingBanner={closeQualiEliminationsDialog}
        isResultsDialogOpen={isResultsDialogOpen}
        results={sessionResult.data ?? []}
        sessionName={session?.session_name}
        onCloseResultsDialog={closeResultsDialog}
      />

      <RaceWeekendFooterPlayback
        enabled={!showTrackerInlinePlayback}
        showSpeedControls={showPlaybackSpeedControls}
        showEventChips={showPlaybackEventChips}
        playbackBarProps={sharedPlaybackBarProps}
      />
    </div>
  );
}
