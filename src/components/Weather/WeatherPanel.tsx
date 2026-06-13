import { useMemo } from 'react'
import type { Weather } from '@/api/types'

// 16-point compass from degrees
function windDir(deg: number): string {
  const dirs = ['N','NNE','NE','ENE','E','ESE','SE','SSE','S','SSW','SW','WSW','W','WNW','NW','NNW']
  return dirs[Math.round(deg / 22.5) % 16] ?? '—'
}

interface Props {
  readonly entries: Weather[]
  readonly sessionTimeMs: number
  readonly sessionStartMs: number
}

export function WeatherPanel({ entries, sessionTimeMs, sessionStartMs }: Props) {
  const currentT = sessionStartMs + sessionTimeMs

  const w = useMemo(
    () => [...entries].filter((e) => new Date(e.date).getTime() <= currentT).at(-1),
    [entries, currentT],
  )

  // Previous reading (for trend arrows)
  const prev = useMemo(
    () => [...entries].filter((e) => new Date(e.date).getTime() <= currentT - 60_000).at(-1),
    [entries, currentT],
  )

  if (!w) {
    return <div className="text-muted text-xs p-3">No weather data</div>
  }

  const isRaining = w.rainfall > 0
  const trackDelta = prev ? w.track_temperature - prev.track_temperature : 0
  const trend = (delta: number) => delta > 0.2 ? '▲' : delta < -0.2 ? '▼' : ''

  return (
    <div className={`p-2 text-xs font-mono transition-colors ${isRaining ? 'bg-blue-950/40' : ''}`}>
      {isRaining && (
        <div className="text-blue-300 font-bold text-[10px] tracking-widest mb-1 uppercase">
          Rain
        </div>
      )}
      <div className="grid grid-cols-[auto_1fr_auto_1fr] gap-x-3 gap-y-0.5">
        <span className="text-muted">Track</span>
        <span className="tabular-nums">
          {w.track_temperature.toFixed(1)}°C
          <span className="text-yellow-400 ml-0.5 text-[10px]">{trend(trackDelta)}</span>
        </span>
        <span className="text-muted">Air</span>
        <span className="tabular-nums">{w.air_temperature.toFixed(1)}°C</span>

        <span className="text-muted">Humidity</span>
        <span className="tabular-nums">{w.humidity}%</span>
        <span className="text-muted">Pressure</span>
        <span className="tabular-nums">{w.pressure.toFixed(0)} hPa</span>

        <span className="text-muted">Wind</span>
        <span className="tabular-nums col-span-3">
          {w.wind_speed.toFixed(1)} m/s {windDir(w.wind_direction)} ({w.wind_direction}°)
        </span>
      </div>
    </div>
  )
}
