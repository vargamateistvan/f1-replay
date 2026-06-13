export interface Meeting {
  meeting_key: number
  meeting_name: string
  meeting_official_name: string
  location: string
  country_key: number
  country_code: string
  country_name: string
  circuit_key: number
  circuit_short_name: string
  date_start: string
  gmt_offset: string
  year: number
}

export interface Session {
  session_key: number
  session_name: string
  session_type: 'Practice' | 'Qualifying' | 'Race' | 'Sprint' | 'Sprint Qualifying'
  date_start: string
  date_end: string
  meeting_key: number
  circuit_key: number
  circuit_short_name: string
  country_key: number
  country_code: string
  country_name: string
  location: string
  gmt_offset: string
  year: number
  is_cancelled: boolean
}

export interface Driver {
  driver_number: number
  broadcast_name: string
  full_name: string
  name_acronym: string
  team_name: string
  team_colour: string
  first_name: string
  last_name: string
  headshot_url: string | null
  country_code: string
  session_key: number
  meeting_key: number
}

export interface Location {
  date: string
  driver_number: number
  meeting_key: number
  session_key: number
  x: number
  y: number
  z: number
}

export interface CarData {
  brake: number
  date: string
  driver_number: number
  drs: number
  meeting_key: number
  n_gear: number
  rpm: number
  session_key: number
  speed: number
  throttle: number
}

export interface Lap {
  date_start: string
  driver_number: number
  duration_sector_1: number | null
  duration_sector_2: number | null
  duration_sector_3: number | null
  i1_speed: number | null
  i2_speed: number | null
  is_pit_out_lap: boolean
  lap_duration: number | null
  lap_number: number
  meeting_key: number
  segments_sector_1: number[] | null
  segments_sector_2: number[] | null
  segments_sector_3: number[] | null
  session_key: number
  st_speed: number | null
}

export interface Position {
  date: string
  driver_number: number
  meeting_key: number
  position: number
  session_key: number
}

export interface Interval {
  date: string
  driver_number: number
  gap_to_leader: number | null
  interval: number | null
  meeting_key: number
  session_key: number
}

export interface Pit {
  date: string
  driver_number: number
  lap_number: number
  meeting_key: number
  pit_duration: number | null
  session_key: number
}

export interface Stint {
  compound: 'SOFT' | 'MEDIUM' | 'HARD' | 'INTERMEDIATE' | 'WET' | 'UNKNOWN'
  driver_number: number
  lap_end: number
  lap_start: number
  meeting_key: number
  session_key: number
  stint_number: number
  tyre_age_at_start: number
}

export interface RaceControl {
  category: string
  date: string
  driver_number: number | null
  flag: string | null
  lap_number: number | null
  meeting_key: number
  message: string
  scope: string | null
  sector: number | null
  session_key: number
}

export interface TeamRadio {
  date: string
  driver_number: number
  meeting_key: number
  recording_url: string
  session_key: number
}

export interface Weather {
  air_temperature: number
  date: string
  humidity: number
  meeting_key: number
  pressure: number
  rainfall: number
  session_key: number
  track_temperature: number
  wind_direction: number
  wind_speed: number
}
