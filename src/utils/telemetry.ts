import type { TelemetrySample } from '@/hooks/useCarDataForLap'

// Resample `other`'s samples onto `ref`'s distance axis via linear interpolation,
// so two laps sampled at different points can be compared point-for-point.
export function resampleToAxis(ref: TelemetrySample[], other: TelemetrySample[]): TelemetrySample[] {
  if (other.length === 0) return []
  const maxDist = other[other.length - 1]!.distM
  return ref.map((r) => {
    const d = Math.min(r.distM, maxDist)
    let lo = 0, hi = other.length - 1
    while (lo < hi - 1) {
      const mid = (lo + hi) >>> 1
      if (other[mid]!.distM <= d) lo = mid; else hi = mid
    }
    const a = other[lo]!, b = other[hi]!
    const alpha = b.distM === a.distM ? 0 : (d - a.distM) / (b.distM - a.distM)
    const lerp = (av: number, bv: number) => av + (bv - av) * alpha
    return {
      distM: r.distM,
      timeS: lerp(a.timeS, b.timeS),
      speed: lerp(a.speed, b.speed),
      throttle: lerp(a.throttle, b.throttle),
      brake: lerp(a.brake, b.brake),
      rpm: lerp(a.rpm, b.rpm),
      gear: Math.round(lerp(a.gear, b.gear)),
      drs: lerp(a.drs, b.drs),
    }
  })
}

// Δ time of `other` (already resampled onto ref's axis) vs `ref` at each point.
// Positive = ref is ahead.
export function computeDelta(ref: TelemetrySample[], other: TelemetrySample[]): number[] {
  return ref.map((s, i) => s.timeS - (other[i]?.timeS ?? s.timeS))
}

// Centred moving-average low-pass for noisy traces (speed/throttle/brake/RPM).
export function smooth(values: number[], window = 5): number[] {
  if (values.length === 0) return values
  const half = Math.floor(window / 2)
  const out = new Array<number>(values.length)
  for (let i = 0; i < values.length; i++) {
    let sum = 0, cnt = 0
    for (let j = i - half; j <= i + half; j++) {
      if (j >= 0 && j < values.length) { sum += values[j]!; cnt++ }
    }
    out[i] = sum / cnt
  }
  return out
}
