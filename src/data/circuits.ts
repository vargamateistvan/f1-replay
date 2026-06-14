// Circuit definitions with GPS-based sector and DRS zone coordinates
// Coordinates are approximate real-world GPS points used to define track regions

export interface Sector {
  number: 1 | 2 | 3;
  name: string;
  bounds: { minX: number; maxX: number; minY: number; maxY: number };
}

export interface DrsZone {
  name: string;
  line: { x1: number; y1: number; x2: number; y2: number };
}

export interface CircuitLayout {
  name: string;
  sectors: Sector[];
  drsZones: DrsZone[];
}

const CIRCUITS: Record<string, CircuitLayout> = {
  BAH: {
    name: "Bahrain",
    sectors: [
      {
        number: 1,
        name: "Sector 1",
        bounds: { minX: 54.35, maxX: 54.42, minY: 26.12, maxY: 26.21 },
      },
      {
        number: 2,
        name: "Sector 2",
        bounds: { minX: 54.38, maxX: 54.52, minY: 26.12, maxY: 26.16 },
      },
      {
        number: 3,
        name: "Sector 3",
        bounds: { minX: 54.35, maxX: 54.42, minY: 26.09, maxY: 26.17 },
      },
    ],
    drsZones: [
      {
        name: "DRS 1",
        line: { x1: 54.42, y1: 26.21, x2: 54.42, y2: 26.18 },
      },
      {
        name: "DRS 2",
        line: { x1: 54.52, y1: 26.13, x2: 54.48, y2: 26.13 },
      },
    ],
  },
  SAU: {
    name: "Saudi Arabia",
    sectors: [
      {
        number: 1,
        name: "Sector 1",
        bounds: { minX: 39.09, maxX: 39.19, minY: 21.42, maxY: 21.52 },
      },
      {
        number: 2,
        name: "Sector 2",
        bounds: { minX: 39.12, maxX: 39.29, minY: 21.41, maxY: 21.52 },
      },
      {
        number: 3,
        name: "Sector 3",
        bounds: { minX: 39.09, maxX: 39.18, minY: 21.38, maxY: 21.47 },
      },
    ],
    drsZones: [
      {
        name: "DRS 1",
        line: { x1: 39.19, y1: 21.52, x2: 39.16, y2: 21.48 },
      },
      {
        name: "DRS 2",
        line: { x1: 39.29, y1: 21.46, x2: 39.24, y2: 21.42 },
      },
    ],
  },
  AUS: {
    name: "Australia",
    sectors: [
      {
        number: 1,
        name: "Sector 1",
        bounds: { minX: 144.97, maxX: 145.04, minY: -37.81, maxY: -37.75 },
      },
      {
        number: 2,
        name: "Sector 2",
        bounds: { minX: 145.01, maxX: 145.08, minY: -37.82, maxY: -37.75 },
      },
      {
        number: 3,
        name: "Sector 3",
        bounds: { minX: 144.97, maxX: 145.05, minY: -37.85, maxY: -37.79 },
      },
    ],
    drsZones: [
      {
        name: "DRS 1",
        line: { x1: 145.04, y1: -37.75, x2: 145.03, y2: -37.78 },
      },
      {
        name: "DRS 2",
        line: { x1: 145.08, y1: -37.78, x2: 145.04, y2: -37.82 },
      },
    ],
  },
  JPN: {
    name: "Japan",
    sectors: [
      {
        number: 1,
        name: "Sector 1",
        bounds: { minX: 130.48, maxX: 130.56, minY: 34.79, maxY: 34.85 },
      },
      {
        number: 2,
        name: "Sector 2",
        bounds: { minX: 130.51, maxX: 130.61, minY: 34.79, maxY: 34.88 },
      },
      {
        number: 3,
        name: "Sector 3",
        bounds: { minX: 130.48, maxX: 130.56, minY: 34.78, maxY: 34.86 },
      },
    ],
    drsZones: [
      {
        name: "DRS 1",
        line: { x1: 130.56, y1: 34.85, x2: 130.54, y2: 34.82 },
      },
      {
        name: "DRS 2",
        line: { x1: 130.61, y1: 34.84, x2: 130.57, y2: 34.8 },
      },
    ],
  },
  SGP: {
    name: "Singapore",
    sectors: [
      {
        number: 1,
        name: "Sector 1",
        bounds: { minX: 103.89, maxX: 103.94, minY: 1.34, maxY: 1.4 },
      },
      {
        number: 2,
        name: "Sector 2",
        bounds: { minX: 103.89, maxX: 103.95, minY: 1.33, maxY: 1.4 },
      },
      {
        number: 3,
        name: "Sector 3",
        bounds: { minX: 103.88, maxX: 103.94, minY: 1.32, maxY: 1.38 },
      },
    ],
    drsZones: [
      {
        name: "DRS 1",
        line: { x1: 103.94, y1: 1.4, x2: 103.92, y2: 1.37 },
      },
      {
        name: "DRS 2",
        line: { x1: 103.95, y1: 1.36, x2: 103.9, y2: 1.33 },
      },
    ],
  },
  USA: {
    name: "USA",
    sectors: [
      {
        number: 1,
        name: "Sector 1",
        bounds: { minX: -97.64, maxX: -97.58, minY: 30.27, maxY: 30.33 },
      },
      {
        number: 2,
        name: "Sector 2",
        bounds: { minX: -97.62, maxX: -97.56, minY: 30.26, maxY: 30.34 },
      },
      {
        number: 3,
        name: "Sector 3",
        bounds: { minX: -97.64, maxX: -97.57, minY: 30.25, maxY: 30.32 },
      },
    ],
    drsZones: [
      {
        name: "DRS 1",
        line: { x1: -97.58, y1: 30.33, x2: -97.58, y2: 30.29 },
      },
      {
        name: "DRS 2",
        line: { x1: -97.56, y1: 30.3, x2: -97.58, y2: 30.26 },
      },
    ],
  },
  BRA: {
    name: "Brazil",
    sectors: [
      {
        number: 1,
        name: "Sector 1",
        bounds: { minX: -46.54, maxX: -46.48, minY: -23.27, maxY: -23.21 },
      },
      {
        number: 2,
        name: "Sector 2",
        bounds: { minX: -46.52, maxX: -46.46, minY: -23.28, maxY: -23.2 },
      },
      {
        number: 3,
        name: "Sector 3",
        bounds: { minX: -46.54, maxX: -46.48, minY: -23.3, maxY: -23.22 },
      },
    ],
    drsZones: [
      {
        name: "DRS 1",
        line: { x1: -46.48, y1: -23.21, x2: -46.48, y2: -23.25 },
      },
      {
        name: "DRS 2",
        line: { x1: -46.46, y1: -23.24, x2: -46.5, y2: -23.28 },
      },
    ],
  },
  ABU: {
    name: "Abu Dhabi",
    sectors: [
      {
        number: 1,
        name: "Sector 1",
        bounds: { minX: 54.35, maxX: 54.44, minY: 24.46, maxY: 24.53 },
      },
      {
        number: 2,
        name: "Sector 2",
        bounds: { minX: 54.38, maxX: 54.48, minY: 24.44, maxY: 24.54 },
      },
      {
        number: 3,
        name: "Sector 3",
        bounds: { minX: 54.35, maxX: 54.44, minY: 24.43, maxY: 24.51 },
      },
    ],
    drsZones: [
      {
        name: "DRS 1",
        line: { x1: 54.44, y1: 24.53, x2: 54.42, y2: 24.5 },
      },
      {
        name: "DRS 2",
        line: { x1: 54.48, y1: 24.48, x2: 54.44, y2: 24.44 },
      },
    ],
  },
};

export function getCircuitLayout(
  circuitShortName: string,
): CircuitLayout | null {
  return CIRCUITS[circuitShortName] ?? null;
}
