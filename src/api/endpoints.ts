import { fetchEndpoint } from './client'
import type {
  Meeting, Session, Driver, Location, CarData,
  Lap, Position, Interval, Pit, Stint,
  RaceControl, TeamRadio, Weather,
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

  // Location for one lap to derive track outline
  locationLap: (sessionKey: number, driverNumber: number, lapNumber: number) =>
    fetchEndpoint<Location>('location', { session_key: sessionKey, driver_number: driverNumber, lap_number: lapNumber }),

  // Location for all drivers in a time window (replay)
  locationWindow: (sessionKey: number, dateGte: string, dateLte: string) =>
    fetchEndpoint<Location>('location', { session_key: sessionKey, 'date>': dateGte, 'date<': dateLte }),

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
}
