import { describe, it, expect } from 'vitest'
import { teamColor } from './color'

describe('teamColor', () => {
  it('prepends # to a bare hex string', () => {
    expect(teamColor('E8002D')).toBe('#E8002D')
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
