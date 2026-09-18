import { useQuery, useQueryClient } from "@tanstack/react-query";
import { api } from "@/api/endpoints";
import type { Lap } from "@/api/types";
import { TRACK_OUTLINE_LAP } from "@/constants";
import { getCircuitGeometry } from "@/data/circuitGeometry";
import { getCircuitLayout } from "@/data/circuits";
import { lapsQueryKey } from "@/hooks/queryKeys";

// How many drivers the GPS fallback will try before giving up. Each attempt
// costs one /location request, so keep this small to protect the rate budget.
export const MAX_GPS_OUTLINE_ATTEMPTS = 3;

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

/**
 * True for the sentinel position OpenF1 uses when a vehicle is not on track:
 * a safety car not deployed for this event, the medical car in its bay, or a
 * car sitting in the garage. It applies to every number, not just the
 * reserved vehicle ones.
 */
export function isOffTrackPlaceholder(pos: {
  x: number;
  y: number;
}): boolean {
  return pos.x === 0 && pos.y === 0;
}

export function locationToSvg(
  x: number,
  y: number,
  bounds: TrackBounds,
  svgW: number,
  svgH: number,
) {
  // Give the track a small margin so rotated outlines remain fully visible in
  // compact previews and dialogs, instead of clipping at the view edges.
  const padding = 12;
  const safeW = Math.max(1, svgW - padding * 2);
  const safeH = Math.max(1, svgH - padding * 2);
  const scale = Math.min(safeW / bounds.width, safeH / bounds.height);
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

function bakedOutline(circuitKey: number | null, year: number | null) {
  if (circuitKey === null) return null;
  const geom = getCircuitGeometry(circuitKey, year);
  if (!geom || geom.x.length === 0) return null;
  const points = geom.x.map((x, i) => ({ x, y: geom.y[i]! }));
  const bounds = computeTrackBounds(points);
  return { points, bounds, source: "baked" as const };
}

/**
 * Picks the lap used to trace one driver's outline: a clean early lap
 * (`preferredLap`), else lap 3, else the first lap with a plausible duration.
 */
export function pickOutlineLap(
  laps: readonly Lap[],
  driverNumber: number,
  preferredLap = TRACK_OUTLINE_LAP,
): Lap | null {
  const valid = laps.filter(
    (l) =>
      l.driver_number === driverNumber &&
      Boolean(l.date_start) &&
      l.lap_duration !== null &&
      l.lap_duration > 30,
  );
  return (
    valid.find((l) => l.lap_number === preferredLap) ??
    valid.find((l) => l.lap_number === 3) ??
    valid[0] ??
    null
  );
}

/**
 * Returns a clean track outline as `{ points, bounds }`.
 *
 * Fast path: if baked official geometry exists for `circuitKey` (generated by
 * `node scripts/fetch-circuits.mjs`), returns it immediately from cache —
 * no API calls, no GPS processing.
 *
 * Fallback: uses the session's lap list (shared with the rest of the app via
 * the `laps` query) to find a clean lap for one of the candidate drivers, then
 * fetches that single lap of location data from OpenF1 and uses the raw GPS
 * points. If a driver's lap has no location rows, the next candidate is tried,
 * up to `MAX_GPS_OUTLINE_ATTEMPTS` drivers. Less accurate than baked geometry
 * but works for any circuit.
 *
 * `driverNumbers` may be a single driver or an ordered list of candidates.
 * With an empty candidate list and no baked geometry the query stays pending
 * (so callers show a loading state, not "no data") until drivers arrive.
 */
export function useTrackOutline(
  sessionKey: number | null,
  driverNumbers: number | readonly number[] | null,
  circuitKey: number | null = null,
  circuitShortName: string | null = null,
  preferredLap = TRACK_OUTLINE_LAP,
  year: number | null = null,
) {
  const queryClient = useQueryClient();
  const candidates: number[] =
    driverNumbers === null
      ? []
      : typeof driverNumbers === "number"
        ? [driverNumbers]
        : [...driverNumbers];
  const candidatesKey = candidates.join(",");

  // Baked data is available synchronously, so seed the cache with it and
  // never wait on the network.
  const baked = bakedOutline(circuitKey, year);
  const canDeriveGps = sessionKey !== null && candidates.length > 0;

  return useQuery({
    queryKey: [
      "trackOutline",
      sessionKey,
      candidatesKey,
      circuitKey,
      circuitShortName,
      preferredLap,
      year,
    ],
    queryFn: async () => {
      // ── Fast path: official baked geometry ─────────────────────────────────
      if (baked) return baked;

      // ── Fallback: GPS single-lap derivation ─────────────────────────────────
      if (sessionKey === null || candidates.length === 0) {
        return deriveLayoutOutline(circuitShortName);
      }

      // One request for the whole session, shared with useLaps() callers.
      const laps = await queryClient.fetchQuery({
        queryKey: lapsQueryKey(sessionKey),
        queryFn: () => api.laps(sessionKey),
        staleTime: Infinity,
      });

      let attempts = 0;
      for (const driverNumber of candidates) {
        if (attempts >= MAX_GPS_OUTLINE_ATTEMPTS) break;
        const lap = pickOutlineLap(laps, driverNumber, preferredLap);
        if (!lap?.date_start || !lap.lap_duration) continue;
        attempts++;

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
        if (!data.length) continue;
        const bounds = computeTrackBounds(data);
        return {
          points: data as { x: number; y: number }[],
          bounds,
          source: "gps" as const,
        };
      }

      return deriveLayoutOutline(circuitShortName);
    },
    // When baked data is available, seed the cache immediately so there is no
    // loading spinner on first render.
    initialData: baked ?? undefined,
    // Show an immediate coarse outline while GPS data is loading. Unlike
    // initialData, placeholderData still allows queryFn to run. Must resolve to
    // `undefined` (not `null`) when no layout exists: a `null` placeholder makes
    // react-query report success with `data === null`, which callers read as
    // "no location data" while the fetch is still in flight.
    placeholderData: (previousData) =>
      previousData ?? deriveLayoutOutline(circuitShortName) ?? undefined,
    // Without baked geometry, wait for the driver list before fetching so a
    // `null` result is never produced just because drivers haven't loaded yet.
    enabled:
      baked !== null ||
      canDeriveGps ||
      (sessionKey === null && circuitKey !== null),
    staleTime: Infinity,
  });
}
