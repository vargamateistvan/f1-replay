import { describe, expect, it } from 'vitest'
import { formatPitDuration } from './pit'

describe('formatPitDuration', () => {
  it('formats short pit stops without a leading zero on seconds and with a single digit for tenths', () => {
    expect(formatPitDuration(2.456)).toBe('2:5')
    expect(formatPitDuration(12.345)).toBe('12:3')
  })

  it('keeps minute precision for longer stops', () => {
    expect(formatPitDuration(72.005)).toBe('1:12:0')
  })

  it('falls back for invalid values', () => {
    expect(formatPitDuration(null)).toBeNull()
    expect(formatPitDuration(Number.NaN)).toBeNull()
  })
})
