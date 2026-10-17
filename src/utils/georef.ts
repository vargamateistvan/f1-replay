/**
 * Georeferencing between the F1 Cartesian frame (OpenF1 /location and the
 * baked MultiViewer geometry) and WGS84 lng/lat, for the 3D (Mapbox) map.
 *
 * The F1 frame is per-circuit with an arbitrary origin and rotation, so each
 * circuit carries a baked similarity transform (src/data/circuit-georef.json,
 * written by scripts/fetch-georef.mjs) into local east/north metres around an
 * anchor lng/lat:
 *
 *   [e, n] = scale · R(rotation) · [x, flipY ? -y : y] + [tx, ty]
 *
 * This module has no imports so the Node bake script can load it directly.
 */

export interface Point2 {
  x: number;
  y: number;
}

export interface CircuitGeoref {
  /** Anchor of the local east/north frame. */
  originLng: number;
  originLat: number;
  /** Metres per F1 unit. */
  scale: number;
  /** Radians, counter-clockwise from F1 +x to east. */
  rotation: number;
  flipY: boolean;
  /** Translation in metres east / north of the origin. */
  tx: number;
  ty: number;
  /** Fit quality: RMS / max distance (m) from the baked centerline to the reference trace. */
  rmsM: number;
  maxM: number;
}

export interface SimilarityFit {
  scale: number;
  rotation: number;
  tx: number;
  ty: number;
  /** RMS residual over the fitted pairs, in destination units. */
  rms: number;
}

const EARTH_RADIUS_M = 6_378_137;
const DEG = Math.PI / 180;

/** Equirectangular lng/lat → local metres. Sub-centimetre over a circuit's extent. */
export function lngLatToEnu(
  originLng: number,
  originLat: number,
  lng: number,
  lat: number,
): Point2 {
  return {
    x: (lng - originLng) * DEG * EARTH_RADIUS_M * Math.cos(originLat * DEG),
    y: (lat - originLat) * DEG * EARTH_RADIUS_M,
  };
}

export function enuToLngLat(
  originLng: number,
  originLat: number,
  e: number,
  n: number,
): [number, number] {
  return [
    originLng + e / (EARTH_RADIUS_M * Math.cos(originLat * DEG)) / DEG,
    originLat + n / EARTH_RADIUS_M / DEG,
  ];
}

export function applySimilarity(
  fit: Pick<SimilarityFit, "scale" | "rotation" | "tx" | "ty">,
  p: Point2,
): Point2 {
  const c = Math.cos(fit.rotation) * fit.scale;
  const s = Math.sin(fit.rotation) * fit.scale;
  return { x: c * p.x - s * p.y + fit.tx, y: s * p.x + c * p.y + fit.ty };
}

/** F1 x/y → local east/north metres. */
export function f1ToEnu(geo: CircuitGeoref, x: number, y: number): Point2 {
  return applySimilarity(geo, { x, y: geo.flipY ? -y : y });
}

/** F1 x/y → [lng, lat]. */
export function f1ToLngLat(
  geo: CircuitGeoref,
  x: number,
  y: number,
): [number, number] {
  const p = f1ToEnu(geo, x, y);
  return enuToLngLat(geo.originLng, geo.originLat, p.x, p.y);
}

/**
 * Least-squares similarity transform (Umeyama, rotation only — no reflection)
 * mapping src[i] → dst[i]. Arrays must be the same length.
 */
export function fitSimilarity(
  src: readonly Point2[],
  dst: readonly Point2[],
): SimilarityFit {
  const n = src.length;
  if (n === 0 || n !== dst.length) {
    throw new Error("fitSimilarity: need equal, non-empty point sets");
  }
  let msx = 0,
    msy = 0,
    mdx = 0,
    mdy = 0;
  for (let i = 0; i < n; i++) {
    msx += src[i]!.x;
    msy += src[i]!.y;
    mdx += dst[i]!.x;
    mdy += dst[i]!.y;
  }
  msx /= n;
  msy /= n;
  mdx /= n;
  mdy /= n;

  let a = 0,
    b = 0,
    varS = 0,
    varD = 0;
  for (let i = 0; i < n; i++) {
    const sx = src[i]!.x - msx;
    const sy = src[i]!.y - msy;
    const dx = dst[i]!.x - mdx;
    const dy = dst[i]!.y - mdy;
    a += sx * dx + sy * dy;
    b += sx * dy - sy * dx;
    varS += sx * sx + sy * sy;
    varD += dx * dx + dy * dy;
  }
  if (varS === 0) throw new Error("fitSimilarity: degenerate source");

  const norm = Math.hypot(a, b);
  const scale = norm / varS;
  const rotation = Math.atan2(b, a);
  const c = Math.cos(rotation) * scale;
  const s = Math.sin(rotation) * scale;
  const tx = mdx - (c * msx - s * msy);
  const ty = mdy - (s * msx + c * msy);
  const sse = Math.max(0, varD - (norm * norm) / varS);
  return { scale, rotation, tx, ty, rms: Math.sqrt(sse / n) };
}

