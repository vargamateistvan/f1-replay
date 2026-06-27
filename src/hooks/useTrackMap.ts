import { useQuery } from "@tanstack/react-query";
import { api } from "@/api/endpoints";
import { TRACK_OUTLINE_LAP } from "@/constants";
import { getCircuitGeometry } from "@/data/circuitGeometry";
import { getCircuitLayout } from "@/data/circuits";

export interface TrackBounds {
  minX: number;
  maxX: number;
  minY: number;
  maxY: number;
  width: number;
  height: number;
}

export function computeTrackBounds(
  points: readonly { x: number; y: number }[],
): TrackBounds {
  let minX = Infinity,
    maxX = -Infinity;
  let minY = Infinity,
    maxY = -Infinity;
  for (const p of points) {
    if (p.x < minX) minX = p.x;
    if (p.x > maxX) maxX = p.x;
    if (p.y < minY) minY = p.y;
    if (p.y > maxY) maxY = p.y;
  }
  return { minX, maxX, minY, maxY, width: maxX - minX, height: maxY - minY };
}

function cross(
  origin: { x: number; y: number },
  a: { x: number; y: number },
  b: { x: number; y: number },
) {
  return (
    (a.x - origin.x) * (b.y - origin.y) - (a.y - origin.y) * (b.x - origin.x)
  );
}

function convexHull(points: Array<{ x: number; y: number }>) {
  const sorted = [...points].sort((a, b) =>
    a.x === b.x ? a.y - b.y : a.x - b.x,
  );
  if (sorted.length <= 3) return sorted;

  const lower: Array<{ x: number; y: number }> = [];
  for (const point of sorted) {
    while (
      lower.length >= 2 &&
      cross(lower[lower.length - 2]!, lower[lower.length - 1]!, point) <= 0
    ) {
      lower.pop();
    }
    lower.push(point);
  }

  const upper: Array<{ x: number; y: number }> = [];
  for (let i = sorted.length - 1; i >= 0; i--) {
    const point = sorted[i]!;
    while (
      upper.length >= 2 &&
      cross(upper[upper.length - 2]!, upper[upper.length - 1]!, point) <= 0
    ) {
      upper.pop();
    }
    upper.push(point);
  }

  lower.pop();
  upper.pop();
  return [...lower, ...upper];
}

function deriveLayoutOutline(circuitShortName: string | null) {
  if (!circuitShortName) return null;
  const layout = getCircuitLayout(circuitShortName);
  if (!layout) return null;

  const points: Array<{ x: number; y: number }> = [];
  for (const sector of layout.sectors) {
    points.push(
      { x: sector.bounds.minX, y: sector.bounds.minY },
      { x: sector.bounds.minX, y: sector.bounds.maxY },
      { x: sector.bounds.maxX, y: sector.bounds.minY },
      { x: sector.bounds.maxX, y: sector.bounds.maxY },
    );
  }
  for (const zone of layout.drsZones) {
    points.push(
      { x: zone.line.x1, y: zone.line.y1 },
      { x: zone.line.x2, y: zone.line.y2 },
    );
  }

  const hull = convexHull(points);
  if (hull.length < 3) return null;
  const bounds = computeTrackBounds(hull);
  return { points: hull, bounds, source: "layout" as const };
}

export function locationToSvg(
  x: number,
  y: number,
  bounds: TrackBounds,
  svgW: number,
  svgH: number,
) {
  // Uniform scale so the real-world aspect ratio is preserved (letterbox if needed).
  const scale = Math.min(svgW / bounds.width, svgH / bounds.height);
  const mapW = bounds.width * scale;
  const mapH = bounds.height * scale;
  const offX = (svgW - mapW) / 2;
  const offY = (svgH - mapH) / 2;
  const sx = (x - bounds.minX) * scale + offX;
  const sy = mapH - (y - bounds.minY) * scale + offY; // flip Y axis
  return { sx, sy };
}

function normalizeRotationDeg(deg: number): number {
  let normalized = deg;
  while (normalized <= -180) normalized += 360;
  while (normalized > 180) normalized -= 360;
  return normalized;
}

function normalizeHorizontalLevelDeg(deg: number): number {
  let normalized = normalizeRotationDeg(deg);
  if (normalized <= -90) normalized += 180;
  else if (normalized > 90) normalized -= 180;
  return normalizeRotationDeg(normalized);
}

interface HeadingCandidate {
  dx: number;
  dy: number;
  lenSq: number;
}

