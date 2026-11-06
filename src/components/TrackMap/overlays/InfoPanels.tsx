import { memo, useMemo } from "react";
import type { ReactNode } from "react";
import {
  Clock3,
  CloudRain,
  Sun,
  Droplets,
  Gauge,
  Thermometer,
  Wind,
} from "lucide-react";
import type { Weather } from "@/api/types";
import {
  temperatureUnitLabel,
  toDisplayTemperature,
  toDisplayWindSpeed,
  windSpeedUnitLabel,
  type UnitSystem,
} from "@/utils/units";
import {
  formatClockAtOffset,
  formatTrackClock,
  formatTrackTimeZoneId,
  parseGmtOffsetToMinutes,
  windDir,
} from "../trackMapFormat";

function panelClass(raining: boolean): string {
  const tint = raining
    ? "border-l-blue"
    : "border-l-line";
  return `hidden md:block w-56 overflow-hidden rounded-sm border border-panel border-l-2 bg-surface/60 text-fg shadow-sm backdrop-blur-sm ${tint}`;
}

const HEADER_CLASS = "flex items-center gap-1.5 border-b border-panel px-2 py-1 text-micro font-black uppercase tracking-caps text-muted";

function PanelRow({
  icon,
  label,
  children,
}: {
  icon?: ReactNode;
  label: string;
  children: ReactNode;
}) {
  return (
    <div className="flex min-w-0 items-center justify-between gap-1">
      <span
        className={`${icon ? "inline-flex items-center gap-1 " : ""}text-micro uppercase tracking-wider text-muted`}
      >
        {icon}
        {label}
      </span>
      <span className="whitespace-nowrap text-tiny font-mono tabular-nums text-fg text-right">
        {children}
      </span>
    </div>
  );
}

/** Track-local and viewer-local wall clock at the playhead. */
export function TrackClockPanel({
  nowMs,
  sessionGmtOffset,
  raining,
}: {
  /** UTC ms at the playhead. */
  nowMs: number;
  sessionGmtOffset: string | null;
  raining: boolean;
}) {
  const trackOffsetMinutes = useMemo(
    () => parseGmtOffsetToMinutes(sessionGmtOffset),
    [sessionGmtOffset],
  );
  const browserTimeZone = useMemo(
    () => Intl.DateTimeFormat().resolvedOptions().timeZone || "UTC",
    [],
  );
  return (
    <div className={panelClass(raining)} aria-label="Track time">
      <div className={HEADER_CLASS}>
        <Clock3 size={10} strokeWidth={2.2} aria-hidden="true" />
        Track Time
      </div>
      <div className="grid grid-cols-2 divide-x divide-panel">
        <div className="min-w-0 px-2 py-1">
          <div className="text-micro font-bold uppercase tracking-caps text-muted">Track</div>
          <div className="font-mono text-compact font-semibold tabular-nums leading-snug">
            {formatClockAtOffset(nowMs, trackOffsetMinutes)}
          </div>
          <div className="truncate font-mono text-micro text-muted" title={`Track timezone: ${formatTrackTimeZoneId(trackOffsetMinutes)}`}>
            {formatTrackTimeZoneId(trackOffsetMinutes)}
          </div>
        </div>
        <div className="min-w-0 px-2 py-1">
          <div className="text-micro font-bold uppercase tracking-caps text-muted">Local</div>
          <div className="font-mono text-compact font-semibold tabular-nums leading-snug">
            {formatTrackClock(nowMs, "local", browserTimeZone)}
          </div>
          <div className="truncate font-mono text-micro text-muted" title={`Local timezone: ${browserTimeZone}`}>
            {browserTimeZone}
          </div>
        </div>
      </div>
    </div>
  );
}

export const WeatherPanel = memo(function WeatherPanel({
  weather,
  metricSystem,
}: {
  weather: Weather;
  metricSystem: UnitSystem;
}) {
  const raining = weather.rainfall > 0;
  const tempUnit = temperatureUnitLabel(metricSystem);
  return (
    <div className={panelClass(raining)} aria-label="Track weather">
      <div className={HEADER_CLASS}>
        {raining
          ? <CloudRain size={10} strokeWidth={2.2} aria-hidden="true" />
          : <Sun size={10} strokeWidth={2.2} aria-hidden="true" />}
        Track Weather
        <span className={`ml-auto rounded-sm border px-1 text-micro font-bold ${
          raining ? "border-blue-line bg-blue-tint text-blue-fg" : "border-panel bg-sunken text-muted"
        }`}>
          {raining ? "Rain" : "Dry"}
        </span>
      </div>
      <div className="grid grid-cols-2 divide-x divide-panel">
        {([
          ["Track", weather.track_temperature],
          ["Air", weather.air_temperature],
        ] as const).map(([label, temperature]) => (
          <div key={label} className="px-2 py-1">
            <div className="flex items-center gap-1 text-micro font-bold uppercase tracking-caps text-muted">
              <Thermometer size={9} strokeWidth={2.1} aria-hidden="true" />
              {label}
            </div>
            <div className="font-mono text-compact font-semibold tabular-nums leading-snug">
              {toDisplayTemperature(temperature, metricSystem).toFixed(1)}
              <span className="ml-1 text-tiny font-normal text-muted">°{tempUnit}</span>
            </div>
          </div>
        ))}
      </div>
      <div className="grid grid-cols-2 gap-x-3 gap-y-0.5 border-t border-panel bg-sunken/20 px-2 py-1">
        <PanelRow
          icon={<Droplets size={9} strokeWidth={2.1} aria-hidden="true" />}
          label="Hum"
        >
          {weather.humidity}%
        </PanelRow>
        <PanelRow
          icon={<Gauge size={9} strokeWidth={2.1} aria-hidden="true" />}
          label="Press"
        >
          {weather.pressure.toFixed(0)} hPa
        </PanelRow>
        <div className="col-span-2">
          <PanelRow
            icon={<Wind size={9} strokeWidth={2.1} aria-hidden="true" />}
            label="Wind"
          >
            {toDisplayWindSpeed(weather.wind_speed, metricSystem).toFixed(1)}{" "}
            <span className="text-muted">{windSpeedUnitLabel(metricSystem)}</span>
            {" "}<span className="ml-2">{windDir(weather.wind_direction)}</span>
          </PanelRow>
        </div>
      </div>
    </div>
  );
});
