import { useMemo } from "react";
import type { Weather } from "@/api/types";

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
  readonly sessionTimeMs: number;
  readonly sessionStartMs: number;
}

export function WeatherPanel({
  entries,
  sessionTimeMs,
  sessionStartMs,
}: Props) {
  const currentT = sessionStartMs + sessionTimeMs;

  const w = useMemo(
    () => entries.findLast((e) => new Date(e.date).getTime() <= currentT),
    [entries, currentT],
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

  return (
    <div
      className={`px-3 py-2 text-xs transition-colors ${isRaining ? "bg-blue-950/30" : ""}`}
    >
      {isRaining && (
        <span className="inline-block mb-1.5 bg-blue-600 text-white text-[10px] font-black uppercase tracking-widest px-2 py-0.5">
          Rain
        </span>
      )}
      <div className="grid gap-2 sm:hidden">
        <div className="grid grid-cols-3 gap-2">
          <div className="rounded-sm border border-panel bg-track px-2 py-1.5">
            <div className="text-[9px] font-bold uppercase tracking-widest text-muted">
              Track
            </div>
            <div className="font-mono tabular-nums text-sm text-white">
              {w.track_temperature.toFixed(1)}°C
              <span className="ml-1 text-[10px] text-[#ffd600]">
                {trend(trackDelta)}
              </span>
            </div>
          </div>
          <div className="rounded-sm border border-panel bg-track px-2 py-1.5">
            <div className="text-[9px] font-bold uppercase tracking-widest text-muted">
              Air
            </div>
            <div className="font-mono tabular-nums text-sm text-white">
              {w.air_temperature.toFixed(1)}°C
            </div>
          </div>
          <div className="rounded-sm border border-panel bg-track px-2 py-1.5">
            <div className="text-[9px] font-bold uppercase tracking-widest text-muted">
              Wind
            </div>
            <div className="font-mono tabular-nums text-sm text-white">
              {w.wind_speed.toFixed(1)}
            </div>
          </div>
        </div>
        <div className="flex flex-wrap items-center gap-x-3 gap-y-1 text-[11px] text-muted">
          <span>
            Humidity <span className="font-mono text-white">{w.humidity}%</span>
          </span>
          <span>
            Pressure{" "}
            <span className="font-mono text-white">
              {w.pressure.toFixed(0)} hPa
            </span>
          </span>
          <span>
            Dir{" "}
            <span className="font-mono text-white">
              {windDir(w.wind_direction)}
            </span>
          </span>
        </div>
      </div>
      <div className="hidden grid-cols-[auto_1fr_auto_1fr] gap-x-4 gap-y-1 sm:grid">
        <span className="text-[10px] font-bold uppercase tracking-widest text-muted">
          Track
        </span>
        <span className="font-mono tabular-nums text-xs">
          {w.track_temperature.toFixed(1)}°C
          <span className="text-[#ffd600] ml-0.5 text-[10px]">
            {trend(trackDelta)}
          </span>
        </span>
        <span className="text-[10px] font-bold uppercase tracking-widest text-muted">
          Air
        </span>
        <span className="font-mono tabular-nums text-xs">
          {w.air_temperature.toFixed(1)}°C
        </span>

        <span className="text-[10px] font-bold uppercase tracking-widest text-muted">
          Humidity
        </span>
        <span className="font-mono tabular-nums text-xs">{w.humidity}%</span>
        <span className="text-[10px] font-bold uppercase tracking-widest text-muted">
          Pressure
        </span>
        <span className="font-mono tabular-nums text-xs">
          {w.pressure.toFixed(0)} hPa
        </span>

        <span className="text-[10px] font-bold uppercase tracking-widest text-muted">
          Wind
        </span>
        <span className="font-mono tabular-nums text-xs col-span-3">
          {w.wind_speed.toFixed(1)} m/s {windDir(w.wind_direction)}
        </span>
      </div>
    </div>
  );
}
