import { fetchEndpoint } from "./client";
import type {
  Meeting,
  Session,
  Driver,
  Location,
  CarData,
  Lap,
  Position,
  Interval,
  Pit,
  Stint,
  RaceControl,
  TeamRadio,
  Weather,
  SessionResult,
  StartingGrid,
  Overtake,
  ChampionshipDriver,
  ChampionshipTeam,
} from "./types";

type QueryValue = string | number | boolean;
type QueryFilters = Record<string, QueryValue>;

export const api = {
  meetings: (year: number) => fetchEndpoint<Meeting>("meetings", { year }),

  sessions: (meetingKey: number) =>
    fetchEndpoint<Session>("sessions", { meeting_key: meetingKey }),

  sessionsByYear: (year: number) =>
    fetchEndpoint<Session>("sessions", { year }),

  drivers: (sessionKey: number) =>
    fetchEndpoint<Driver>("drivers", { session_key: sessionKey }),

  // Location for one driver in a date window — used to derive track outline
  locationForDriver: (
    sessionKey: number,
    driverNumber: number,
    dateGte: string,
    dateLte: string,
  ) =>
    fetchEndpoint<Location>("location", {
      session_key: sessionKey,
      driver_number: driverNumber,
      "date>": dateGte,
      "date<": dateLte,
    }),

  // Location for ALL drivers in a date window — used for replay animation
  locationWindow: (sessionKey: number, dateGte: string, dateLte: string) =>
    fetchEndpoint<Location>("location", {
      session_key: sessionKey,
      "date>": dateGte,
      "date<": dateLte,
    }),

  // Car data for one driver in a date window — used for telemetry page
  carDataForDriver: (
    sessionKey: number,
    driverNumber: number,
    dateGte: string,
    dateLte: string,
  ) =>
    fetchEndpoint<CarData>("car_data", {
      session_key: sessionKey,
      driver_number: driverNumber,
      "date>": dateGte,
      "date<": dateLte,
    }),

  carData: (sessionKey: number, driverNumber: number) =>
    fetchEndpoint<CarData>("car_data", {
      session_key: sessionKey,
      driver_number: driverNumber,
    }),

  // Car data for ALL drivers in a date window — used for the leaderboard telemetry
  // columns. A 5-min window is ~22k rows (20 drivers × 3.7 Hz × 300 s), one request.
  carDataWindowAll: (sessionKey: number, dateGte: string, dateLte: string) =>
    fetchEndpoint<CarData>("car_data", {
      session_key: sessionKey,
      "date>": dateGte,
      "date<": dateLte,
    }),

  laps: (
    sessionKey: number,
    driverNumber?: number,
    filters: QueryFilters = {},
  ) =>
    fetchEndpoint<Lap>(
      "laps",
      driverNumber
        ? { session_key: sessionKey, driver_number: driverNumber, ...filters }
        : { session_key: sessionKey, ...filters },
    ),

  positions: (sessionKey: number, filters: QueryFilters = {}) =>
    fetchEndpoint<Position>("position", {
      session_key: sessionKey,
      ...filters,
    }),

  intervals: (sessionKey: number, filters: QueryFilters = {}) =>
    fetchEndpoint<Interval>("intervals", {
      session_key: sessionKey,
      ...filters,
    }),

  pits: (sessionKey: number, filters: QueryFilters = {}) =>
    fetchEndpoint<Pit>("pit", { session_key: sessionKey, ...filters }),

  stints: (sessionKey: number, filters: QueryFilters = {}) =>
    fetchEndpoint<Stint>("stints", { session_key: sessionKey, ...filters }),

  raceControl: (sessionKey: number, filters: QueryFilters = {}) =>
    fetchEndpoint<RaceControl>("race_control", {
      session_key: sessionKey,
      ...filters,
    }),

  teamRadio: (sessionKey: number, filters: QueryFilters = {}) =>
    fetchEndpoint<TeamRadio>("team_radio", {
      session_key: sessionKey,
      ...filters,
    }),

  weather: (sessionKey: number, filters: QueryFilters = {}) =>
    fetchEndpoint<Weather>("weather", { session_key: sessionKey, ...filters }),

  sessionResult: (sessionKey: number, filters: QueryFilters = {}) =>
    fetchEndpoint<SessionResult>("session_result", {
      session_key: sessionKey,
      ...filters,
    }),

  startingGrid: (sessionKey: number, filters: QueryFilters = {}) =>
    fetchEndpoint<StartingGrid>("starting_grid", {
      session_key: sessionKey,
      ...filters,
    }),

  overtakes: (sessionKey: number, filters: QueryFilters = {}) =>
    fetchEndpoint<Overtake>("overtakes", {
      session_key: sessionKey,
      ...filters,
    }),

  championshipDrivers: (sessionKey: number, filters: QueryFilters = {}) =>
    fetchEndpoint<ChampionshipDriver>("championship_drivers", {
      session_key: sessionKey,
      ...filters,
    }),

  championshipTeams: (sessionKey: number, filters: QueryFilters = {}) =>
    fetchEndpoint<ChampionshipTeam>("championship_teams", {
      session_key: sessionKey,
      ...filters,
    }),
};
