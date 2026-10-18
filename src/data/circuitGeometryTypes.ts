export interface CornerInfo {
  number: number
  letter: string
  angle: number
  length: number
  trackPosition: { x: number; y: number }
}

export interface MarshalSector {
  number: number;
  angle?: number;
  length?: number;
  trackPosition: { x: number; y: number };
}

export interface MarshalLight {
  number: number;
  angle?: number;
  length?: number;
  trackPosition: { x: number; y: number };
}

export interface PitLoss {
  normal?: string;
  sc?: string;
  vsc?: string;
}

export interface CircuitGeometry {
  circuitKey: number;
  circuitName: string;
  year: number;
  /**
   * Where the centerline came from. Absent = MultiViewer (official, with
   * corners and marshal sectors). "openf1-gps" = one fast lap's GPS trace,
   * baked by scripts/bake-gps-circuits.mjs for circuits MultiViewer lacks;
   * those have no corners or marshal sectors.
   */
  source?: "openf1-gps";
  /** Degrees CW to orient the map to broadcast convention. Applied as SVG transform. */
  rotation: number;
  /** Centerline x-coords in the F1 Cartesian space (same origin as OpenF1 /location). */
  x: number[];
  /** Centerline y-coords in the F1 Cartesian space. */
  y: number[];
  corners: CornerInfo[];
  marshalSectors: MarshalSector[];
  marshalLights: MarshalLight[];
  pitLoss?: PitLoss;
}
