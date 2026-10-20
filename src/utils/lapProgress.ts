/**
 * Lap progress along a track outline: where a car is around the lap (0–1),
 * how far it is from the centerline, and the label layout for the ring view.
 * Pure geometry, no React, so it can be unit-tested and run every tick.
 */

export interface PathPoint {
  sx: number;
  sy: number;
}

/** A polyline with cumulative arc length, in typed arrays for the hot path. */
export interface ArcPath {
  readonly xs: Float64Array;
  readonly ys: Float64Array;
  /** Normalized cumulative arc length (0–1) at each point. */
  readonly arc: Float64Array;
  /** Total length, in the points' units. */
  readonly length: number;
  /** Closed loop: the last point joins the first (a lap); open for a pit lane. */
  readonly closed: boolean;
}

export interface PathProjection {
  /** Position along the path, 0–1. */
  fraction: number;
  /** Distance from the path, in the points' units. */
  dist: number;
  /** Index of the matched segment; pass back as the next search hint. */
  segment: number;
}

export function buildArcPath(points: readonly PathPoint[], closed: boolean): ArcPath {
  const n = points.length;
  const xs = new Float64Array(n);
  const ys = new Float64Array(n);
  const cum = new Float64Array(n);
  for (let i = 0; i < n; i++) {
    xs[i] = points[i]!.sx;
    ys[i] = points[i]!.sy;
    if (i > 0) cum[i] = cum[i - 1]! + Math.hypot(xs[i]! - xs[i - 1]!, ys[i]! - ys[i - 1]!);
  }
  // A closed lap's length includes the closing segment (last → first point).
  const closing = closed && n > 1 ? Math.hypot(xs[0]! - xs[n - 1]!, ys[0]! - ys[n - 1]!) : 0;
  const length = (n > 0 ? cum[n - 1]! : 0) + closing;
  const arc = new Float64Array(n);
  for (let i = 0; i < n; i++) arc[i] = length > 0 ? cum[i]! / length : 0;
  return { xs, ys, arc, length, closed };
}

function segmentCount(path: ArcPath): number {
  const n = path.xs.length;
  if (n < 2) return 0;
  return path.closed ? n : n - 1;
}

/** Squared distance and fraction for the projection onto segment `s`. */
function projectOntoSegment(
  path: ArcPath,
  s: number,
  x: number,
  y: number,
): { d2: number; fraction: number } {
  const n = path.xs.length;
  const j = s + 1 === n ? 0 : s + 1;
  const ax = path.xs[s]!;
  const ay = path.ys[s]!;
  const dx = path.xs[j]! - ax;
  const dy = path.ys[j]! - ay;
  const len2 = dx * dx + dy * dy;
  const u = len2 > 0 ? Math.min(1, Math.max(0, ((x - ax) * dx + (y - ay) * dy) / len2)) : 0;
  const px = ax + dx * u;
  const py = ay + dy * u;
  const a0 = path.arc[s]!;
  const a1 = j === 0 ? 1 : path.arc[j]!;
  return { d2: (x - px) ** 2 + (y - py) ** 2, fraction: a0 + (a1 - a0) * u };
}

/**
 * Project (x, y) onto the nearest point of the path. With a `hint` (the
 * segment matched last time) only `window` segments either side are searched,
 * which also keeps a car on its own stretch where the track crosses itself
 * (Suzuka); a match further than `maxHintDist` falls back to a full scan
 * (after a seek, or when the hint was stale).
 */
export function projectOntoPath(
  path: ArcPath,
  x: number,
  y: number,
  hint = -1,
  window = 24,
  maxHintDist = Infinity,
): PathProjection | null {
  const count = segmentCount(path);
  if (count === 0) return null;

  const scan = (from: number, steps: number): PathProjection => {
    let best: PathProjection = { fraction: 0, dist: Infinity, segment: 0 };
    let bestD2 = Infinity;
    for (let k = 0; k < steps; k++) {
      let s = from + k;
      if (path.closed) s = ((s % count) + count) % count;
      else if (s < 0 || s >= count) continue;
      const { d2, fraction } = projectOntoSegment(path, s, x, y);
      if (d2 < bestD2) {
        bestD2 = d2;
        best = { fraction, dist: 0, segment: s };
      }
    }
    best.dist = Math.sqrt(bestD2);
    return best;
  };

  if (hint >= 0 && hint < count && window * 2 + 1 < count) {
    const local = scan(hint - window, window * 2 + 1);
    if (local.dist <= maxHintDist) return normalize(path, local);
  }
  return normalize(path, scan(0, count));
}

/** A lap's finish line is its start: fraction 1 wraps to 0 (open paths end at 1). */
function normalize(path: ArcPath, p: PathProjection): PathProjection {
  return path.closed && p.fraction >= 1 ? { ...p, fraction: p.fraction - 1 } : p;
}

