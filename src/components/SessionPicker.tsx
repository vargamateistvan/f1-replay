import { useMeetings, useSessions } from '@/hooks/useSession'

const YEARS = [2024, 2023]

interface Props {
  year: number
  meetingKey: number | null
  sessionKey: number | null
  onYear: (y: number) => void
  onMeeting: (k: number) => void
  onSession: (k: number) => void
}

export function SessionPicker({ year, meetingKey, sessionKey, onYear, onMeeting, onSession }: Props) {
  const meetings = useMeetings(year)
  const sessions = useSessions(meetingKey)

  return (
    <div className="flex items-center gap-2 px-4 py-2 bg-surface border-b border-panel text-sm">
      <label className="text-muted">Year</label>
      <select
        value={year}
        onChange={(e) => onYear(Number(e.target.value))}
        className="bg-panel text-white border border-panel rounded px-2 py-1"
      >
        {YEARS.map((y) => (
          <option key={y} value={y}>{y}</option>
        ))}
      </select>

      <label className="text-muted ml-3">Event</label>
      <select
        value={meetingKey ?? ''}
        onChange={(e) => onMeeting(Number(e.target.value))}
        disabled={meetings.isPending}
        className="bg-panel text-white border border-panel rounded px-2 py-1 min-w-40"
      >
        <option value="">— select —</option>
        {meetings.data?.map((m) => (
          <option key={m.meeting_key} value={m.meeting_key}>
            {m.location} — {m.meeting_name}
          </option>
        ))}
      </select>

      <label className="text-muted ml-3">Session</label>
      <select
        value={sessionKey ?? ''}
        onChange={(e) => onSession(Number(e.target.value))}
        disabled={sessions.isPending || !meetingKey}
        className="bg-panel text-white border border-panel rounded px-2 py-1"
      >
        <option value="">— select —</option>
        {sessions.data?.map((s) => (
          <option key={s.session_key} value={s.session_key}>
            {s.session_name}
          </option>
        ))}
      </select>

      {(meetings.isPending || sessions.isPending) && (
        <span className="text-muted text-xs ml-2 animate-pulse">Loading…</span>
      )}
    </div>
  )
}
