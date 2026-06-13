import { describe, it, expect } from 'vitest'
import { toTelemetrySamples } from './useCarDataForLap'
import type { CarData } from '@/api/types'

const LAP_START = new Date('2024-01-01T00:00:00Z').getTime()
const at = (sec: number, fields: Partial<CarData> = {}): CarData => ({
  date: new Date(LAP_START + sec * 1000).toISOString(),
  driver_number: 1,
  speed: 0,
  throttle: 0,
  brake: 0,
  rpm: 0,
  n_gear: 0,
  drs: 0,
  meeting_key: 0,
  session_key: 0,
  ...fields,
})

describe('toTelemetrySamples', () => {
  it('returns [] for empty data', () => {
    expect(toTelemetrySamples([], LAP_START)).toEqual([])
  })

  it('starts distance at 0 and integrates speed over time', () => {
    // constant 36 km/h = 10 m/s; 1 s apart → +10 m per step
    const out = toTelemetrySamples([at(0, { speed: 36 }), at(1, { speed: 36 }), at(2, { speed: 36 })], LAP_START)
    expect(out.map((s) => s.distM)).toEqual([0, 10, 20])
  })

  it('uses average speed across each interval', () => {
    // 0→1s, speeds 0 then 72 km/h(=20 m/s); avg 10 m/s over 1s → 10 m
    const out = toTelemetrySamples([at(0, { speed: 0 }), at(1, { speed: 72 })], LAP_START)
    expect(out[1]!.distM).toBeCloseTo(10)
  })

  it('sorts unordered samples by date', () => {
    const out = toTelemetrySamples([at(2, { speed: 36 }), at(0, { speed: 36 }), at(1, { speed: 36 })], LAP_START)
    expect(out.map((s) => s.timeS)).toEqual([0, 1, 2])
  })

  it('maps gear/drs and computes session-relative seconds', () => {
    const out = toTelemetrySamples([at(5, { n_gear: 7, drs: 12, throttle: 100 })], LAP_START)
    expect(out[0]).toMatchObject({ timeS: 5, gear: 7, drs: 12, throttle: 100, distM: 0 })
  })
})
