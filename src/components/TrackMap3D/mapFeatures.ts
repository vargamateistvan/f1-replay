/**
 * Pure GeoJSON / style builders for the 3D (Mapbox) track map. Everything here
 * takes F1-frame geometry plus the circuit's georef and returns plain data, so
 * it is unit-testable without WebGL.
 */
import type { ExpressionSpecification } from "mapbox-gl";
import type { CircuitGeometry } from "@/data/circuitGeometryTypes";
import { FLAG_COLORS } from "@/constants";
import {
  isActiveTrackFlag,
  resolveFlagForMarshalPost,
  type TrackFlagState,
} from "@/timeline/raceControl";
import { type CircuitGeoref, f1ToEnu, f1ToLngLat } from "@/utils/georef";

export type LngLat = [number, number];

export interface LineFeature {
  type: "Feature";
  id?: number;
  properties: Record<string, string | number | boolean | number[]>;
  geometry: { type: "LineString"; coordinates: LngLat[] };
}

export interface PointFeature {
  type: "Feature";
  id?: number;
  properties: Record<string, string | number | boolean | number[]>;
  geometry: { type: "Point"; coordinates: LngLat };
}

export interface FeatureCollection<F> {
  type: "FeatureCollection";
  features: F[];
}

function centerline(geom: CircuitGeometry, geo: CircuitGeoref): LngLat[] {
  return geom.x.map((x, i) => f1ToLngLat(geo, x, geom.y[i]!));
}

/** The circuit centerline as a closed LineString. */
export function buildTrackLine(
  geom: CircuitGeometry,
  geo: CircuitGeoref,
): LineFeature {
  const coords = centerline(geom, geo);
  if (coords.length > 0) coords.push(coords[0]!);
  return {
    type: "Feature",
    properties: {},
    geometry: { type: "LineString", coordinates: coords },
  };
}

/** A baked pit-lane path as an open LineString. */
export function buildPitLaneLine(
  lane: { x: readonly number[]; y: readonly number[] },
  geo: CircuitGeoref,
): LineFeature {
  return {
    type: "Feature",
    properties: {},
    geometry: {
      type: "LineString",
      coordinates: lane.x.map((x, i) => f1ToLngLat(geo, x, lane.y[i]!)),
    },
  };
}

/** [[west, south], [east, north]] of the centerline. */
export function trackBounds(line: LineFeature): [LngLat, LngLat] {
  let w = Infinity,
    s = Infinity,
    e = -Infinity,
    n = -Infinity;
  for (const [lng, lat] of line.geometry.coordinates) {
    if (lng < w) w = lng;
    if (lng > e) e = lng;
    if (lat < s) s = lat;
    if (lat > n) n = lat;
  }
  return [
    [w, s],
    [e, n],
  ];
}

function nearestCenterlineIndex(
  geom: CircuitGeometry,
  x: number,
  y: number,
): number {
  let best = 0;
  let bestD = Infinity;
  for (let i = 0; i < geom.x.length; i++) {
    const d = (geom.x[i]! - x) ** 2 + (geom.y[i]! - y) ** 2;
    if (d < bestD) {
      bestD = d;
      best = i;
    }
  }
  return best;
}

/**
 * One centerline piece per marshal post, from the post to the next post in
 * track order (the last wraps to the first). Feature `id` is the marshal post
 * number, so flags can be painted with `setFeatureState`.
 */
export function buildMarshalSectorLines(
  geom: CircuitGeometry,
  geo: CircuitGeoref,
): FeatureCollection<LineFeature> {
  const n = geom.x.length;
  const coords = centerline(geom, geo);
  const posts = geom.marshalSectors
    .map((ms) => ({
      number: ms.number,
      index: nearestCenterlineIndex(geom, ms.trackPosition.x, ms.trackPosition.y),
    }))
    .sort((a, b) => a.index - b.index);

  const features = posts.map((post, i): LineFeature => {
    const end = posts[(i + 1) % posts.length]!.index;
    const span = posts.length === 1 ? n : (end - post.index + n) % n;
    const segment: LngLat[] = [];
    for (let k = 0; k <= span; k++) segment.push(coords[(post.index + k) % n]!);
    return {
      type: "Feature",
      id: post.number,
      properties: { marshal: post.number },
      geometry: { type: "LineString", coordinates: segment },
    };
  });
  return { type: "FeatureCollection", features };
}

