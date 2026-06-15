import { useMemo } from "react";
import { useTimeline } from "@/timeline/clock";
import type { Location } from "@/api/types";

export interface CarPosition {
  num: number;
  x: number;
  y: number;
  z: number;
}

interface Idx3d {
  times: Float64Array;
  xs: Float32Array;
  ys: Float32Array;
  zs: Float32Array;
}

function buildIdx3d(
  points: ReadonlyArray<{ t: number; x: number; y: number; z: number }>,
): Idx3d {
  const n = points.length;
  const times = new Float64Array(n);
  const xs = new Float32Array(n);
  const ys = new Float32Array(n);
  const zs = new Float32Array(n);
  for (let i = 0; i < n; i++) {
    times[i] = points[i]!.t;
    xs[i] = points[i]!.x;
    ys[i] = points[i]!.y;
    zs[i] = points[i]!.z;
  }
  return { times, xs, ys, zs };
}

function bisect(times: Float64Array, t: number): number {
  let lo = 0;
  let hi = times.length;
  while (lo < hi) {
    const mid = (lo + hi) >>> 1;
    if (times[mid]! <= t) lo = mid + 1;
    else hi = mid;
  }
  return lo - 1;
}

function interpolateXYZ(
  idx: Idx3d,
  t: number,
): { x: number; y: number; z: number } | null {
  const { times, xs, ys, zs } = idx;
  const n = times.length;
  if (n === 0) return null;
  const i = bisect(times, t);
  if (i < 0) return { x: xs[0]!, y: ys[0]!, z: zs[0]! };
  if (i >= n - 1) return { x: xs[n - 1]!, y: ys[n - 1]!, z: zs[n - 1]! };
  const dt = times[i + 1]! - times[i]!;
  if (dt <= 0) return { x: xs[i]!, y: ys[i]!, z: zs[i]! };
  const alpha = (t - times[i]!) / dt;
  return {
    x: xs[i]! + (xs[i + 1]! - xs[i]!) * alpha,
    y: ys[i]! + (ys[i + 1]! - ys[i]!) * alpha,
    z: zs[i]! + (zs[i + 1]! - zs[i]!) * alpha,
  };
}

export function useCarPositions(
  locationData: Location[],
  sessionStartMs: number,
  retiredDrivers?: ReadonlySet<number>,
): CarPosition[] {
  const { t } = useTimeline();

  const indexes = useMemo(() => {
    const byDriver = new Map<
      number,
      Array<{ t: number; x: number; y: number; z: number }>
    >();
    for (const loc of locationData) {
      const relT = new Date(loc.date).getTime() - sessionStartMs;
      let arr = byDriver.get(loc.driver_number);
      if (!arr) {
        arr = [];
        byDriver.set(loc.driver_number, arr);
      }
      arr.push({ t: relT, x: loc.x, y: loc.y, z: loc.z ?? 0 });
    }
    const result = new Map<number, Idx3d>();
    for (const [num, pts] of byDriver) {
      pts.sort((a, b) => a.t - b.t);
      result.set(num, buildIdx3d(pts));
    }
    return result;
  }, [locationData, sessionStartMs]);

  const positions: CarPosition[] = [];
  for (const [num, idx] of indexes) {
    if (retiredDrivers?.has(num)) continue;
    const pos = interpolateXYZ(idx, t);
    if (pos) positions.push({ num, ...pos });
  }
  return positions;
}
