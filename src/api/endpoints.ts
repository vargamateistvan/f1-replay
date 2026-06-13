import { fetchEndpoint } from './client'
import type {
  Meeting, Session, Driver, Location, CarData,
  Lap, Position, Interval, Pit, Stint,
  RaceControl, TeamRadio, Weather, SessionResult, StartingGrid,
} from './types'

export const api = {
  meetings: (year: number) =>
    fetchEndpoint<Meeting>('meetings', { year }),

  sessions: (meetingKey: number) =>
    fetchEndpoint<Session>('sessions', { meeting_key: meetingKey }),

  sessionsByYear: (year: number) =>
    fetchEndpoint<Session>('sessions', { year }),

  drivers: (sessionKey: number) =>
    fetchEndpoint<Driver>('drivers', { session_key: sessionKey }),

  // Location for one driver in a date window — used to derive track outline
  locationForDriver: (sessionKey: number, driverNumber: number, dateGte: string, dateLte: string) =>
    fetchEndpoint<Location>('location', {
      session_key: sessionKey,
      driver_number: driverNumber,
      'date>': dateGte,
      'date<': dateLte,
    }),

  // Location for ALL drivers in a date window — used for replay animation
  locationWindow: (sessionKey: number, dateGte: string, dateLte: string) =>
    fetchEndpoint<Location>('location', {
      session_key: sessionKey,
      'date>': dateGte,
      'date<': dateLte,
    }),

  // Car data for one driver in a date window — used for telemetry page
  carDataForDriver: (sessionKey: number, driverNumber: number, dateGte: string, dateLte: string) =>
    fetchEndpoint<CarData>('car_data', {
      session_key: sessionKey,
      driver_number: driverNumber,
      'date>': dateGte,
      'date<': dateLte,
    }),

  carData: (sessionKey: number, driverNumber: number) =>
    fetchEndpoint<CarData>('car_data', { session_key: sessionKey, driver_number: driverNumber }),

  laps: (sessionKey: number, driverNumber?: number) =>
    fetchEndpoint<Lap>('laps', driverNumber
      ? { session_key: sessionKey, driver_number: driverNumber }
      : { session_key: sessionKey }),

  positions: (sessionKey: number) =>
    fetchEndpoint<Position>('position', { session_key: sessionKey }),

  intervals: (sessionKey: number) =>
    fetchEndpoint<Interval>('intervals', { session_key: sessionKey }),

  pits: (sessionKey: number) =>
    fetchEndpoint<Pit>('pit', { session_key: sessionKey }),

  stints: (sessionKey: number) =>
    fetchEndpoint<Stint>('stints', { session_key: sessionKey }),

  raceControl: (sessionKey: number) =>
    fetchEndpoint<RaceControl>('race_control', { session_key: sessionKey }),

  teamRadio: (sessionKey: number) =>
    fetchEndpoint<TeamRadio>('team_radio', { session_key: sessionKey }),

  weather: (sessionKey: number) =>
    fetchEndpoint<Weather>('weather', { session_key: sessionKey }),

  sessionResult: (sessionKey: number) =>
    fetchEndpoint<SessionResult>('session_result', { session_key: sessionKey }),

  startingGrid: (sessionKey: number) =>
    fetchEndpoint<StartingGrid>('starting_grid', { session_key: sessionKey }),
}
