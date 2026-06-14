import { useEffect, useMemo } from "react";
import { PlaybackBar } from "@/components/PlaybackBar";
import { TrackMap } from "@/components/TrackMap/TrackMap";
import { LiveTiming } from "@/components/LiveTiming/LiveTiming";
import { RaceControlFeed } from "@/components/RaceControl/RaceControl";
import { WeatherPanel } from "@/components/Weather/WeatherPanel";
import { StrategyBar } from "@/components/Strategy/StrategyBar";
import { TeamRadioFeed } from "@/components/TeamRadio/TeamRadio";
import { OvertakeFeed } from "@/components/Overtakes/OvertakeFeed";
import { FocusedTelemetry } from "@/components/FocusedTelemetry/FocusedTelemetry";
import { LapChart } from "@/components/LapChart/LapChart";
import { FlagBanner } from "@/components/FlagBanner";
import { SessionInfoBar } from "@/components/SessionInfoBar";
import { ErrorMessage } from "@/components/ErrorMessage";
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
} from "@/hooks/useSession";
import { useTimeline } from "@/timeline/clock";
import { useCoarseTime } from "@/hooks/useCoarseTime";
import { useLocationChunks, chunkIndexFor } from "@/hooks/useLocationChunks";
import { useNumberParam, useStringParam } from "@/hooks/useSearchParamState";
import { useTimelineUrlSync } from "@/hooks/useTimelineUrlSync";
import { useKeyboardShortcuts } from "@/hooks/useKeyboardShortcuts";
import {
  lapStartTimes,
  pitTimes,
  flagTimes,
  overtakeTimes,
} from "@/timeline/events";
import { isSessionLive } from "@/utils/live";
import { DEFAULT_YEAR, DEFAULT_SESSION_MS } from "@/constants";
import type { MainView } from "@/components/Nav";
import type { Stint } from "@/api/types";

// Sub-tab options per view
type TrackerTab = "timing" | "chart" | "map";
type CommentaryTab = "rc" | "radio" | "passes";

const PANEL = "bg-surface border border-panel";
const PANEL_TITLE =
  "text-[10px] font-bold text-muted px-3 py-2 border-b border-[#38383f] uppercase tracking-[0.12em] border-l-2 border-l-f1red bg-track";
const OVERTAKE_PULSE_MS = 4_000;

