// Pure geometry for the schedule page's world map: an equirectangular frame
// in degrees (x = lng + 180, y = 90 − lat, so x ∈ [0, 360], y grows south),
// a camera (centre + width, height from the viewport aspect), marker
// clustering in screen pixels and season travel legs.

export interface LngLat {
  lng: number;
  lat: number;
}

export interface MapPoint {
  x: number;
  y: number;
}

export interface MapBounds {
  x: number;
  y: number;
  w: number;
  h: number;
}

/** Centre and width of the view in map units; height is `w / aspect`. */
export interface MapCamera {
  cx: number;
  cy: number;
  w: number;
}

export const WORLD_MAP_WIDTH = 360;
const EARTH_RADIUS_KM = 6371.0088;
// fitCamera never lets margins take more than this much of a tiny viewport.
const MIN_USABLE_FRACTION = 0.2;

export function projectLngLat({ lng, lat }: LngLat): MapPoint {
  return { x: lng + 180, y: 90 - lat };
}

export function worldBounds(maxLat: number, minLat: number): MapBounds {
  return { x: 0, y: 90 - maxLat, w: WORLD_MAP_WIDTH, h: maxLat - minLat };
}

export function cameraViewBox(camera: MapCamera, aspect: number): MapBounds {
  const h = camera.w / aspect;
  return { x: camera.cx - camera.w / 2, y: camera.cy - h / 2, w: camera.w, h };
}

/** Widest view: the whole of `bounds` visible. */
export function maxCameraWidth(bounds: MapBounds, aspect: number): number {
  return Math.max(bounds.w, bounds.h * aspect);
}

// Width between `minW` and the full map; centre kept inside the bounds, or
// centred on them along an axis the view is larger than.
export function clampCamera(
  camera: MapCamera,
  aspect: number,
  bounds: MapBounds,
  minW: number,
): MapCamera {
  const w = Math.min(Math.max(camera.w, minW), maxCameraWidth(bounds, aspect));
  const h = w / aspect;
  const clampAxis = (c: number, start: number, size: number, span: number) =>
    span >= size
      ? start + size / 2
      : Math.min(Math.max(c, start + span / 2), start + size - span / 2);
  return {
    cx: clampAxis(camera.cx, bounds.x, bounds.w, w),
    cy: clampAxis(camera.cy, bounds.y, bounds.h, h),
    w,
  };
}

/**
 * Smallest camera showing every point at least `padPx` screen pixels inside
 * a `widthPx`-wide viewport (so markers clear the map's overlay controls).
 */
export function fitCamera(
  points: MapPoint[],
  aspect: number,
  bounds: MapBounds,
  { padPx, widthPx, minW }: { padPx: number; widthPx: number; minW: number },
): MapCamera {
  if (points.length === 0) {
    return clampCamera(
      { cx: bounds.x + bounds.w / 2, cy: bounds.y + bounds.h / 2, w: Infinity },
      aspect,
      bounds,
      minW,
    );
  }
  const xs = points.map((p) => p.x);
  const ys = points.map((p) => p.y);
  const minX = Math.min(...xs);
  const maxX = Math.max(...xs);
  const minY = Math.min(...ys);
  const maxY = Math.max(...ys);
  // Share of each axis left for the points once both margins are taken.
  const usableX = Math.max(1 - (2 * padPx) / widthPx, MIN_USABLE_FRACTION);
  const usableY = Math.max(1 - (2 * padPx * aspect) / widthPx, MIN_USABLE_FRACTION);
  return clampCamera(
    {
      cx: (minX + maxX) / 2,
      cy: (minY + maxY) / 2,
      w: Math.max((maxX - minX) / usableX, ((maxY - minY) / usableY) * aspect),
    },
    aspect,
    bounds,
    minW,
  );
}

/** Zoom by `factor` (> 1 zooms out) keeping `anchor` fixed on screen. */
export function zoomCameraAt(
  camera: MapCamera,
  factor: number,
  anchor: MapPoint = { x: camera.cx, y: camera.cy },
): MapCamera {
  return {
    cx: anchor.x + (camera.cx - anchor.x) * factor,
    cy: anchor.y + (camera.cy - anchor.y) * factor,
    w: camera.w * factor,
  };
}

