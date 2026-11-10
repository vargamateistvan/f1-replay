import type { Driver, Interval, Lap, Pit, Position, SessionResult, Stint } from "../src/api/types";
import type { GridCell, ProgressionRound } from "../src/utils/championship";
import type { DriverStanding } from "../src/utils/standings";
import { TOKEN_HEX } from "../src/designTokens";
import { SAMPLE_DRIVER } from "./fixtures";

export const SAMPLE_DRIVERS: Driver[] = [
  SAMPLE_DRIVER,
  { ...SAMPLE_DRIVER, driver_number: 8, name_acronym: "CRV", full_name: "Casey Curve", first_name: "Casey", last_name: "Curve" },
  { ...SAMPLE_DRIVER, driver_number: 9, name_acronym: "RCE", full_name: "Riley Race", first_name: "Riley", last_name: "Race", team_name: "Orange Motorsport", team_colour: TOKEN_HEX.orange.slice(1) },
  { ...SAMPLE_DRIVER, driver_number: 10, name_acronym: "PIT", full_name: "Parker Pit", first_name: "Parker", last_name: "Pit", team_name: "Orange Motorsport", team_colour: TOKEN_HEX.orange.slice(1) },
];

export const SAMPLE_ROUNDS: ProgressionRound[] = [
  { sessionKey: 1, label: "Sample opener", code: "R1", isSprint: false },
  { sessionKey: 2, label: "Sample sprint", code: "R2", isSprint: true },
  { sessionKey: 3, label: "Sample Grand Prix", code: "R2", isSprint: false },
  { sessionKey: 4, label: "Sample finale", code: "R3", isSprint: false },
];
export const SAMPLE_CELLS = new Map<number, (GridCell | null)[]>([
  [7, [
    { position: 1, points: 25, status: "finished", pole: true, qualifying: 1 },
    { position: 2, points: 7, status: "finished" },
    { position: 2, points: 18, status: "finished", qualifying: 3 },
    { position: 1, points: 25, status: "finished", pole: true, qualifying: 1 },
  ]],
  [8, [
    { position: 2, points: 18, status: "finished", qualifying: 2 },
    { position: 3, points: 6, status: "finished" },
    { position: 1, points: 25, status: "finished", pole: true, qualifying: 1 },
    { position: null, points: 0, status: "dnf", qualifying: 2 },
  ]],
  [9, [
    { position: 3, points: 15, status: "finished", qualifying: 4 },
    { position: 1, points: 8, status: "finished" },
    { position: null, points: 0, status: "dsq", qualifying: 2 },
    { position: 3, points: 15, status: "finished", qualifying: 3 },
  ]],
  [10, [
    { position: 4, points: 12, status: "finished", qualifying: 3 },
    null,
    { position: 3, points: 15, status: "finished", qualifying: 4 },
    { position: null, points: 0, status: "dns" },
  ]],
]);
export const SAMPLE_STANDINGS: DriverStanding[] = SAMPLE_DRIVERS.map((driver, i) => {
  const cells = SAMPLE_CELLS.get(driver.driver_number)!;
  return {
    position: i + 1,
    driverNumber: driver.driver_number,
    driver,
    acronym: driver.name_acronym,
    fullName: driver.full_name,
    team: driver.team_name,
    color: `#${driver.team_colour}`,
    points: cells.reduce((sum, cell) => sum + (cell?.points ?? 0), 0),
    wins: cells.filter((cell, index) => !SAMPLE_ROUNDS[index]!.isSprint && cell?.position === 1).length,
    podiums: cells.filter((cell, index) => !SAMPLE_ROUNDS[index]!.isSprint && cell?.position != null && cell.position <= 3).length,
  };
});

export const SAMPLE_RESULTS: SessionResult[] = SAMPLE_DRIVERS.map((driver, i) => ({
  driver_number: driver.driver_number,
  position: i < 3 ? i + 1 : null,
  number_of_laps: i < 3 ? 12 : 7,
  points: [25, 18, 15, 0][i]!,
  dnf: i === 3,
  dns: false,
  dsq: false,
  duration: i < 3 ? 1080 + i * 4.5 : null,
  gap_to_leader: i === 0 ? 0 : i < 3 ? i * 4.5 : null,
  session_key: -1,
  meeting_key: -1,
}));

export const SAMPLE_START_MS = Date.parse("2026-01-01T12:00:00Z");
export const SAMPLE_LAP_MS = 90000;
export const SAMPLE_LAP_COUNT = 12;
export const SAMPLE_LAP_STARTS = Array.from({ length: SAMPLE_LAP_COUNT }, (_, i) => i * SAMPLE_LAP_MS);
export const SAMPLE_CHART_TIME_MS = SAMPLE_LAP_MS * 8;
export const SAMPLE_POSITIONS: Position[] = [];
export const SAMPLE_INTERVALS: Interval[] = [];
export const SAMPLE_LAPS: Lap[] = [];

SAMPLE_LAP_STARTS.forEach((ms, lapIndex) => {
  SAMPLE_DRIVERS.forEach((driver, i) => {
    const swapped = lapIndex >= 4 && lapIndex < 7;
    const position = swapped && i < 2 ? 2 - i : i + 1;
    SAMPLE_POSITIONS.push({
      date: new Date(SAMPLE_START_MS + ms).toISOString(),
      driver_number: driver.driver_number,
      session_key: -1,
      meeting_key: -1,
      position,
    });
    const gapStep = 2 + lapIndex * 0.4 + Math.sin(lapIndex) * 0.5;
    const gap = (position - 1) * gapStep;
    SAMPLE_INTERVALS.push({
      date: new Date(SAMPLE_START_MS + ms).toISOString(),
      driver_number: driver.driver_number,
      session_key: -1,
      meeting_key: -1,
      gap_to_leader: gap,
      interval: position === 1 ? 0 : gapStep,
    });
    SAMPLE_LAPS.push({
      date_start: new Date(SAMPLE_START_MS + ms).toISOString(),
      driver_number: driver.driver_number,
      session_key: -1,
      meeting_key: -1,
      lap_number: lapIndex + 1,
      lap_duration: SAMPLE_LAP_MS / 1000,
      duration_sector_1: 30,
      duration_sector_2: 30,
      duration_sector_3: 30,
      segments_sector_1: null,
      segments_sector_2: null,
      segments_sector_3: null,
      i1_speed: null,
      i2_speed: null,
      st_speed: null,
      is_pit_out_lap: lapIndex === 6,
    });
  });
});

export const SAMPLE_STINTS: Stint[] = SAMPLE_DRIVERS.flatMap((driver, i) => [
  {
    driver_number: driver.driver_number, session_key: -1, meeting_key: -1,
    stint_number: 1, lap_start: 1, lap_end: 6, tyre_age_at_start: i,
    compound: i % 2 ? "MEDIUM" : "SOFT",
  },
  {
    driver_number: driver.driver_number, session_key: -1, meeting_key: -1,
    stint_number: 2, lap_start: 7, lap_end: SAMPLE_LAP_COUNT, tyre_age_at_start: 0,
    compound: "HARD",
  },
]);
export const SAMPLE_PITS: Pit[] = SAMPLE_DRIVERS.map((driver, i) => ({
  driver_number: driver.driver_number, session_key: -1, meeting_key: -1,
  date: new Date(SAMPLE_START_MS + SAMPLE_LAP_MS * 6).toISOString(),
  lap_number: 6,
  stop_duration: 2.3 + i * 0.2,
  lane_duration: 22 + i * 0.2,
  pit_duration: null,
}));
