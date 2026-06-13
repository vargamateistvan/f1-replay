import { useMeetings, useSessions } from '@/hooks/useSession'
import { isSessionLive } from '@/utils/live'
import { YEARS } from '@/constants'

interface Props {
  year: number
  meetingKey: number | null
  sessionKey: number | null
  onYear: (y: number) => void
  onMeeting: (k: number) => void
  onSession: (k: number) => void
}

const SELECT = 'bg-panel text-white border border-[#38383f] text-xs font-medium px-3 py-1.5 focus:outline-none focus:border-muted'

export function SessionPicker({ year, meetingKey, sessionKey, onYear, onMeeting, onSession }: Props) {
  const meetings = useMeetings(year)
  const sessions = useSessions(meetingKey)

  const selectedSession = sessions.data?.find((s) => s.session_key === sessionKey)
  const live = isSessionLive(selectedSession)

  return (
    <div className="flex flex-wrap items-center gap-x-4 gap-y-1.5 px-4 py-2 bg-surface border-b border-panel">
      <span className="text-[10px] font-bold uppercase tracking-widest text-muted">Year</span>
      <select aria-label="Season year" value={year} onChange={(e) => onYear(Number(e.target.value))} className={SELECT}>
        {YEARS.map((y) => <option key={y} value={y}>{y}</option>)}
      </select>

      <span className="text-[10px] font-bold uppercase tracking-widest text-muted">Event</span>
      {meetings.isError ? (
        <span className="text-red-400 font-mono text-[11px]">Failed to load events</span>
      ) : (
        <select
          aria-label="Event"
          value={meetingKey ?? ''}
          onChange={(e) => onMeeting(Number(e.target.value))}
          disabled={meetings.isPending}
          className={`${SELECT} min-w-44`}
        >
          <option value="">— select —</option>
          {meetings.data?.map((m) => (
            <option key={m.meeting_key} value={m.meeting_key}>
              {m.location} — {m.meeting_name}
            </option>
          ))}
        </select>
      )}

      <span className="text-[10px] font-bold uppercase tracking-widest text-muted">Session</span>
      {sessions.isError ? (
        <span className="text-red-400 font-mono text-[11px]">Failed to load sessions</span>
      ) : (
        <select
          aria-label="Session"
          value={sessionKey ?? ''}
          onChange={(e) => onSession(Number(e.target.value))}
          disabled={sessions.isPending || !meetingKey}
          className={SELECT}
        >
          <option value="">— select —</option>
          {sessions.data?.map((s) => (
            <option key={s.session_key} value={s.session_key}>{s.session_name}</option>
          ))}
        </select>
      )}

      {live && (
        <span className="flex items-center gap-1.5 bg-f1red text-white text-[10px] font-black uppercase tracking-widest px-2 py-1">
          <span className="w-1.5 h-1.5 rounded-full bg-white animate-pulse" />
          Live
        </span>
      )}

      {(meetings.isPending || sessions.isPending) && (
        <span className="text-muted text-[10px] animate-pulse">Loading…</span>
      )}
    </div>
  )
}
