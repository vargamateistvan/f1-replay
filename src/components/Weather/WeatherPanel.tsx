import { useMemo } from "react";
import { CloudRain, Droplets, Gauge, Thermometer, Wind } from "lucide-react";
import type { Weather } from "@/api/types";
import { downloadEndpointCsv } from "@/api/client";
import { useSettings } from "@/stores/settings";
import { weatherAtSessionTime } from "@/utils/weather";
import {
  toDisplayTemperature,
  toDisplayWindSpeed,
  temperatureUnitLabel,
  windSpeedUnitLabel,
} from "@/utils/units";

// 16-point compass from degrees
function windDir(deg: number): string {
  const dirs = [
    "N",
    "NNE",
    "NE",
    "ENE",
    "E",
    "ESE",
    "SE",
    "SSE",
    "S",
    "SSW",
    "SW",
    "WSW",
    "W",
    "WNW",
    "NW",
    "NNW",
  ];
  return dirs[Math.round(deg / 22.5) % 16] ?? "—";
}

interface Props {
  readonly entries: Weather[];
  readonly sessionKey?: number | null;
  readonly sessionTimeMs: number;
  readonly sessionStartMs: number;
}

export function WeatherPanel({
  entries,
  sessionKey = null,
  sessionTimeMs,
  sessionStartMs,
}: Props) {
  const showCsvExportButtons = useSettings((s) => s.showCsvExportButtons);
  const metricSystem = useSettings((s) => s.metricSystem);
  const currentT = sessionStartMs + sessionTimeMs;

  const w = useMemo(
    () => weatherAtSessionTime(entries, sessionStartMs, sessionTimeMs),
    [entries, sessionStartMs, sessionTimeMs],
  );

  // Previous reading (for trend arrows)
  const prev = useMemo(
    () =>
      entries.findLast((e) => new Date(e.date).getTime() <= currentT - 60_000),
    [entries, currentT],
  );

  if (!w) {
    return <div className="text-muted text-xs p-3">No weather data</div>;
  }

  const isRaining = w.rainfall > 0;
  const trackDelta = prev ? w.track_temperature - prev.track_temperature : 0;

  function trend(delta: number): string {
    if (delta > 0.2) return "▲";
    if (delta < -0.2) return "▼";
    return "";
  }

  const windArrow =
    windDir(w.wind_direction) === "—" ? "↑" : `↑ ${windDir(w.wind_direction)}`;
  const tempUnit = temperatureUnitLabel(metricSystem);
  const windUnit = windSpeedUnitLabel(metricSystem);
  const trackTemp = toDisplayTemperature(w.track_temperature, metricSystem);
  const airTemp = toDisplayTemperature(w.air_temperature, metricSystem);
  const windSpeed = toDisplayWindSpeed(w.wind_speed, metricSystem);

  const containerClass = isRaining
    ? "bg-gradient-to-br from-blue-tint/80 to-track/95 to-55% border-l-blue"
    : "bg-gradient-to-br from-panel/45 to-track/95 to-55% border-l-line";

  const exportButtonClass =
    "h-6 px-2 text-tiny font-black uppercase tracking-widest rounded-sm transition-colors bg-track text-muted hover:text-fg hover:bg-panel";

  const cardClass = "rounded-sm border border-line bg-track px-2 py-1.5";

  return (
    <div
      className={`px-3 py-2 text-xs transition-colors border-l-2 ${containerClass}`}
    >
      <div className="mb-2 flex items-center gap-2">
        <span className="text-caption font-black uppercase tracking-eyebrow text-fg/85">
          Track Weather
        </span>
        {sessionKey !== null && showCsvExportButtons && (
          <button
            type="button"
            onClick={() => {
              void downloadEndpointCsv(
                "weather",
                { session_key: sessionKey },
                `weather_${sessionKey}.csv`,
              );
            }}
            className={exportButtonClass}
            aria-label="Export weather CSV"
          >
            Export CSV
          </button>
        )}
        {isRaining && (
          <span className="inline-flex items-center gap-1 bg-blue text-black text-tiny font-black uppercase tracking-widest px-1.5 py-0.5 rounded-sm">
            <CloudRain size={10} strokeWidth={2.4} aria-hidden="true" />
            Rain
          </span>
        )}
      </div>

      <div className="grid gap-2 sm:hidden">
        <div className="grid grid-cols-3 gap-2">
          <div className={cardClass}>
            <div className="text-tiny font-bold uppercase tracking-widest text-muted flex items-center gap-1">
              <Thermometer size={10} strokeWidth={2.2} aria-hidden="true" />
              Track
            </div>
            <div className="font-mono tabular-nums text-sm text-fg">
              {trackTemp.toFixed(1)}°{tempUnit}
              <span className="ml-1 text-caption text-yellow-fg">
                {trend(trackDelta)}
              </span>
            </div>
          </div>
          <div className={cardClass}>
            <div className="text-tiny font-bold uppercase tracking-widest text-muted flex items-center gap-1">
              <Thermometer size={10} strokeWidth={2.2} aria-hidden="true" />
              Air
            </div>
            <div className="font-mono tabular-nums text-sm text-fg">
              {airTemp.toFixed(1)}°{tempUnit}
            </div>
          </div>
          <div className={cardClass}>
            <div className="text-tiny font-bold uppercase tracking-widest text-muted flex items-center gap-1">
              <Wind size={10} strokeWidth={2.2} aria-hidden="true" />
              Wind
            </div>
            <div className="font-mono tabular-nums text-sm text-fg">
              {windSpeed.toFixed(1)}
              <span className="ml-1 text-caption text-muted">{windUnit}</span>
            </div>
          </div>
        </div>
        <div className="flex flex-wrap items-center gap-x-3 gap-y-1 text-small text-muted">
          <span className="inline-flex items-center gap-1">
            <Droplets size={10} strokeWidth={2.2} aria-hidden="true" />
            Humidity <span className="font-mono text-fg">{w.humidity}%</span>
          </span>
          <span className="inline-flex items-center gap-1">
            <Gauge size={10} strokeWidth={2.2} aria-hidden="true" />
            Pressure{" "}
            <span className="font-mono text-fg">
              {w.pressure.toFixed(0)} hPa
            </span>
          </span>
          <span>
            Dir <span className="font-mono text-fg">{windArrow}</span>
          </span>
        </div>
      </div>
      <div className="hidden grid-cols-[auto_1fr_auto_1fr] gap-x-4 gap-y-1 sm:grid">
        <span className="text-caption font-bold uppercase tracking-widest text-muted flex items-center gap-1">
          <Thermometer size={12} strokeWidth={2.2} aria-hidden="true" />
          Track
        </span>
        <span className="font-mono tabular-nums text-xs">
          {trackTemp.toFixed(1)}°{tempUnit}
          <span className="text-orange-fg ml-0.5 text-caption font-bold">
            {trend(trackDelta)}
          </span>
        </span>
        <span className="text-caption font-bold uppercase tracking-widest text-muted flex items-center gap-1">
          <Thermometer size={12} strokeWidth={2.2} aria-hidden="true" />
          Air
        </span>
        <span className="font-mono tabular-nums text-xs">
          {airTemp.toFixed(1)}°{tempUnit}
        </span>

        <span className="text-caption font-bold uppercase tracking-widest text-muted flex items-center gap-1">
          <Droplets size={12} strokeWidth={2.2} aria-hidden="true" />
          Humidity
        </span>
        <span className="font-mono tabular-nums text-xs">{w.humidity}%</span>
        <span className="text-caption font-bold uppercase tracking-widest text-muted flex items-center gap-1">
          <Gauge size={12} strokeWidth={2.2} aria-hidden="true" />
          Pressure
        </span>
        <span className="font-mono tabular-nums text-xs">
          {w.pressure.toFixed(0)} hPa
        </span>

        <span className="text-caption font-bold uppercase tracking-widest text-muted flex items-center gap-1">
          <Wind size={12} strokeWidth={2.2} aria-hidden="true" />
          Wind
        </span>
        <span className="font-mono tabular-nums text-xs col-span-3">
          {windSpeed.toFixed(1)} {windUnit} {windArrow}
        </span>
      </div>
    </div>
  );
}
