import type { Session } from '@/api/types'

// 30-minute buffer so "live" activates just before the session starts
const BUFFER_MS = 30 * 60 * 1000
// Poll interval for live data (ms)
export const LIVE_POLL_MS = 10_000

export function isSessionLive(session: Session | undefined | null): boolean {
  if (!session || session.is_cancelled) return false
  const now = Date.now()
  return (
    new Date(session.date_start).getTime() - BUFFER_MS <= now &&
    now <= new Date(session.date_end).getTime() + BUFFER_MS
  )
}