/** Resample a closed polyline to `count` points evenly spaced by arc length. */
export function resampleClosed(
  points: readonly Point2[],
  count: number,
): Point2[] {
  const pts = [...points];
  const first = pts[0];
  const last = pts[pts.length - 1];
  if (pts.length > 1 && first && last && first.x === last.x && first.y === last.y) {
    pts.pop();
  }
  const m = pts.length;
  if (m < 2) return pts.map((p) => ({ ...p }));

  const cum = new Float64Array(m + 1);
  for (let i = 0; i < m; i++) {
    const p = pts[i]!;
    const q = pts[(i + 1) % m]!;
    cum[i + 1] = cum[i]! + Math.hypot(q.x - p.x, q.y - p.y);
  }
  const total = cum[m]!;
  const out: Point2[] = [];
  let seg = 0;
  for (let k = 0; k < count; k++) {
    const d = (k / count) * total;
    while (seg < m - 1 && cum[seg + 1]! < d) seg++;
    const p = pts[seg]!;
    const q = pts[(seg + 1) % m]!;
    const len = cum[seg + 1]! - cum[seg]!;
    const u = len > 0 ? (d - cum[seg]!) / len : 0;
    out.push({ x: p.x + (q.x - p.x) * u, y: p.y + (q.y - p.y) * u });
  }
  return out;
}

function nearestIndex(p: Point2, pts: readonly Point2[]): number {
  let best = 0;
  let bestD = Infinity;
  for (let i = 0; i < pts.length; i++) {
    const q = pts[i]!;
    const d = (q.x - p.x) ** 2 + (q.y - p.y) ** 2;
    if (d < bestD) {
      bestD = d;
      best = i;
    }
  }
  return best;
}

export interface LoopFit extends SimilarityFit {
  flipY: boolean;
  /** RMS / max nearest-point distance from transformed src to the dst polyline. */
  rmsNearest: number;
  maxNearest: number;
}

/**
 * Align two closed loops that trace the same circuit but share no start point,
 * direction or handedness. Searches every cyclic shift × direction × Y-flip on
 * arc-length resamples, then refines with a few ICP iterations.
 */
export function fitClosedLoops(
  src: readonly Point2[],
  dst: readonly Point2[],
  { samples = 256, icpIterations = 15, densify = 4096 } = {},
): LoopFit {
  const dstR = resampleClosed(dst, samples);
  let best: { fit: SimilarityFit; flipY: boolean } | null = null;

  for (const flipY of [false, true]) {
    const srcF = src.map((p) => ({ x: p.x, y: flipY ? -p.y : p.y }));
    const srcR = resampleClosed(srcF, samples);
    for (const reversed of [false, true]) {
      const base = reversed ? [...srcR].reverse() : srcR;
      for (let shift = 0; shift < samples; shift++) {
        const shifted = base.map((_, i) => base[(i + shift) % samples]!);
        const fit = fitSimilarity(shifted, dstR);
        if (!best || fit.rms < best.fit.rms) best = { fit, flipY };
      }
    }
  }
  if (!best) throw new Error("fitClosedLoops: no fit");

  // ICP: re-pair each source sample with its nearest point on the densified
  // destination, refit, repeat. Fixes uneven arc-length parametrisation.
  const flipY = best.flipY;
  const srcR = resampleClosed(
    src.map((p) => ({ x: p.x, y: flipY ? -p.y : p.y })),
    samples * 2,
  );
  const dstDense = resampleClosed(dst, densify);
  let fit = best.fit;
  for (let it = 0; it < icpIterations; it++) {
    const pairs = srcR.map((p) => dstDense[nearestIndex(applySimilarity(fit, p), dstDense)]!);
    fit = fitSimilarity(srcR, pairs);
  }

  let sse = 0;
  let maxD = 0;
  for (const p of srcR) {
    const q = applySimilarity(fit, p);
    const n = dstDense[nearestIndex(q, dstDense)]!;
    const d = Math.hypot(q.x - n.x, q.y - n.y);
    sse += d * d;
    if (d > maxD) maxD = d;
  }
  return {
    ...fit,
    flipY,
    rmsNearest: Math.sqrt(sse / srcR.length),
    maxNearest: maxD,
  };
}
