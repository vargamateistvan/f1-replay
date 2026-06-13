import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest'
import { isSessionLive } from './live'
import type { Session } from '@/api/types'

const NOW = new Date('2024-06-01T13:00:00Z')

function session(startOffsetMin: number, endOffsetMin: number, extra: Partial<Session> = {}): Session {
  return {
    date_start: new Date(NOW.getTime() + startOffsetMin * 60_000).toISOString(),
    date_end: new Date(NOW.getTime() + endOffsetMin * 60_000).toISOString(),
    is_cancelled: false,
    ...extra,
  } as Session
}

describe('isSessionLive', () => {
  beforeEach(() => {
    vi.useFakeTimers()
    vi.setSystemTime(NOW)
  })
  afterEach(() => vi.useRealTimers())

  it('is live during the session window', () => {
    expect(isSessionLive(session(-30, 60))).toBe(true)
  })

  it('is live within the 30-min pre-start buffer', () => {
    expect(isSessionLive(session(20, 120))).toBe(true) // starts in 20 min
  })

  it('is live within the 30-min post-end buffer', () => {
    expect(isSessionLive(session(-120, -20))).toBe(true) // ended 20 min ago
  })

  it('is not live well before the buffer', () => {
    expect(isSessionLive(session(45, 120))).toBe(false) // starts in 45 min
  })

  it('is not live well after the buffer', () => {
    expect(isSessionLive(session(-180, -45))).toBe(false) // ended 45 min ago
  })

  it('is never live for a cancelled session', () => {
    expect(isSessionLive(session(-10, 60, { is_cancelled: true }))).toBe(false)
  })

  it('handles null/undefined', () => {
    expect(isSessionLive(null)).toBe(false)
    expect(isSessionLive(undefined)).toBe(false)
  })
})