function bestHeadingInRange(
  points: readonly { x: number; y: number }[],
  startIdx: number,
  endIdx: number,
  lookahead: number,
): HeadingCandidate | null {
  let best: HeadingCandidate | null = null;
  for (let i = startIdx; i < endIdx; i++) {
    const a = points[i]!;
    const b = points[i + lookahead]!;
    const dx = b.x - a.x;
    const dy = b.y - a.y;
    const lenSq = dx * dx + dy * dy;
    if (lenSq <= Number.EPSILON) continue;
    if (!best || lenSq > best.lenSq) best = { dx, dy, lenSq };
  }
  return best;
}

/**
 * Computes a default map rotation that levels the major straight.
 *
 * Preference order:
 * 1) Straight near lap start (proxy for pit/start-finish straight).
 * 2) Longest straight-like segment across the full track.
 */
export function computeTrackAutoRotationDeg(
  points: readonly { x: number; y: number }[],
  flipY = false,
): number {
  if (points.length < 2) return 0;

  const lookahead = Math.max(
    1,
    Math.min(12, Math.floor(points.length * 0.015)),
  );
  const maxStart = points.length - lookahead;
  if (maxStart <= 0) return 0;

  const startWindowEnd = Math.max(
    1,
    Math.min(maxStart, Math.floor(points.length * 0.14)),
  );

  const nearStart = bestHeadingInRange(points, 0, startWindowEnd, lookahead);
  const global = bestHeadingInRange(points, 0, maxStart, lookahead);
  const best =
    nearStart && global && nearStart.lenSq >= global.lenSq * 0.2
      ? nearStart
      : (global ?? nearStart);
  if (!best) return 0;

  const dy = flipY ? -best.dy : best.dy;
  const headingDeg = (Math.atan2(dy, best.dx) * 180) / Math.PI;
  return normalizeHorizontalLevelDeg(-headingDeg);
}

/**
 * Returns a clean track outline as `{ points, bounds }`.
 *
 * Fast path: if baked official geometry exists for `circuitKey` (generated by
 * `node scripts/fetch-circuits.mjs`), returns it immediately from cache —
 * no API calls, no GPS processing.
 *
 * Fallback: fetches one clean lap of location data from OpenF1 and uses the
 * raw GPS points. Less accurate but works for any circuit without baked data.
 */
export function useTrackOutline(
  sessionKey: number | null,
  driverNumber: number | null,
  circuitKey: number | null = null,
  circuitShortName: string | null = null,
  preferredLap = TRACK_OUTLINE_LAP,
) {
  return useQuery({
    queryKey: [
      "trackOutline",
      sessionKey,
      driverNumber,
      circuitKey,
      circuitShortName,
      preferredLap,
    ],
    queryFn: async () => {
      // ── Fast path: official baked geometry ─────────────────────────────────
      if (circuitKey !== null) {
        const geom = getCircuitGeometry(circuitKey);
        if (geom && geom.x.length > 0) {
          const points = geom.x.map((x, i) => ({ x, y: geom.y[i]! }));
          const bounds = computeTrackBounds(points);
          return { points, bounds, source: "baked" as const };
        }
      }

      // ── Fallback: GPS single-lap derivation ─────────────────────────────────
      if (sessionKey === null || driverNumber === null) return null;

      const laps = await api.laps(sessionKey, driverNumber);
      const validLaps = laps.filter(
        (l) => l.date_start && l.lap_duration !== null && l.lap_duration! > 30,
      );
      const lap =
        validLaps.find((l) => l.lap_number === preferredLap) ??
        validLaps.find((l) => l.lap_number === 3) ??
        validLaps[0];

      if (!lap?.date_start || !lap.lap_duration) return null;

      const startDate = lap.date_start;
      const endMs =
        new Date(lap.date_start).getTime() + (lap.lap_duration + 2) * 1000;
      const endDate = new Date(endMs).toISOString();

      const data = await api.locationForDriver(
        sessionKey,
        driverNumber,
        startDate,
        endDate,
      );
      if (!data.length) return deriveLayoutOutline(circuitShortName);
      const bounds = computeTrackBounds(data);
      return {
        points: data as { x: number; y: number }[],
        bounds,
        source: "gps" as const,
      };
    },
    // When baked data is available, seed the cache immediately so there is no
    // loading spinner on first render.
    initialData: (() => {
      if (circuitKey === null) return undefined;
      const geom = getCircuitGeometry(circuitKey);
      if (!geom || geom.x.length === 0) return undefined;
      const points = geom.x.map((x, i) => ({ x, y: geom.y[i]! }));
      const bounds = computeTrackBounds(points);
      return { points, bounds, source: "baked" as const };
    })(),
    enabled: sessionKey !== null || circuitKey !== null,
    staleTime: Infinity,
  });
}
