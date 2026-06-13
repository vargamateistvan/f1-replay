import { useEffect, useMemo } from 'react'
import { SessionPicker } from '@/components/SessionPicker'
import { PlaybackBar } from '@/components/PlaybackBar'
import { TrackMap } from '@/components/TrackMap/TrackMap'
import { LiveTiming } from '@/components/LiveTiming/LiveTiming'
import { RaceControlFeed } from '@/components/RaceControl/RaceControl'
import { WeatherPanel } from '@/components/Weather/WeatherPanel'
import { StrategyBar } from '@/components/Strategy/StrategyBar'
import { TeamRadioFeed } from '@/components/TeamRadio/TeamRadio'
import { FocusedTelemetry } from '@/components/FocusedTelemetry/FocusedTelemetry'
import { LapChart } from '@/components/LapChart/LapChart'
import { ErrorMessage } from '@/components/ErrorMessage'
import {
  useDrivers, usePositions, useIntervals,
  useStints, useLaps, useRaceControl,
  useWeather, useSessions, usePits, useTeamRadio,
  useStartingGrid,
} from '@/hooks/useSession'
import { useTimeline } from '@/timeline/clock'
import { useLocationChunks, chunkIndexFor } from '@/hooks/useLocationChunks'
import { useNumberParam, useStringParam } from '@/hooks/useSearchParamState'
import { useTimelineUrlSync } from '@/hooks/useTimelineUrlSync'
import { useKeyboardShortcuts } from '@/hooks/useKeyboardShortcuts'
import { lapStartTimes, pitTimes, flagTimes } from '@/timeline/events'
import { isSessionLive } from '@/utils/live'
import { DEFAULT_YEAR } from '@/constants'

const PANEL = 'bg-surface border border-panel'
const PANEL_TITLE = 'text-[10px] font-bold text-muted px-3 py-2 border-b border-[#38383f] uppercase tracking-[0.12em] border-l-2 border-l-f1red bg-track'

type RightTab = 'rc' | 'radio'
type MainView = 'map' | 'laps'

