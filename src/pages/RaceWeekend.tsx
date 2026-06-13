import { useState, useEffect } from 'react'
import { SessionPicker } from '@/components/SessionPicker'
import { PlaybackBar } from '@/components/PlaybackBar'
import { TrackMap } from '@/components/TrackMap/TrackMap'
import { LiveTiming } from '@/components/LiveTiming/LiveTiming'
import { RaceControlFeed } from '@/components/RaceControl/RaceControl'
import { WeatherPanel } from '@/components/Weather/WeatherPanel'
import { StrategyBar } from '@/components/Strategy/StrategyBar'
import { TeamRadioFeed } from '@/components/TeamRadio/TeamRadio'
import { ErrorMessage } from '@/components/ErrorMessage'
import {
  useDrivers, usePositions, useIntervals,
  useStints, useLaps, useRaceControl,
  useWeather, useSessions, usePits, useTeamRadio,
} from '@/hooks/useSession'
import { useTimeline } from '@/timeline/clock'
import { useLocationChunks, chunkIndexFor } from '@/hooks/useLocationChunks'
import { isSessionLive } from '@/utils/live'

const PANEL = 'bg-surface rounded border border-panel'
const PANEL_TITLE = 'text-xs font-bold text-muted px-3 py-1 border-b border-panel uppercase tracking-wider'

type RightTab = 'rc' | 'radio'

export default function RaceWeekend() {
  const [year, setYear] = useState(2024)
  const [meetingKey, setMeetingKey] = useState<number | null>(null)
  const [sessionKey, setSessionKey] = useState<number | null>(null)
  const [rightTab, setRightTab] = useState<RightTab>('rc')

  const sessions = useSessions(meetingKey)
  const session = sessions.data?.find((s) => s.session_key === sessionKey)
  const live = isSessionLive(session)

  const drivers = useDrivers(sessionKey)
  const positions = usePositions(sessionKey, live)
  const intervals = useIntervals(sessionKey, live)
  const stints = useStints(sessionKey)
  const laps = useLaps(sessionKey, undefined, live)
  const pits = usePits(sessionKey)
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

  const isLoadingSessionData =
    sessionKey !== null &&
    (drivers.isPending || positions.isPending || intervals.isPending)

  // Location chunks for track animation — fetches the 5-min window around current t
  const chunkIdx = chunkIndexFor(t)
  const location = useLocationChunks(sessionKey, sessionStartMs || null, chunkIdx)

  return (
    <div className="flex flex-col h-full overflow-hidden">
      <SessionPicker
        year={year}
        meetingKey={meetingKey}
        sessionKey={sessionKey}
        onYear={setYear}
        onMeeting={(k) => { setMeetingKey(k); setSessionKey(null) }}
        onSession={setSessionKey}
      />

      {/* Main area: flex-col on mobile, 2-col grid on md+ */}
      <div className="flex-1 min-h-0 flex flex-col md:grid md:grid-cols-[1fr_280px] md:grid-rows-[1fr_160px] gap-2 p-2 overflow-auto md:overflow-hidden">

        {/* Track map */}
        <div className={`${PANEL} flex flex-col min-h-[280px] md:min-h-0`}>
          <div className={PANEL_TITLE}>
            Track
            {session && (
              <span className="ml-1 normal-case font-normal text-white">
                — {session.circuit_short_name} · {session.session_name}
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
            {drivers.isError ? (
              <ErrorMessage message="Failed to load driver data" />
            ) : (
              <TrackMap
                sessionKey={sessionKey}
                drivers={drivers.data ?? []}
                locationData={location.data}
                sessionStartMs={sessionStartMs}
              />
            )}
          </div>
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
                  sessionTimeMs={t}
                  sessionStartMs={sessionStartMs}
                  isLoading={positions.isPending && sessionKey !== null}
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
      <PlaybackBar durationMs={durationMs || 7_200_000} />
    </div>
  )
}
