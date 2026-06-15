import type { GeoAffine } from "@/data/circuitGeometryTypes";

export type { GeoAffine };

/** Convert one F1 Cartesian point to WGS84 using a baked affine. */
export function applyGeoAffine(
  affine: GeoAffine,
  x: number,
  y: number,
): { lng: number; lat: number } {
  return {
    lng: affine.a * x + affine.b * y + affine.c,
    lat: affine.d * x + affine.e * y + affine.f,
  };
}
