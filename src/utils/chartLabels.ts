export interface LabelInput {
  readonly id: number;
  /** Desired position along the axis (e.g. pixels from the top). */
  readonly y: number;
}

/**
 * Spread labels along a line so none sit closer than `minGap`, keeping their
 * order, staying inside [lo, hi] and as close to their targets as they can.
 * Overlapping labels form a cluster centred on its targets' mean; clusters
 * merge until none overlap. When the range is too short the gap shrinks.
 */
export function spreadLabels(
  items: readonly LabelInput[],
  minGap: number,
  lo: number,
  hi: number,
): Map<number, number> {
  const out = new Map<number, number>();
  const n = items.length;
  if (n === 0) return out;
  const gap = n > 1 ? Math.max(0, Math.min(minGap, (hi - lo) / (n - 1))) : minGap;
  const sorted = [...items].sort((a, b) => a.y - b.y || a.id - b.id);

  interface Cluster {
    first: number;
    count: number;
    sum: number;
    start: number;
  }
  const place = (c: Cluster) => {
    const span = gap * (c.count - 1);
    c.start = Math.min(Math.max(c.sum / c.count - span / 2, lo), Math.max(lo, hi - span));
  };

  const clusters: Cluster[] = [];
  for (let i = 0; i < n; i++) {
    const c: Cluster = { first: i, count: 1, sum: sorted[i]!.y, start: 0 };
    place(c);
    clusters.push(c);
    while (clusters.length > 1) {
      const cur = clusters[clusters.length - 1]!;
      const prev = clusters[clusters.length - 2]!;
      if (prev.start + prev.count * gap <= cur.start + 1e-9) break;
      prev.count += cur.count;
      prev.sum += cur.sum;
      place(prev);
      clusters.pop();
    }
  }

  for (const c of clusters) {
    for (let k = 0; k < c.count; k++) {
      out.set(sorted[c.first + k]!.id, c.start + k * gap);
    }
  }
  return out;
}
