import { useState, useEffect } from 'react'
import { SessionPicker } from '@/components/SessionPicker'
import { PlaybackBar } from '@/components/PlaybackBar'
import { TrackMap } from '@/components/TrackMap/TrackMap'
import { LiveTiming } from '@/components/LiveTiming/LiveTiming'
import { RaceControlFeed } from '@/components/RaceControl/RaceControl'
import { WeatherPanel } from '@/components/Weather/WeatherPanel'
import { StrategyBar } from '@/components/Strategy/StrategyBar'
import {
  useDrivers, usePositions, useIntervals,
  useStints, useLaps, useRaceControl,
  useWeather, useSessions,
} from '@/hooks/useSession'
import { useTimeline } from '@/timeline/clock'

const PANEL = 'bg-surface rounded border border-panel'
const PANEL_TITLE = 'text-xs font-bold text-muted px-3 py-1 border-b border-panel uppercase tracking-wider'

export default function RaceWeekend() {
  const [year, setYear] = useState(2024)
  const [meetingKey, setMeetingKey] = useState<number | null>(null)
  const [sessionKey, setSessionKey] = useState<number | null>(null)

  const sessions = useSessions(meetingKey)
  const drivers = useDrivers(sessionKey)
  const positions = usePositions(sessionKey)
  const intervals = useIntervals(sessionKey)
  const stints = useStints(sessionKey)
  const laps = useLaps(sessionKey)
  const raceControl = useRaceControl(sessionKey)
  const weather = useWeather(sessionKey)

  const { t, setSessionStart } = useTimeline()

  // Derive session start ms and duration when session loaded
  const session = sessions.data?.find((s) => s.session_key === sessionKey)
  const sessionStartMs = session ? new Date(session.date_start).getTime() : 0
  const sessionEndMs = session ? new Date(session.date_end).getTime() : 0
  const durationMs = sessionEndMs - sessionStartMs

  useEffect(() => {
    if (sessionStartMs) setSessionStart(sessionStartMs)
  }, [sessionStartMs, setSessionStart])

  // Placeholder car positions — in Phase 3 these come from the timeline engine
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

      {/* Main grid */}
      <div className="flex-1 grid grid-cols-[1fr_280px] grid-rows-[1fr_180px] gap-2 p-2 min-h-0">

        {/* Track map — center */}
        <div className={`${PANEL} flex flex-col`}>
          <div className={PANEL_TITLE}>
            Track — {session?.circuit_short_name ?? '—'} · {session?.session_name ?? '—'}
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
          {/* Live timing */}
          <div className={`${PANEL} flex flex-col flex-1 min-h-0`}>
            <div className={PANEL_TITLE}>Live Timing</div>
            <div className="flex-1 overflow-auto">
              <LiveTiming
                drivers={drivers.data ?? []}
                positions={positions.data ?? []}
                intervals={intervals.data ?? []}
                sessionTimeMs={t}
                sessionStartMs={sessionStartMs}
              />
            </div>
          </div>

          {/* Weather */}
          <div className={`${PANEL} shrink-0`}>
            <div className={PANEL_TITLE}>Weather</div>
            <WeatherPanel
              entries={weather.data ?? []}
              sessionTimeMs={t}
              sessionStartMs={sessionStartMs}
            />
          </div>

          {/* Race control */}
          <div className={`${PANEL} flex flex-col flex-1 min-h-0`}>
            <div className={PANEL_TITLE}>Race Control</div>
            <div className="flex-1 overflow-auto">
              <RaceControlFeed
                entries={raceControl.data ?? []}
                sessionTimeMs={t}
                sessionStartMs={sessionStartMs}
              />
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

      {/* Playback bar pinned at bottom */}
      <PlaybackBar durationMs={durationMs || 7_200_000} />
    </div>
  )
}
