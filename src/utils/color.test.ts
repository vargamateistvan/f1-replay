import { describe, it, expect } from 'vitest'
import { teamColor, telemetryComparisonColors } from './color'

describe('teamColor', () => {
  it('prepends # to a bare hex string', () => {
    expect(teamColor('E8002D')).toBe('#E8002D')
  })

  describe('telemetryComparisonColors', () => {
    it('keeps unique team colors and gives repeated colors distinct team-tinted variants', () => {
      const colors = telemetryComparisonColors(['#e8002d', '#E8002D', '#e8002d'])
      expect(colors[0]).toBe('#e8002d')
      expect(colors[1]).toBe('#f58ca1')
      expect(colors[2]).toBe('#f9bfcb')
      expect(new Set(colors).size).toBe(3)
    })

    it('darkens a light team color and ignores empty slots', () => {
      expect(telemetryComparisonColors([null, '#ffffff', '#FFFFFF']))
        .toEqual([null, '#ffffff', '#737373'])
      expect(telemetryComparisonColors(['#123456', '#abcdef']))
        .toEqual(['#123456', '#abcdef'])
    })
  })

  it('leaves an already-prefixed hex untouched', () => {
    expect(teamColor('#0067ff')).toBe('#0067ff')
  })

  it('falls back when null/undefined/empty', () => {
    expect(teamColor(null)).toBe('#888888')
    expect(teamColor(undefined)).toBe('#888888')
    expect(teamColor('')).toBe('#888888')
  })

  it('uses a custom fallback', () => {
    expect(teamColor(null, '#fff')).toBe('#fff')
  })
})
