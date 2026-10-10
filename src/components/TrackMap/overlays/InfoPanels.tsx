import { memo, useMemo } from "react";
import type { ReactNode } from "react";
import {
  Clock3,
  CloudRain,
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

function panelClass(lightMode: boolean, raining: boolean): string {
  const tint = lightMode
    ? raining
      ? "border-l-sky-500 bg-[linear-gradient(135deg,rgba(137,186,255,0.38)_0%,rgba(238,241,250,0.95)_55%)]"
      : "border-l-[#9ca6bc] bg-[linear-gradient(135deg,rgba(187,193,209,0.45)_0%,rgba(238,241,250,0.95)_55%)]"
    : raining
      ? "border-l-sky-400 bg-[linear-gradient(135deg,rgba(18,40,74,0.45)_0%,rgba(21,21,30,0.95)_55%)]"
      : "border-l-[#4b4b57] bg-[linear-gradient(135deg,rgba(34,36,50,0.45)_0%,rgba(21,21,30,0.95)_55%)]";
  return `hidden md:block border border-panel border-l-2 px-2 py-1.5 ${tint}`;
}

const PANEL_STYLE = { minWidth: 184, backdropFilter: "blur(4px)" } as const;

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
    <div className="flex items-center justify-between gap-2">
      <span
        className={`${icon ? "inline-flex items-center gap-1 " : ""}text-[8px] uppercase tracking-[0.12em] text-muted`}
      >
        {icon}
        {label}
      </span>
      <span className="text-[10px] font-mono tabular-nums text-white text-right">
        {children}
      </span>
    </div>
  );
}

/** Track-local and viewer-local wall clock at the playhead. */
export function TrackClockPanel({
  nowMs,
  sessionGmtOffset,
  lightMode,
  raining,
}: {
  /** UTC ms at the playhead. */
  nowMs: number;
  sessionGmtOffset: string | null;
  lightMode: boolean;
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
    <div className={panelClass(lightMode, raining)} style={PANEL_STYLE}>
      <div className="flex items-center gap-1.5 text-[8px] font-black uppercase tracking-[0.14em] text-muted">
        <Clock3 size={10} strokeWidth={2.2} aria-hidden="true" />
        Track Time
      </div>
      <div className="mt-1.5 grid grid-cols-2 gap-x-3 gap-y-1">
        <PanelRow label="Track">
          {formatClockAtOffset(nowMs, trackOffsetMinutes)}
        </PanelRow>
        <PanelRow label="Local">
          {formatTrackClock(nowMs, "local", browserTimeZone)}
        </PanelRow>
        <span className="col-span-2 text-[7px] uppercase tracking-[0.12em] text-muted">
          Track timezone: {formatTrackTimeZoneId(trackOffsetMinutes)}
        </span>
        <span className="col-span-2 text-[7px] uppercase tracking-[0.12em] text-muted">
          Local timezone: {browserTimeZone}
        </span>
      </div>
    </div>
  );
}

export const WeatherPanel = memo(function WeatherPanel({
  weather,
  metricSystem,
  lightMode,
}: {
  weather: Weather;
  metricSystem: UnitSystem;
  lightMode: boolean;
}) {
  const raining = weather.rainfall > 0;
  const tempUnit = temperatureUnitLabel(metricSystem);
  return (
    <div className={panelClass(lightMode, raining)} style={PANEL_STYLE}>
      <div className="flex items-center gap-1.5 text-[8px] font-black uppercase tracking-[0.14em] text-muted">
        <CloudRain size={10} strokeWidth={2.2} aria-hidden="true" />
        Track Weather
        {raining && (
          <span className="ml-auto inline-flex items-center rounded-sm bg-sky-600/85 px-1 py-0.5 text-[7px] font-black tracking-[0.12em] text-white">
            Rain
          </span>
        )}
      </div>
      <div className="mt-1.5 grid grid-cols-2 gap-x-3">
        <div className="space-y-1">
          <PanelRow
            icon={<Thermometer size={9} strokeWidth={2.1} aria-hidden="true" />}
            label="Track"
          >
            {toDisplayTemperature(
              weather.track_temperature,
              metricSystem,
            ).toFixed(1)}{" "}
            {tempUnit}
          </PanelRow>
          <PanelRow
            icon={<Droplets size={9} strokeWidth={2.1} aria-hidden="true" />}
            label="Hum"
          >
            {weather.humidity}%
          </PanelRow>
          <PanelRow
            icon={<Wind size={9} strokeWidth={2.1} aria-hidden="true" />}
            label="Wind"
          >
            {toDisplayWindSpeed(weather.wind_speed, metricSystem).toFixed(1)}{" "}
            {windSpeedUnitLabel(metricSystem)}
          </PanelRow>
        </div>
        <div className="space-y-1">
          <PanelRow
            icon={<Thermometer size={9} strokeWidth={2.1} aria-hidden="true" />}
            label="Air"
          >
            {toDisplayTemperature(
              weather.air_temperature,
              metricSystem,
            ).toFixed(1)}{" "}
            {tempUnit}
          </PanelRow>
          <PanelRow
            icon={<Gauge size={9} strokeWidth={2.1} aria-hidden="true" />}
            label="Press"
          >
            {weather.pressure.toFixed(0)} hPa
          </PanelRow>
          <div className="flex items-center justify-between gap-2">
            <span className="text-[8px] uppercase tracking-[0.12em] text-muted">
              Dir/Rain
            </span>
            <span className="text-[10px] font-mono tabular-nums text-right">
              <span className="text-white">
                {windDir(weather.wind_direction)}
              </span>
              <span className="text-muted"> / </span>
              <span className={raining ? "text-[#7dd3fc]" : "text-muted"}>
                {raining ? "YES" : "NO"}
              </span>
            </span>
          </div>
        </div>
      </div>
    </div>
  );
});
