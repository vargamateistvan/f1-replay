// Binary search: largest index where times[i] <= t
export function bisectLeft(times: number[], t: number): number {
  let lo = 0
  let hi = times.length
  while (lo < hi) {
    const mid = (lo + hi) >>> 1
    if (times[mid]! <= t) lo = mid + 1
    else hi = mid
  }
  return lo - 1
}

export interface TimedPoint {
  t: number // ms offset from session start
  x: number
  y: number
}

// Linear interpolation between two (x,y) samples at time t
export function interpolateXY(points: TimedPoint[], t: number): { x: number; y: number } | null {
  if (points.length === 0) return null
  const times = points.map((p) => p.t)
  const i = bisectLeft(times, t)

  if (i < 0) return { x: points[0]!.x, y: points[0]!.y }
  if (i >= points.length - 1) return { x: points[points.length - 1]!.x, y: points[points.length - 1]!.y }

  const a = points[i]!
  const b = points[i + 1]!
  const alpha = (t - a.t) / (b.t - a.t)
  return {
    x: a.x + (b.x - a.x) * alpha,
    y: a.y + (b.y - a.y) * alpha,
  }
}

// Step function: last known value at time t
export function stepAt<T extends { t: number }>(items: T[], t: number): T | null {
  if (items.length === 0) return null
  const times = items.map((p) => p.t)
  const i = bisectLeft(times, t)
  if (i < 0) return null
  return items[Math.min(i, items.length - 1)]!
}
