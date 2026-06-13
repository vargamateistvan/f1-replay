// ── typed-array index ────────────────────────────────────────────────────────
// Built once from raw Location data; reused on every interpolation call with
// no heap allocations — safe to call at 60 fps across 20 drivers.

export interface LocationIndex {
  readonly times: Float64Array // UTC ms
  readonly xs: Float32Array
  readonly ys: Float32Array
}

export function buildIndex(
  points: ReadonlyArray<{ t: number; x: number; y: number }>,
): LocationIndex {
  const n = points.length
  const times = new Float64Array(n)
  const xs = new Float32Array(n)
  const ys = new Float32Array(n)
  for (let i = 0; i < n; i++) {
    times[i] = points[i]!.t
    xs[i] = points[i]!.x
    ys[i] = points[i]!.y
  }
  return { times, xs, ys }
}

// ── binary search ────────────────────────────────────────────────────────────

function bisect(times: Float64Array, t: number): number {
  let lo = 0
  let hi = times.length
  while (lo < hi) {
    const mid = (lo + hi) >>> 1
    if (times[mid]! <= t) lo = mid + 1
    else hi = mid
  }
  return lo - 1
}

// ── interpolation ────────────────────────────────────────────────────────────

export function interpolateXY(
  idx: LocationIndex,
  t: number,
): { x: number; y: number } | null {
  const { times, xs, ys } = idx
  const n = times.length
  if (n === 0) return null

  const i = bisect(times, t)
  if (i < 0) return { x: xs[0]!, y: ys[0]! }
  if (i >= n - 1) return { x: xs[n - 1]!, y: ys[n - 1]! }

  const alpha = (t - times[i]!) / (times[i + 1]! - times[i]!)
  return {
    x: xs[i]! + (xs[i + 1]! - xs[i]!) * alpha,
    y: ys[i]! + (ys[i + 1]! - ys[i]!) * alpha,
  }
}

// ── step function (for positions / intervals / weather) ──────────────────────

export interface StepIndex<T> {
  readonly times: Float64Array
  readonly values: readonly T[]
}

export function buildStepIndex<T extends { date: string }>(items: T[]): StepIndex<T> {
  const sorted = [...items].sort((a, b) => new Date(a.date).getTime() - new Date(b.date).getTime())
  const times = new Float64Array(sorted.length)
  for (let i = 0; i < sorted.length; i++) times[i] = new Date(sorted[i]!.date).getTime()
  return { times, values: sorted }
}

export function stepAt<T>(idx: StepIndex<T>, utcMs: number): T | null {
  const i = bisect(idx.times, utcMs)
  if (i < 0) return null
  return idx.values[Math.min(i, idx.values.length - 1)]!
}