export default function RaceWeekend() {
  const [yearParam, setYear] = useNumberParam('year', DEFAULT_YEAR)
  const year = yearParam ?? DEFAULT_YEAR
  const [meetingKey, setMeetingKey] = useNumberParam('meeting', null)
  const [sessionKey, setSessionKey] = useNumberParam('session', null)
  const [rightTab, setRightTab] = useStringParam<RightTab>('tab', 'rc')
  const [mainView, setMainView] = useStringParam<MainView>('view', 'map')
  const [focusDriver, setFocusDriver] = useNumberParam('focus', null)

  const sessions = useSessions(meetingKey)
  const session = sessions.data?.find((s) => s.session_key === sessionKey)
  const live = isSessionLive(session)

  const drivers = useDrivers(sessionKey)
  const positions = usePositions(sessionKey, live)
  const intervals = useIntervals(sessionKey, live)
  const stints = useStints(sessionKey)
  const laps = useLaps(sessionKey, undefined, live)
  const pits = usePits(sessionKey)
  const grid = useStartingGrid(sessionKey)
  const raceControl = useRaceControl(sessionKey, live)
  const teamRadio = useTeamRadio(sessionKey, live)
  const weather = useWeather(sessionKey, live)

  const { t, setSessionStart } = useTimeline()

  const sessionStartMs = session ? new Date(session.date_start).getTime() : 0
  const sessionEndMs = session ? new Date(session.date_end).getTime() : 0
  const durationMs = sessionEndMs - sessionStartMs

  useEffect(() => {
    if (sessionStartMs) setSessionStart(sessionStartMs)
  }, [sessionStartMs, setSessionStart])

  // Persist playhead + speed to the URL and restore from a shared link
  useTimelineUrlSync(sessionKey, sessionStartMs > 0)

  const isLoadingSessionData =
    sessionKey !== null &&
    (drivers.isPending || positions.isPending || intervals.isPending)

  // Location chunks for track animation — fetches the 5-min window around current t
  const chunkIdx = chunkIndexFor(t)
  const location = useLocationChunks(sessionKey, sessionStartMs || null, chunkIdx)

  // Jump-to-event markers (session-relative ms)
  const lapMarks = useMemo(
    () => lapStartTimes(laps.data ?? [], sessionStartMs),
    [laps.data, sessionStartMs],
  )
  const pitMarks = useMemo(
    () => pitTimes(pits.data ?? [], sessionStartMs),
    [pits.data, sessionStartMs],
  )
  const flagMarks = useMemo(
    () => flagTimes(raceControl.data ?? [], sessionStartMs),
    [raceControl.data, sessionStartMs],
  )

  const effectiveDuration = durationMs || 7_200_000
  useKeyboardShortcuts({
    lapStarts: lapMarks,
    durationMs: effectiveDuration,
    enabled: sessionKey !== null,
  })

  const toggleFocus = (num: number) => setFocusDriver(focusDriver === num ? null : num)

  return (
    <div className="flex flex-col h-full overflow-hidden">
      <SessionPicker
        year={year}
        meetingKey={meetingKey}
        sessionKey={sessionKey}
        onYear={(y) => { setYear(y); setMeetingKey(null); setSessionKey(null) }}
        onMeeting={(k) => { setMeetingKey(k); setSessionKey(null) }}
        onSession={setSessionKey}
      />

      {/* Main area: flex-col on mobile, 2-col grid on md+ */}
      <div className="flex-1 min-h-0 flex flex-col md:grid md:grid-cols-[1fr_280px] md:grid-rows-[1fr_160px] gap-2 p-2 overflow-auto md:overflow-hidden">

        {/* Track map / lap chart */}
        <div className={`${PANEL} flex flex-col min-h-[280px] md:min-h-0`}>
          <div className={`${PANEL_TITLE} flex items-center`}>
            <div className="flex gap-px">
              {(['map', 'laps'] as MainView[]).map((v) => (
                <button
                  key={v}
                  onClick={() => setMainView(v)}
                  className={`px-2 py-0.5 text-[10px] font-bold uppercase tracking-[0.12em] transition-colors ${
                    mainView === v ? 'text-white' : 'text-[#636369] hover:text-muted'
                  }`}
                >
                  {v === 'map' ? 'Track' : 'Lap Chart'}
                </button>
              ))}
            </div>
            {session && (
              <span className="ml-2 normal-case font-normal text-white">
                {session.circuit_short_name} · {session.session_name}
              </span>
            )}
            {live && (
              <span className="ml-2 inline-flex items-center gap-1 text-red-400 font-bold">
                <span className="w-1.5 h-1.5 rounded-full bg-red-500 animate-pulse" />
                LIVE
              </span>
            )}
            {isLoadingSessionData && (
              <span className="ml-2 text-f1red animate-pulse">Loading…</span>
            )}
          </div>
          <div className="flex-1 min-h-0">
            {(() => {
              if (drivers.isError) return <ErrorMessage message="Failed to load driver data" />
              if (mainView === 'laps') {
                return (
                  <LapChart
                    drivers={drivers.data ?? []}
                    positions={positions.data ?? []}
                    lapStarts={lapMarks}
                    sessionStartMs={sessionStartMs}
                    sessionTimeMs={t}
                  />
                )
              }
              return (
                <TrackMap
                  sessionKey={sessionKey}
                  drivers={drivers.data ?? []}
                  locationData={location.data}
                  sessionStartMs={sessionStartMs}
                  focusDriver={focusDriver}
                />
              )
            })()}
          </div>
          {/* Focused-driver live telemetry readout */}
          {focusDriver !== null && (
            <FocusedTelemetry
              sessionKey={sessionKey}
              driver={drivers.data?.find((d) => d.driver_number === focusDriver) ?? null}
              sessionStartMs={sessionStartMs}
              onClear={() => setFocusDriver(null)}
            />
          )}
        </div>

        {/* Right column */}
        <div className="flex flex-col gap-2 min-h-0">

          {/* Live timing — tall, scrollable */}
          <div className={`${PANEL} flex flex-col md:flex-[3] min-h-[200px] md:min-h-0`}>
            <div className={PANEL_TITLE}>Live Timing</div>
            <div className="flex-1 overflow-hidden">
              {positions.isError ? (
                <ErrorMessage message="Failed to load timing data" />
              ) : (
                <LiveTiming
                  drivers={drivers.data ?? []}
                  positions={positions.data ?? []}
                  intervals={intervals.data ?? []}
                  pits={pits.data ?? []}
                  laps={laps.data ?? []}
                  grid={grid.data ?? []}
                  sessionTimeMs={t}
                  sessionStartMs={sessionStartMs}
                  isLoading={positions.isPending && sessionKey !== null}
                  selectedDriver={focusDriver}
                  onSelectDriver={toggleFocus}
                />
              )}
            </div>
          </div>

          {/* Weather — fixed small strip */}
          <div className={`${PANEL} shrink-0`}>
            <div className={PANEL_TITLE}>Weather</div>
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

          {/* Tabbed: Race Control | Team Radio */}
          <div className={`${PANEL} flex flex-col md:flex-[2] min-h-[180px] md:min-h-0`}>
            <div className="flex border-b border-panel">
              {(['rc', 'radio'] as RightTab[]).map((tab) => (
                <button
                  key={tab}
                  onClick={() => setRightTab(tab)}
                  className={`flex-1 text-xs py-1 px-2 uppercase tracking-wider font-bold transition-colors ${
                    rightTab === tab
                      ? 'text-white border-b-2 border-f1red -mb-px'
                      : 'text-muted hover:text-white'
                  }`}
                >
                  {tab === 'rc' ? 'Race Control' : 'Team Radio'}
                </button>
              ))}
            </div>
            <div className="flex-1 overflow-hidden">
              {rightTab === 'rc' ? (
                raceControl.isError ? (
                  <ErrorMessage message="Failed to load race control" />
                ) : (
                  <RaceControlFeed
                    entries={raceControl.data ?? []}
                    sessionTimeMs={t}
                    sessionStartMs={sessionStartMs}
                  />
                )
              ) : (
                teamRadio.isError ? (
                  <ErrorMessage message="Failed to load team radio" />
                ) : (
                  <TeamRadioFeed
                    entries={teamRadio.data ?? []}
                    drivers={drivers.data ?? []}
                    sessionTimeMs={t}
                    sessionStartMs={sessionStartMs}
                  />
                )
              )}
            </div>
          </div>
        </div>

        {/* Strategy strip — spans both columns on desktop */}
        <div className={`${PANEL} flex flex-col md:col-span-2`}>
          <div className={PANEL_TITLE}>Tyre Strategy</div>
          <div className="flex-1 overflow-auto">
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

      {/* Playback bar */}
      <PlaybackBar
        durationMs={effectiveDuration}
        lapStarts={lapMarks}
        pitTimes={pitMarks}
        flagTimes={flagMarks}
      />
    </div>
  )
}