// Width interpolates geometrically so zooming feels uniform.
export function lerpCamera(a: MapCamera, b: MapCamera, t: number): MapCamera {
  return {
    cx: a.cx + (b.cx - a.cx) * t,
    cy: a.cy + (b.cy - a.cy) * t,
    w: a.w * Math.pow(b.w / a.w, t),
  };
}

export function mapToScreen(
  point: MapPoint,
  view: MapBounds,
  widthPx: number,
  heightPx: number,
): MapPoint {
  return {
    x: ((point.x - view.x) / view.w) * widthPx,
    y: ((point.y - view.y) / view.h) * heightPx,
  };
}

export function screenToMap(
  point: MapPoint,
  view: MapBounds,
  widthPx: number,
  heightPx: number,
): MapPoint {
  return {
    x: view.x + (point.x / widthPx) * view.w,
    y: view.y + (point.y / heightPx) * view.h,
  };
}

export interface ClusterInput<K> extends MapPoint {
  id: K;
}

export interface MarkerCluster<K> extends MapPoint {
  ids: K[];
}

// Greedy, in input order: each marker joins the first cluster whose centre
// is within `radius`, else starts its own. Deterministic for a given order.
export function clusterMarkers<K>(
  markers: ClusterInput<K>[],
  radius: number,
): MarkerCluster<K>[] {
  const clusters: (MarkerCluster<K> & { sx: number; sy: number })[] = [];
  for (const marker of markers) {
    const hit = clusters.find(
      (c) => Math.hypot(c.x - marker.x, c.y - marker.y) <= radius,
    );
    if (hit) {
      hit.ids.push(marker.id);
      hit.sx += marker.x;
      hit.sy += marker.y;
      hit.x = hit.sx / hit.ids.length;
      hit.y = hit.sy / hit.ids.length;
    } else {
      clusters.push({ ids: [marker.id], x: marker.x, y: marker.y, sx: marker.x, sy: marker.y });
    }
  }
  return clusters.map(({ ids, x, y }) => ({ ids, x, y }));
}

/** Great-circle distance in km. */
export function haversineKm(a: LngLat, b: LngLat): number {
  const rad = Math.PI / 180;
  const dLat = (b.lat - a.lat) * rad;
  const dLng = (b.lng - a.lng) * rad;
  const h =
    Math.sin(dLat / 2) ** 2 +
    Math.cos(a.lat * rad) * Math.cos(b.lat * rad) * Math.sin(dLng / 2) ** 2;
  return 2 * EARTH_RADIUS_KM * Math.asin(Math.min(1, Math.sqrt(h)));
}

/** Sum of the great-circle legs between consecutive stops. */
export function travelDistanceKm(stops: LngLat[]): number {
  let total = 0;
  for (let i = 1; i < stops.length; i++) total += haversineKm(stops[i - 1], stops[i]);
  return total;
}

// Quadratic curve from a to b bowed to the north (smaller y) by `bow` × the
// leg's length, like a flight path. Empty for a zero-length leg.
export function legArcPath(a: MapPoint, b: MapPoint, bow: number): string {
  const dx = b.x - a.x;
  const dy = b.y - a.y;
  const len = Math.hypot(dx, dy);
  if (len === 0) return "";
  // Unit normal, flipped to point north.
  let nx = -dy / len;
  let ny = dx / len;
  if (ny > 0 || (ny === 0 && nx > 0)) {
    nx = -nx;
    ny = -ny;
  }
  const qx = (a.x + b.x) / 2 + nx * len * bow;
  const qy = (a.y + b.y) / 2 + ny * len * bow;
  const r = (v: number) => Math.round(v * 100) / 100;
  return `M${r(a.x)} ${r(a.y)}Q${r(qx)} ${r(qy)} ${r(b.x)} ${r(b.y)}`;
}
