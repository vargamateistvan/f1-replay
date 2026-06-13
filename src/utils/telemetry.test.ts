import { describe, it, expect } from 'vitest'
import { resampleToAxis, computeDelta, smooth } from './telemetry'
import type { TelemetrySample } from '@/hooks/useCarDataForLap'

function sample(distM: number, timeS: number, speed = 0): TelemetrySample {
  return { distM, timeS, speed, throttle: 0, brake: 0, rpm: 0, gear: 0, drs: 0 }
}

describe('resampleToAxis', () => {
  it('returns [] when there is nothing to resample', () => {
    expect(resampleToAxis([sample(0, 0)], [])).toEqual([])
  })

  it('interpolates onto the reference distance axis', () => {
    const ref = [sample(0, 0), sample(50, 0), sample(100, 0)]
    const other = [sample(0, 0, 100), sample(100, 10, 300)]
    const out = resampleToAxis(ref, other)
    expect(out).toHaveLength(3)
    // at distM=50, halfway → timeS 5, speed 200
    expect(out[1]!.timeS).toBeCloseTo(5)
    expect(out[1]!.speed).toBeCloseTo(200)
  })

  it('clamps reference distances beyond the other lap to its last sample', () => {
    const ref = [sample(0, 0), sample(200, 0)]
    const other = [sample(0, 0, 100), sample(100, 10, 300)]
    const out = resampleToAxis(ref, other)
    expect(out[1]!.timeS).toBeCloseTo(10) // clamped to other's max distance
  })
})

describe('computeDelta', () => {
  it('is the time difference per index (+ = ref ahead)', () => {
    const ref = [sample(0, 0), sample(10, 5)]
    const other = [sample(0, 1), sample(10, 4)]
    expect(computeDelta(ref, other)).toEqual([-1, 1])
  })

  it('falls back to 0 delta when other is missing a point', () => {
    const ref = [sample(0, 3)]
    expect(computeDelta(ref, [])).toEqual([0])
  })
})

describe('smooth', () => {
  it('returns empty for empty input', () => {
    expect(smooth([])).toEqual([])
  })

  it('averages within the window and preserves length', () => {
    const out = smooth([0, 10, 20, 30, 40], 3)
    expect(out).toHaveLength(5)
    // middle point = mean(10,20,30) = 20
    expect(out[2]).toBeCloseTo(20)
    // first point = mean(0,10) = 5 (window clipped at the edge)
    expect(out[0]).toBeCloseTo(5)
  })

  it('leaves a constant signal unchanged', () => {
    expect(smooth([7, 7, 7, 7])).toEqual([7, 7, 7, 7])
  })
})
