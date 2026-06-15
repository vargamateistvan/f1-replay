export interface CornerInfo {
  number: number
  letter: string
  angle: number
  length: number
  trackPosition: { x: number; y: number }
}

export interface MarshalSector {
  number: number
  trackPosition: { x: number; y: number }
}

export interface MarshalLight {
  number: number
  trackPosition: { x: number; y: number }
}

/** 2-D affine: maps F1 Cartesian (x, y) → WGS84 (lng, lat).
 *  lng = a*x + b*y + c
 *  lat = d*x + e*y + f
 *  Baked by scripts/fetch-circuits.mjs when a matching f1-circuits GeoJSON is
 *  found. Absent = satellite mode is disabled for this circuit. */
export interface GeoAffine {
  a: number; b: number; c: number;
  d: number; e: number; f: number;
}

export interface CircuitGeometry {
  circuitKey: number
  circuitName: string
  year: number
  /** Degrees CW to orient the map to broadcast convention. Applied as SVG transform. */
  rotation: number
  /** Centerline x-coords in the F1 Cartesian space (same origin as OpenF1 /location). */
  x: number[]
  /** Centerline y-coords in the F1 Cartesian space. */
  y: number[]
  /** Centerline z-coords (elevation, same unit as x/y). Optional — baked when available from MultiViewer. */
  z?: number[]
  corners: CornerInfo[]
  marshalSectors: MarshalSector[]
  marshalLights: MarshalLight[]
  /** Cartesian→WGS84 affine. Present when f1-circuits data was available at bake time. */
  geoAffine?: GeoAffine
}
