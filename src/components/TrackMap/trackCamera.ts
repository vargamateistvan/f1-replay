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
