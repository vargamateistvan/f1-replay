import type { Driver, Interval, Location, Stint, Weather } from "../src/api/types";
import { loadCircuitGeometry, type CircuitGeometry } from "../src/data/circuitGeometry";
import type { TrackFlagState } from "../src/timeline/raceControl";
import silverstone from "../src/data/circuit-geometry/2-2026.json";
import monaco from "../src/data/circuit-geometry/22-2026.json";
import { TOKEN_HEX } from "../src/designTokens";
import { SAMPLE_DRIVER } from "./fixtures";

export const TRACK_SESSION_START = Date.parse("2026-07-05T14:00:00Z");
export const TRACK_LAP_MS = 90000;
export const TRACK_DURATION_MS = TRACK_LAP_MS * 2;
const SAMPLE_STEP_MS = 500;

export const TRACK_DRIVERS: Driver[] = [
  SAMPLE_DRIVER,
  { ...SAMPLE_DRIVER, driver_number: 8, name_acronym: "CRV", full_name: "Casey Curve", team_colour: TOKEN_HEX.orange.slice(1) },
  { ...SAMPLE_DRIVER, driver_number: 9, name_acronym: "RCE", full_name: "Riley Race", team_colour: TOKEN_HEX.green.slice(1) },
  { ...SAMPLE_DRIVER, driver_number: 10, name_acronym: "PIT", full_name: "Parker Pit", team_colour: TOKEN_HEX.purple.slice(1) },
  { ...SAMPLE_DRIVER, driver_number: 11, name_acronym: "SPD", full_name: "Sam Speed", team_colour: TOKEN_HEX.teal.slice(1) },
  { ...SAMPLE_DRIVER, driver_number: 12, name_acronym: "TRK", full_name: "Taylor Track", team_colour: TOKEN_HEX.red.slice(1) },
];

export const TRACK_COMPOUNDS = new Map<number, { compound: Stint["compound"]; age: number }>(
  TRACK_DRIVERS.map((driver, i) => [
    driver.driver_number,
    { compound: i % 2 ? "MEDIUM" : "HARD", age: 12 + i },
  ]),
);
export const TRACK_POSITIONS = new Map(TRACK_DRIVERS.map((driver, i) => [driver.driver_number, i + 1]));
export const TRACK_GAPS = new Map(TRACK_DRIVERS.map((driver, i) => [driver.driver_number, i * 4.5]));
export const TRACK_INTERVALS = new Map<number, Pick<Interval, "gap_to_leader" | "interval">>(
  TRACK_DRIVERS.map((driver, i) => [
    driver.driver_number,
    { gap_to_leader: i * 4.5, interval: i === 0 ? 0 : 4.5 },
  ]),
);

export const TRACK_WEATHER: Weather = {
  date: new Date(TRACK_SESSION_START).toISOString(),
  session_key: -1,
  meeting_key: -1,
  air_temperature: 22,
  track_temperature: 34,
  humidity: 58,
  pressure: 1012,
  rainfall: 0,
  wind_direction: 225,
  wind_speed: 3,
};
export const RAIN_WEATHER: Weather = { ...TRACK_WEATHER, rainfall: 1, humidity: 90 };
export const YELLOW_FLAGS: TrackFlagState = {
  globalFlag: null,
  marshalFlags: { 3: "YELLOW", 4: "YELLOW" },
  maxMarshalSector: silverstone.marshalSectors.length,
  updatedAtMs: 0,
};
export const SAFETY_CAR_FLAGS: TrackFlagState = {
  ...YELLOW_FLAGS,
  marshalFlags: {},
  globalFlag: "SAFETY_CAR",
};

function simulatedLocations(geometry: CircuitGeometry): Location[] {
  const rows: Location[] = [];
  for (let ms = 0; ms <= TRACK_DURATION_MS; ms += SAMPLE_STEP_MS) {
    TRACK_DRIVERS.forEach((driver, i) => {
      const progress = ((ms / TRACK_LAP_MS - i * 0.05 + 1) % 1) * geometry.x.length;
      const index = Math.floor(progress);
      const next = (index + 1) % geometry.x.length;
      const fraction = progress - index;
      rows.push({
        date: new Date(TRACK_SESSION_START + ms).toISOString(),
        driver_number: driver.driver_number,
        session_key: -1,
        meeting_key: -1,
        x: geometry.x[index]! + (geometry.x[next]! - geometry.x[index]!) * fraction,
        y: geometry.y[index]! + (geometry.y[next]! - geometry.y[index]!) * fraction,
        z: 0,
      });
    });
  }
  return rows;
}

export const SILVERSTONE_LOCATIONS = simulatedLocations(silverstone);
export const MONACO_LOCATIONS = simulatedLocations(monaco);
export const TRACK_GEOMETRY: CircuitGeometry = silverstone;

export async function loadTrackGeometry() {
  const geometries = await Promise.all([
    loadCircuitGeometry(2, 2026),
    loadCircuitGeometry(22, 2026),
  ]);
  if (geometries.some((geometry) => geometry === null)) {
    throw new Error("Track stories require baked Silverstone and Monaco geometry");
  }
  return {};
}

export const TRACK_ARGS = {
  sessionKey: -1,
  sessionStartMs: TRACK_SESSION_START,
  drivers: TRACK_DRIVERS,
  locationData: SILVERSTONE_LOCATIONS,
  circuitKey: 2,
  circuitShortName: "Silverstone",
  year: 2026,
  previewTimeMs: 30000,
  activeCompounds: TRACK_COMPOUNDS,
  raceLeader: TRACK_DRIVERS[0],
  leaderNumber: TRACK_DRIVERS[0]!.driver_number,
  telemetryEnabled: false,
  showFocusedHud: false,
  showTrackScreenshot: false,
  weatherOverlay: TRACK_WEATHER,
};
