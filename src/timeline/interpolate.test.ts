import { describe, it, expect } from 'vitest'
import { buildIndex, interpolateXY, buildStepIndex, stepAt } from './interpolate'

describe('interpolateXY', () => {
  const idx = buildIndex([
    { t: 0, x: 0, y: 0 },
    { t: 100, x: 10, y: 20 },
    { t: 200, x: 30, y: 0 },
  ])

  it('returns null for an empty index', () => {
    expect(interpolateXY(buildIndex([]), 50)).toBeNull()
  })

  it('clamps to the first point before the range', () => {
    expect(interpolateXY(idx, -50)).toEqual({ x: 0, y: 0 })
  })

  it('clamps to the last point after the range', () => {
    expect(interpolateXY(idx, 9999)).toEqual({ x: 30, y: 0 })
  })

  it('linearly interpolates at the midpoint of a segment', () => {
    expect(interpolateXY(idx, 50)).toEqual({ x: 5, y: 10 })
  })

  it('returns exact values at sample points', () => {
    expect(interpolateXY(idx, 100)).toEqual({ x: 10, y: 20 })
  })

  it('interpolates a descending y segment', () => {
    // t=150 is halfway between (100,10,20) and (200,30,0)
    expect(interpolateXY(idx, 150)).toEqual({ x: 20, y: 10 })
  })

  it('returns a finite result when two consecutive timestamps are equal', () => {
    // OpenF1 can emit duplicate-date rows; guard against dt=0 → alpha=Infinity
    const dupIdx = buildIndex([
      { t: 0, x: 0, y: 0 },
      { t: 100, x: 10, y: 20 },
      { t: 100, x: 12, y: 22 }, // duplicate timestamp
      { t: 200, x: 30, y: 0 },
    ])
    const result = interpolateXY(dupIdx, 100)
    expect(result).not.toBeNull()
    expect(Number.isFinite(result!.x)).toBe(true)
    expect(Number.isFinite(result!.y)).toBe(true)
  })
})

describe('stepAt', () => {
  const idx = buildStepIndex([
    { date: '2024-01-01T00:00:10Z', v: 'a' },
    { date: '2024-01-01T00:00:20Z', v: 'b' },
    { date: '2024-01-01T00:00:30Z', v: 'c' },
  ])
  const at = (iso: string) => stepAt(idx, new Date(iso).getTime())

  it('returns null before the first sample', () => {
    expect(at('2024-01-01T00:00:05Z')).toBeNull()
  })

  it('returns the last value at or before the query time', () => {
    expect(at('2024-01-01T00:00:25Z')?.v).toBe('b')
    expect(at('2024-01-01T00:00:20Z')?.v).toBe('b')
  })

  it('holds the final value past the end', () => {
    expect(at('2024-01-01T00:01:00Z')?.v).toBe('c')
  })

  it('sorts unordered input by date', () => {
    const unordered = buildStepIndex([
      { date: '2024-01-01T00:00:30Z', v: 'c' },
      { date: '2024-01-01T00:00:10Z', v: 'a' },
    ])
    expect(stepAt(unordered, new Date('2024-01-01T00:00:15Z').getTime())?.v).toBe('a')
  })
})
