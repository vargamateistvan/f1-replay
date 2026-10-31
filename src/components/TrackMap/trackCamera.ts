export interface CameraView {
  x: number;
  y: number;
  w: number;
  h: number;
}

export function clampFollowView(
  cx: number,
  cy: number,
  svgW: number,
  svgH: number,
  followW: number,
  followH: number,
): CameraView {
  const x = Math.max(0, Math.min(svgW - followW, cx - followW / 2));
  const y = Math.max(0, Math.min(svgH - followH, cy - followH / 2));
  return { x, y, w: followW, h: followH };
}

export function lerpCameraView(
  from: CameraView,
  to: CameraView,
  alpha: number,
): CameraView {
  const t = Math.max(0, Math.min(1, alpha));
  const x = from.x + (to.x - from.x) * t;
  const y = from.y + (to.y - from.y) * t;
  const w = from.w + (to.w - from.w) * t;
  const h = from.h + (to.h - from.h) * t;
  return { x, y, w, h };
}

export interface TrackFit {
  /** Uniform scale applied about the pivot. */
  scale: number;
  /** Shift (after rotation and scale) that centres the outline on the pivot. */
  dx: number;
  dy: number;
}

/**
 * Part of the SVG coordinate space visible when the full `svgW` × `svgH`
 * viewBox is letterboxed (`xMidYMid meet`) into a container of `aspect`
 * (width / height): the wider axis shows extra room either side.
 */
export function visibleViewSize(
  svgW: number,
  svgH: number,
  aspect: number,
): { w: number; h: number } {
  if (!Number.isFinite(aspect) || aspect <= 0) return { w: svgW, h: svgH };
  return aspect >= svgW / svgH
    ? { w: svgH * aspect, h: svgH }
    : { w: svgW, h: svgW / aspect };
}

/**
 * The outline is fitted to the viewport before the map is rotated, so a
 * rotated circuit can stick out. Returns the largest scale (≤ `maxScale`) at
 * which the outline, rotated by `rotationDeg` about the pivot, fits `availW` ×
 * `availH`, plus the shift that centres it on the pivot.
 */
export function fitRotatedTrack(
  points: ReadonlyArray<{ sx: number; sy: number }>,
  rotationDeg: number,
  pivotX: number,
  pivotY: number,
  availW: number,
  availH: number,
  maxScale: number,
): TrackFit {
  if (points.length === 0) return { scale: maxScale, dx: 0, dy: 0 };
  const rad = (rotationDeg * Math.PI) / 180;
  const cos = Math.cos(rad);
  const sin = Math.sin(rad);
  let minX = Infinity;
  let maxX = -Infinity;
  let minY = Infinity;
  let maxY = -Infinity;
  for (const p of points) {
    const x = p.sx - pivotX;
    const y = p.sy - pivotY;
    const rx = x * cos - y * sin;
    const ry = x * sin + y * cos;
    if (rx < minX) minX = rx;
    if (rx > maxX) maxX = rx;
    if (ry < minY) minY = ry;
    if (ry > maxY) maxY = ry;
  }
  const w = maxX - minX;
  const h = maxY - minY;
  const scale = Math.max(
    0,
    Math.min(
      maxScale,
      w > 0 ? availW / w : maxScale,
      h > 0 ? availH / h : maxScale,
    ),
  );
  return {
    scale,
    dx: -scale * ((minX + maxX) / 2),
    dy: -scale * ((minY + maxY) / 2),
  };
}
