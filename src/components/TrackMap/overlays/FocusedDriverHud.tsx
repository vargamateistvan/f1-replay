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
  lightMode,
}: {
  sample: CarData;
  driver: Driver | undefined;
  metricSystem: UnitSystem;
  lightMode: boolean;
}) {
  const color = teamColor(driver?.team_colour);
  return (
    <div
      className="pointer-events-none flex flex-col gap-1 px-2 py-1.5"
      style={{
        background: lightMode
          ? "rgba(247,249,254,0.94)"
          : "rgba(21,21,30,0.85)",
        backdropFilter: "blur(4px)",
        minWidth: 100,
        border: `1px solid ${color}33`,
      }}
    >
      <div className="flex items-baseline gap-2">
        <span
          className="text-[22px] font-black tabular-nums leading-none"
          style={{ color }}
        >
          {Math.round(toDisplaySpeed(sample.speed, metricSystem))}
        </span>
        <span className="text-[9px] text-muted uppercase tracking-widest leading-none self-end pb-0.5">
          {speedUnitLabel(metricSystem)}
        </span>
        <span
          className="ml-auto text-[18px] font-black tabular-nums leading-none"
          style={{ color: sample.n_gear === 0 ? "#ff5252" : color }}
        >
          {sample.n_gear === 0 ? "N" : sample.n_gear}
        </span>
      </div>
      <HudBar label="THR" value={sample.throttle} barClass="bg-[#39b54a]" />
      <HudBar label="BRK" value={sample.brake} barClass="bg-f1red" />
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
  return (
    <div className="flex items-center gap-1.5">
      <span className="text-[8px] text-muted w-5 shrink-0">{label}</span>
      <div className="flex-1 h-1.5 bg-panel rounded-sm overflow-hidden">
        <div
          className={`h-full ${barClass} rounded-sm transition-none`}
          style={{ width: `${value}%` }}
        />
      </div>
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
      <div className="flex items-center justify-between text-[8px] font-black uppercase tracking-[0.14em] text-muted">
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
      <div className="mt-1 flex items-center justify-between text-[9px] font-mono tabular-nums text-white">
        <span>{display(stats.min)}</span>
        <span className="text-muted">AVG {display(stats.avg)}</span>
        <span>{display(stats.max)}</span>
      </div>
    </div>
  );
});
