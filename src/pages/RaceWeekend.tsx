import { useState, useEffect } from 'react'
import { SessionPicker } from '@/components/SessionPicker'
import { PlaybackBar } from '@/components/PlaybackBar'
import { TrackMap } from '@/components/TrackMap/TrackMap'
import { LiveTiming } from '@/components/LiveTiming/LiveTiming'
import { RaceControlFeed } from '@/components/RaceControl/RaceControl'
import { WeatherPanel } from '@/components/Weather/WeatherPanel'
import { StrategyBar } from '@/components/Strategy/StrategyBar'
import { TeamRadioFeed } from '@/components/TeamRadio/TeamRadio'
import {
  useDrivers, usePositions, useIntervals,
  useStints, useLaps, useRaceControl,
  useWeather, useSessions, usePits, useTeamRadio,
} from '@/hooks/useSession'
import { useTimeline } from '@/timeline/clock'

const PANEL = 'bg-surface rounded border border-panel'
const PANEL_TITLE = 'text-xs font-bold text-muted px-3 py-1 border-b border-panel uppercase tracking-wider'

type RightTab = 'rc' | 'radio'

export default function RaceWeekend() {
  const [year, setYear] = useState(2024)
  const [meetingKey, setMeetingKey] = useState<number | null>(null)
  const [sessionKey, setSessionKey] = useState<number | null>(null)
  const [rightTab, setRightTab] = useState<RightTab>('rc')

  const sessions = useSessions(meetingKey)
  const drivers = useDrivers(sessionKey)
  const positions = usePositions(sessionKey)
  const intervals = useIntervals(sessionKey)
  const stints = useStints(sessionKey)
  const laps = useLaps(sessionKey)
  const pits = usePits(sessionKey)
  const raceControl = useRaceControl(sessionKey)
  const teamRadio = useTeamRadio(sessionKey)
  const weather = useWeather(sessionKey)

  const { t, setSessionStart } = useTimeline()

  const session = sessions.data?.find((s) => s.session_key === sessionKey)
  const sessionStartMs = session ? new Date(session.date_start).getTime() : 0
  const sessionEndMs = session ? new Date(session.date_end).getTime() : 0
  const durationMs = sessionEndMs - sessionStartMs

  useEffect(() => {
    if (sessionStartMs) setSessionStart(sessionStartMs)
  }, [sessionStartMs, setSessionStart])

  const isLoadingSessionData =
    sessionKey !== null &&
    (drivers.isPending || positions.isPending || intervals.isPending)

  // Placeholder — replaced in Phase 4 with timeline-driven positions
  const carPositions: Array<{ driverNumber: number; x: number; y: number }> = []

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

      {/* Main grid: track map + right column | strategy strip */}
      <div className="flex-1 grid grid-cols-[1fr_280px] grid-rows-[1fr_160px] gap-2 p-2 min-h-0">

        {/* Track map */}
        <div className={`${PANEL} flex flex-col`}>
          <div className={PANEL_TITLE}>
            Track
            {session && (
              <span className="ml-1 normal-case font-normal text-white">
                — {session.circuit_short_name} · {session.session_name}
              </span>
            )}
            {isLoadingSessionData && (
              <span className="ml-2 text-f1red animate-pulse">Loading…</span>
            )}
          </div>
          <div className="flex-1 min-h-0">
            <TrackMap
              sessionKey={sessionKey}
              drivers={drivers.data ?? []}
              carPositions={carPositions}
            />
          </div>
        </div>

        {/* Right column */}
        <div className="flex flex-col gap-2 min-h-0">

          {/* Live timing — tall, scrollable */}
          <div className={`${PANEL} flex flex-col flex-[3] min-h-0`}>
            <div className={PANEL_TITLE}>Live Timing</div>
            <div className="flex-1 overflow-hidden">
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
            </div>
          </div>

          {/* Weather — fixed small strip */}
          <div className={`${PANEL} shrink-0`}>
            <div className={PANEL_TITLE}>Weather</div>
            <WeatherPanel
              entries={weather.data ?? []}
              sessionTimeMs={t}
              sessionStartMs={sessionStartMs}
            />
          </div>

          {/* Tabbed: Race Control | Team Radio */}
          <div className={`${PANEL} flex flex-col flex-[2] min-h-0`}>
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
                <RaceControlFeed
                  entries={raceControl.data ?? []}
                  sessionTimeMs={t}
                  sessionStartMs={sessionStartMs}
                />
              ) : (
                <TeamRadioFeed
                  entries={teamRadio.data ?? []}
                  drivers={drivers.data ?? []}
                  sessionTimeMs={t}
                  sessionStartMs={sessionStartMs}
                />
              )}
            </div>
          </div>
        </div>

        {/* Strategy strip — spans both columns */}
        <div className={`${PANEL} col-span-2 flex flex-col`}>
          <div className={PANEL_TITLE}>Tyre Strategy</div>
          <div className="flex-1 overflow-auto">
            <StrategyBar
              stints={stints.data ?? []}
              drivers={drivers.data ?? []}
              laps={laps.data ?? []}
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
