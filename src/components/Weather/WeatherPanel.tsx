import type { Weather } from '@/api/types'

interface Props {
  entries: Weather[]
  sessionTimeMs: number
  sessionStartMs: number
}

export function WeatherPanel({ entries, sessionTimeMs, sessionStartMs }: Props) {
  const currentT = sessionStartMs + sessionTimeMs
  const w = [...entries]
    .filter((e) => new Date(e.date).getTime() <= currentT)
    .at(-1)

  if (!w) return <div className="text-muted text-xs p-3">No weather data</div>

  const rows = [
    { label: 'Track', value: `${w.track_temperature.toFixed(1)} °C` },
    { label: 'Air', value: `${w.air_temperature.toFixed(1)} °C` },
    { label: 'Humidity', value: `${w.humidity} %` },
    { label: 'Wind', value: `${w.wind_speed.toFixed(1)} m/s ${w.wind_direction}°` },
    { label: 'Rain', value: w.rainfall ? '🌧 Yes' : 'No' },
  ]

  return (
    <div className="p-3 text-xs font-mono grid grid-cols-2 gap-x-4 gap-y-1">
      {rows.map(({ label, value }) => (
        <>
          <span key={`l-${label}`} className="text-muted">{label}</span>
          <span key={`v-${label}`} className="text-white tabular-nums">{value}</span>
        </>
      ))}
    </div>
  )
}