export default function RaceWeekend() {
  // Session selection is driven by the URL — Nav writes these, we just read them
  const [yearParam] = useNumberParam("year", DEFAULT_YEAR);
  const year = yearParam ?? DEFAULT_YEAR;
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
  );

  const lapMarks = useMemo(
    () => lapStartTimes(laps.data ?? [], sessionStartMs),
    [laps.data, sessionStartMs],
  );
  const pitMarks = useMemo(
    () => pitTimes(pits.data ?? [], sessionStartMs),
    [pits.data, sessionStartMs],
  );
  const flagMarks = useMemo(
    () => flagTimes(raceControl.data ?? [], sessionStartMs),
    [raceControl.data, sessionStartMs],
  );
  const overtakeMarks = useMemo(
    () => overtakeTimes(overtakes.data ?? [], sessionStartMs),
    [overtakes.data, sessionStartMs],
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

  // Current tyre compound + age per driver at the playhead.
  // Rebuilds when lap/stint data arrives or when the coarse time crosses a lap boundary.
  const activeCompounds = useMemo(() => {
    const result = new Map<number, { compound: Stint["compound"]; age: number }>();
    if (!laps.data?.length || !stints.data?.length || !sessionStartMs) return result;
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
    const latest = new Map<number, { ms: number; interval: number | string | null }>();
    for (const iv of intervals.data) {
      const ms = new Date(iv.date).getTime();
      if (ms > cutoffMs) continue;
      const prev = latest.get(iv.driver_number);
      if (!prev || ms > prev.ms) latest.set(iv.driver_number, { ms, interval: iv.interval });
    }
    for (const [num, { interval }] of latest) {
      if (typeof interval === "number" && interval <= 1.0) result.add(num);
    }
    return result;
  }, [intervals.data, sessionStartMs, t]);

  const effectiveDuration = durationMs || DEFAULT_SESSION_MS;
  useKeyboardShortcuts({
    lapStarts: lapMarks,
    durationMs: effectiveDuration,
    enabled: sessionKey !== null,
  });

  const toggleFocus = (num: number) =>
    setFocusDriver(focusDriver === num ? null : num);

  // ── Shared sub-components ────────────────────────────────────────────────────

  const timingTower = (
    <LiveTiming
      drivers={drivers.data ?? []}
      positions={positions.data ?? []}
      intervals={intervals.data ?? []}
      pits={pits.data ?? []}
      laps={laps.data ?? []}
      stints={stints.data ?? []}
      grid={grid.data ?? []}
      sessionTimeMs={t}
      sessionStartMs={sessionStartMs}
      isLoading={positions.isPending && sessionKey !== null}
      selectedDriver={focusDriver}
      onSelectDriver={toggleFocus}
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
      activeCompounds={activeCompounds}
      battlingDrivers={battlingDrivers}
    />
  );

  // ── View layouts ─────────────────────────────────────────────────────────────

  return (
    <div className="flex flex-col h-full overflow-hidden">
      {/* Flag banner — spans full width below nav */}
      {sessionStartMs > 0 && (
        <FlagBanner
          entries={raceControl.data ?? []}
          sessionTimeMs={t}
          sessionStartMs={sessionStartMs}
        />
      )}

      {/* ── LEADERBOARD VIEW ──────────────────────────────────────────── */}
      {currentView === "leaderboard" && (
        <div className="flex-1 min-h-0 flex flex-col overflow-hidden">
          {/* Loading indicator */}
          {isLoadingSessionData && (
            <div className="text-f1red text-[10px] px-4 py-1 animate-pulse border-b border-panel bg-track">
              Loading session data…
            </div>
          )}

          {/* Full-width timing tower */}
          <div className="flex-1 min-h-0 overflow-hidden">
            {positions.isError ? (
              <ErrorMessage message="Failed to load timing data" />
            ) : (
              timingTower
            )}
          </div>

          {/* Strategy strip */}
          <div className={`${PANEL} shrink-0 max-h-24 sm:max-h-40`}>
            <div className={PANEL_TITLE}>Tyre Strategy</div>
            <div className="overflow-auto" style={{ maxHeight: 120 }}>
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
        <div className="flex-1 min-h-0 flex flex-col overflow-hidden">
          <SessionInfoBar
            laps={laps.data ?? []}
            raceControl={raceControl.data ?? []}
            sessionTimeMs={t}
            sessionStartMs={sessionStartMs}
          />
          <div className="flex-1 min-h-0 flex flex-col md:flex overflow-hidden">
            {/* Phone layout: tab-switched (md:hidden) */}
            <div className="md:hidden flex-1 min-h-0 flex flex-col overflow-hidden w-full">
              {/* Tab chips */}
              <div className="flex border-b border-panel shrink-0 bg-track">
                {(
                  [
                    ["timing", "Timing"],
                    ["map", "Map"],
                    ["chart", "Chart"],
                  ] as [TrackerTab, string][]
                ).map(([tab, label]) => (
                  <button
                    key={tab}
                    onClick={() => setTrackerTab(tab)}
                    className={`flex-1 py-1.5 text-[10px] font-bold uppercase tracking-wider transition-colors ${
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
              <div className="flex-1 min-h-0 flex flex-col overflow-hidden">
                {(trackerTab ?? "timing") === "timing" && (
                  <>
                    {/* Weather accordion */}
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
                    {/* Timing tower */}
                    <div className="flex-1 min-h-0 overflow-hidden">
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
                          sessionStartMs={sessionStartMs}
                          onClear={() => setFocusDriver(null)}
                        />
                      </div>
                    )}
                  </>
                )}

                {(trackerTab ?? "timing") === "map" && (
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
              </div>
            </div>

            {/* Desktop layout: split panel (hidden md:flex) */}
            <div className="hidden md:flex flex-1 min-h-0 overflow-hidden">
              {/* Left data panel */}
              <div className="md:w-[480px] shrink-0 flex flex-col border-r border-panel overflow-hidden">
                {/* Sub-tabs */}
                <div className="flex border-b border-panel shrink-0">
                  {(
                    [
                      ["timing", "Timing"],
                      ["chart", "Lap Chart"],
                    ] as [TrackerTab, string][]
                  ).map(([tab, label]) => (
                    <button
                      key={tab}
                      onClick={() => setTrackerTab(tab)}
                      className={`flex-1 py-1.5 text-[10px] font-bold uppercase tracking-wider transition-colors ${
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
                <div className="flex-1 min-h-0 overflow-hidden">
                  {(trackerTab ?? "timing") === "timing" ? (
                    positions.isError ? (
                      <ErrorMessage message="Failed to load timing data" />
                    ) : (
                      timingTower
                    )
                  ) : (
                    <LapChart
                      drivers={drivers.data ?? []}
                      positions={positions.data ?? []}
                      lapStarts={lapMarks}
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
                      sessionStartMs={sessionStartMs}
                      onClear={() => setFocusDriver(null)}
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
        <div className="flex-1 min-h-0 flex flex-col overflow-hidden">
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
          <div className="flex border-b border-panel shrink-0 bg-track">
            {(
              [
                ["rc", "Race Control"],
                ["radio", "Team Radio"],
                ["passes", "Overtakes"],
              ] as [CommentaryTab, string][]
            ).map(([tab, label]) => (
              <button
                key={tab}
                onClick={() => setCommentaryTab(tab)}
                className={`px-5 py-2 text-[11px] font-bold uppercase tracking-wider transition-colors border-b-2 ${
                  (commentaryTab ?? "rc") === tab
                    ? "text-white border-f1red -mb-px"
                    : "text-muted border-transparent hover:text-white"
                }`}
              >
                {label}
              </button>
            ))}
          </div>

          {/* Content */}
          <div className="flex-1 min-h-0 overflow-hidden">
            {(commentaryTab ?? "rc") === "rc" &&
              (raceControl.isError ? (
                <ErrorMessage message="Failed to load race control" />
              ) : (
                <RaceControlFeed
                  entries={raceControl.data ?? []}
                  sessionTimeMs={t}
                  sessionStartMs={sessionStartMs}
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
          </div>
        </div>
      )}

      {/* Playback bar — always visible */}
      <PlaybackBar
        durationMs={effectiveDuration}
        lapStarts={lapMarks}
        pitTimes={pitMarks}
        flagTimes={flagMarks}
        overtakeTimes={overtakeMarks}
      />
    </div>
  );
}
