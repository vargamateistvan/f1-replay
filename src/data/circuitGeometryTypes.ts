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
  corners: CornerInfo[]
  marshalSectors: MarshalSector[]
  marshalLights: MarshalLight[]
}