/** Corner number labels at the baked label positions. */
export function buildCornerPoints(
  geom: CircuitGeometry,
  geo: CircuitGeoref,
): FeatureCollection<PointFeature> {
  return {
    type: "FeatureCollection",
    features: geom.corners.map((c) => ({
      type: "Feature",
      properties: { label: `${c.number}${c.letter}` },
      geometry: {
        type: "Point",
        coordinates: f1ToLngLat(geo, c.trackPosition.x, c.trackPosition.y),
      },
    })),
  };
}

/** Flag colour for a marshal post's segment, or null when nothing to paint. */
export function marshalSegmentColor(
  state: TrackFlagState | null,
  post: number,
): string | null {
  const flag = resolveFlagForMarshalPost(state, post);
  if (!isActiveTrackFlag(flag)) return null;
  return FLAG_COLORS[flag!] ?? null;
}

const WEB_MERCATOR_MPP_Z0 = (2 * Math.PI * 6_378_137) / 512;

/**
 * Mapbox `line-width` expression that draws a line `metres` wide on the
 * ground at latitude `lat`, never thinner than `minPx`. With `sign` -1 it
 * doubles as a `line-offset` to the other side of the line. (`zoom` may only feed
 * a top-level interpolate, so the clamp is baked into the stops.)
 */
export function groundWidthExpression(
  metres: number,
  lat: number,
  minPx: number,
  sign: 1 | -1 = 1,
): ExpressionSpecification {
  const stops: number[] = [];
  for (let z = 8; z <= 22; z += 2) {
    const mpp = (WEB_MERCATOR_MPP_Z0 * Math.cos((lat * Math.PI) / 180)) / 2 ** z;
    stops.push(z, sign * Math.max(minPx, Number((metres / mpp).toFixed(2))));
  }
  return [
    "interpolate",
    ["exponential", 2],
    ["zoom"],
    ...stops,
  ] as ExpressionSpecification;
}

/**
 * Compass bearing (degrees, 0 = north, clockwise) of travel from F1 point a
 * to b, or null when they coincide.
 */
export function headingDeg(
  geo: CircuitGeoref,
  a: { x: number; y: number },
  b: { x: number; y: number },
): number | null {
  const pa = f1ToEnu(geo, a.x, a.y);
  const pb = f1ToEnu(geo, b.x, b.y);
  const de = pb.x - pa.x;
  const dn = pb.y - pa.y;
  if (Math.hypot(de, dn) < 0.5) return null;
  return ((Math.atan2(de, dn) * 180) / Math.PI + 360) % 360;
}

/**
 * Map bearing that shows the circuit the way the 2D map does (broadcast
 * orientation): the baked `rotation` turns the F1 frame, and the F1 frame
 * itself is turned `geo.rotation` away from east/north.
 */
export function broadcastBearing(
  geom: CircuitGeometry | null,
  geo: CircuitGeoref,
): number {
  const rotation = Number.isFinite(geom?.rotation) ? geom!.rotation : 0;
  const frameDeg = ((geo.flipY ? -1 : 1) * geo.rotation * 180) / Math.PI;
  return (((rotation + frameDeg) % 360) + 360) % 360;
}

/** Shortest-path angular lerp in degrees. */
export function lerpAngleDeg(from: number, to: number, alpha: number): number {
  const diff = ((((to - from) % 360) + 540) % 360) - 180;
  return (from + diff * alpha + 360) % 360;
}
