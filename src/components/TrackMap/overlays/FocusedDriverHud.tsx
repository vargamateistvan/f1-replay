import { memo } from "react";
import type { CarData, Driver } from "@/api/types";
import type { TelemetrySample } from "@/hooks/useCarDataForLap";
import { teamColor } from "@/utils/color";
import { speedUnitLabel, toDisplaySpeed, type UnitSystem } from "@/utils/units";
import { computeSpeedStats } from "../trackGeometry";

/** Focused-driver HUD — speed / gear / throttle + brake bars. */
export function FocusedDriverHud({
  sample,
  driver,
  metricSystem,
}: {
  sample: CarData;
  driver: Driver | undefined;
  metricSystem: UnitSystem;
}) {
  const color = teamColor(driver?.team_colour);
  return (
    <div
      className="pointer-events-none w-32 overflow-hidden rounded-sm border border-panel border-l-2 bg-surface/60 text-fg shadow-sm backdrop-blur-sm"
      style={{ borderLeftColor: color }}
    >
      <div className="flex items-center justify-between gap-1 border-b border-panel px-1.5 py-0.5">
        <span className="text-caption font-black tracking-wider">
          {driver?.name_acronym ?? `#${sample.driver_number}`}
        </span>
        <span className="text-micro font-bold uppercase tracking-caps text-muted">
          Telemetry
        </span>
      </div>
      <div className="flex flex-col gap-1 px-1.5 py-1">
        <div className="flex items-center justify-between gap-1">
          <div className="flex items-baseline gap-1">
            <span className="w-[3ch] text-right font-mono text-lg font-black tabular-nums leading-none">
              {Math.round(toDisplaySpeed(sample.speed, metricSystem))}
            </span>
            <span className="text-micro font-semibold text-muted">
              {speedUnitLabel(metricSystem)}
            </span>
          </div>
          <div className="flex items-center">
            <span
              className={`flex h-5 w-5 items-center justify-center rounded-sm border font-mono text-compact font-black tabular-nums leading-none ${
                sample.n_gear === 0
                  ? "border-orange-line bg-orange-tint text-orange-fg"
                  : "border-line bg-panel text-fg"
              }`}
              title={sample.n_gear === 0 ? "Neutral" : `Gear ${sample.n_gear}`}
            >
              {sample.n_gear === 0 ? "N" : sample.n_gear}
            </span>
          </div>
        </div>
        <div className="flex flex-col gap-0.5">
          <HudBar label="THR" value={sample.throttle} barClass="bg-green" />
          <HudBar label="BRK" value={sample.brake} barClass="bg-red" />
        </div>
      </div>
    </div>
  );
}

function HudBar({
  label,
  value,
  barClass,
}: {
  label: string;
  value: number;
  barClass: string;
}) {
  const pct = Math.max(0, Math.min(100, Math.round(value)));
  return (
    <div className="flex items-center gap-1.5">
      <span className="w-5 shrink-0 text-micro font-bold tracking-wider text-muted">{label}</span>
      <div className="h-1.5 min-w-0 flex-1 overflow-hidden rounded-sm bg-panel">
        <div
          className={`h-full ${barClass} rounded-sm transition-none`}
          style={{ width: `${pct}%` }}
        />
      </div>
      <span className="w-[3ch] text-right font-mono text-tiny tabular-nums text-muted">{pct}</span>
    </div>
  );
}

/** Speed-heat colour scale with the lap's min / avg / max. */
export const LapSpeedLegend = memo(function LapSpeedLegend({
  samples,
  metricSystem,
  overlayBackground,
}: {
  samples: readonly TelemetrySample[];
  metricSystem: UnitSystem;
  overlayBackground: string;
}) {
  const stats = computeSpeedStats(samples);
  if (!stats) return null;
  const display = (kmh: number) =>
    Math.round(toDisplaySpeed(kmh, metricSystem));
  return (
    <div
      className="absolute top-2 left-1/2 z-20 -translate-x-1/2 pointer-events-none border border-panel px-2 py-1"
      style={{
        background: overlayBackground,
        backdropFilter: "blur(4px)",
        minWidth: 186,
      }}
    >
      <div className="flex items-center justify-between text-micro font-black uppercase tracking-caps text-muted">
        <span>Lap Speed</span>
        <span>{speedUnitLabel(metricSystem)}</span>
      </div>
      <div
        className="mt-1 h-1.5"
        style={{
          background:
            "linear-gradient(90deg, hsl(240,100%,55%) 0%, hsl(120,100%,55%) 50%, hsl(0,100%,55%) 100%)",
        }}
      />
      <div className="mt-1 flex items-center justify-between text-tiny font-mono tabular-nums text-fg">
        <span>{display(stats.min)}</span>
        <span className="text-muted">AVG {display(stats.avg)}</span>
        <span>{display(stats.max)}</span>
      </div>
    </div>
  );
});
