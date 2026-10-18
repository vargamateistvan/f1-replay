/**
 * Minimap inset for the 3D map's close-up cameras (chase, onboard, TV): the
 * circuit in the 2D map's broadcast orientation, fitted into a small box.
 * Pure so the projection can be unit-tested; MiniMap.tsx renders it.
 */
import type { CircuitGeometry } from "@/data/circuitGeometryTypes";

export interface MiniMapProjection {
  readonly width: number;
  readonly height: number;
  readonly pathData: string;
  /** F1-frame x/y → minimap px. */
  project(x: number, y: number): { sx: number; sy: number };
}

/**
 * Same orientation as the 2D map: flip Y (F1 frame is Y-up, SVG Y-down), then
 * rotate by −`rotation` (the reflection reverses its direction). The longer
 * side of the result is `size` px including `pad` on every edge.
 */
export function buildMiniMapProjection(
  geom: Pick<CircuitGeometry, "x" | "y" | "rotation">,
  size: number,
  pad: number,
): MiniMapProjection | null {
  const n = Math.min(geom.x.length, geom.y.length);
  if (n < 3) return null;
  const a = ((Number.isFinite(geom.rotation) ? -geom.rotation : 0) * Math.PI) / 180;
  const cos = Math.cos(a);
  const sin = Math.sin(a);
  const turn = (x: number, y: number) => ({
    rx: x * cos + y * sin,
    ry: x * sin - y * cos,
  });

  let minX = Infinity;
  let maxX = -Infinity;
  let minY = Infinity;
  let maxY = -Infinity;
  const turned: Array<{ rx: number; ry: number }> = [];
  for (let i = 0; i < n; i++) {
    const p = turn(geom.x[i]!, geom.y[i]!);
    turned.push(p);
    if (p.rx < minX) minX = p.rx;
    if (p.rx > maxX) maxX = p.rx;
    if (p.ry < minY) minY = p.ry;
    if (p.ry > maxY) maxY = p.ry;
  }
  const spanX = maxX - minX || 1;
  const spanY = maxY - minY || 1;
  const scale = (size - pad * 2) / Math.max(spanX, spanY);
  const width = spanX * scale + pad * 2;
  const height = spanY * scale + pad * 2;
  const toPx = (p: { rx: number; ry: number }) => ({
    sx: (p.rx - minX) * scale + pad,
    sy: (p.ry - minY) * scale + pad,
  });

  // Every few points is plenty at this size.
  const step = Math.max(1, Math.floor(n / 300));
  let pathData = "";
  for (let i = 0; i < n; i += step) {
    const { sx, sy } = toPx(turned[i]!);
    pathData += `${i === 0 ? "M" : "L"}${sx.toFixed(1)},${sy.toFixed(1)}`;
  }
  pathData += "Z";

  return {
    width,
    height,
    pathData,
    project: (x, y) => toPx(turn(x, y)),
  };
}