/** Wrap any number into [0, 1). */
export function wrapFraction(f: number): number {
  const w = f - Math.floor(f);
  return w >= 1 ? 0 : w;
}

/**
 * Fraction of the way from `from` to `to` going forward round the lap (so a
 * pit lane that crosses the start/finish line still spans its short way).
 */
export function forwardSpan(from: number, to: number): number {
  return wrapFraction(to - from);
}

/** SVG point on a circle; fraction 0 is 12 o'clock and the lap runs clockwise. */
export function ringPoint(
  cx: number,
  cy: number,
  r: number,
  fraction: number,
): { x: number; y: number } {
  const a = fraction * 2 * Math.PI - Math.PI / 2;
  return { x: cx + r * Math.cos(a), y: cy + r * Math.sin(a) };
}

/** SVG arc path from `from` to `to` (clockwise, fractions of the lap). */
export function ringArcPath(
  cx: number,
  cy: number,
  r: number,
  from: number,
  to: number,
): string {
  const span = forwardSpan(from, to) || (from === to ? 0 : 1);
  if (span <= 0) return "";
  // A full circle can't be one arc command: draw two halves.
  if (span >= 0.9999) {
    const a = ringPoint(cx, cy, r, from);
    const b = ringPoint(cx, cy, r, from + 0.5);
    return `M${f(a.x)} ${f(a.y)}A${r} ${r} 0 1 1 ${f(b.x)} ${f(b.y)}A${r} ${r} 0 1 1 ${f(a.x)} ${f(a.y)}`;
  }
  const a = ringPoint(cx, cy, r, from);
  const b = ringPoint(cx, cy, r, from + span);
  return `M${f(a.x)} ${f(a.y)}A${r} ${r} 0 ${span > 0.5 ? 1 : 0} 1 ${f(b.x)} ${f(b.y)}`;
}

function f(n: number): string {
  return n.toFixed(2);
}

export interface RingLabelInput {
  id: number;
  /** Where the car is, 0–1. */
  fraction: number;
}

/**
 * Spread labels round the ring so none sit closer than `minGap` (fraction of
 * the lap), keeping their order and staying as close to their cars as they
 * can. Classic 1D cluster merging: overlapping labels form a cluster centred
 * on its cars' mean position, and clusters merge until none overlap. The
 * circle is cut at its widest empty stretch so the line at 12 o'clock is not
 * special.
 */
export function layoutRingLabels(
  items: readonly RingLabelInput[],
  minGap: number,
): Map<number, number> {
  const out = new Map<number, number>();
  const n = items.length;
  if (n === 0) return out;
  const gap = Math.min(minGap, 1 / n);
  const sorted = items
    .map((it) => ({ id: it.id, pos: wrapFraction(it.fraction) }))
    .sort((a, b) => a.pos - b.pos || a.id - b.id);

  // Start just after the widest empty stretch and unwrap to a monotonic run.
  let cut = 0;
  let widest = -1;
  for (let i = 0; i < n; i++) {
    const next = i + 1 < n ? sorted[i + 1]!.pos : sorted[0]!.pos + 1;
    if (next - sorted[i]!.pos > widest) {
      widest = next - sorted[i]!.pos;
      cut = (i + 1) % n;
    }
  }
  const order = [...sorted.slice(cut), ...sorted.slice(0, cut)];
  const desired = order.map((s, i) => (i >= n - cut ? s.pos + 1 : s.pos));

  interface Cluster {
    first: number;
    count: number;
    sum: number;
    start: number;
  }
  const place = (c: Cluster) => {
    c.start = c.sum / c.count - (gap * (c.count - 1)) / 2;
  };
  const clusters: Cluster[] = [];
  for (let i = 0; i < n; i++) {
    const c: Cluster = { first: i, count: 1, sum: desired[i]!, start: desired[i]! };
    clusters.push(c);
    // Merge backwards while the new cluster overlaps the previous one.
    while (clusters.length > 1) {
      const cur = clusters[clusters.length - 1]!;
      const prev = clusters[clusters.length - 2]!;
      if (prev.start + prev.count * gap <= cur.start + 1e-12) break;
      prev.count += cur.count;
      prev.sum += cur.sum;
      place(prev);
      clusters.pop();
    }
  }
  // The run may now overlap itself across the cut: then it's one cluster.
  const firstC = clusters[0]!;
  const lastC = clusters[clusters.length - 1]!;
  if (clusters.length > 1 && lastC.start + lastC.count * gap > firstC.start + 1 + 1e-12) {
    const all: Cluster = { first: 0, count: n, sum: desired.reduce((a, b) => a + b, 0), start: 0 };
    place(all);
    clusters.splice(0, clusters.length, all);
  }
  for (const c of clusters) {
    for (let k = 0; k < c.count; k++) {
      out.set(order[c.first + k]!.id, wrapFraction(c.start + k * gap));
    }
  }
  return out;
}
