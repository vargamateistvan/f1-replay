import { useMemo } from "react";
import { Gauge, X } from "lucide-react";
import type { CarData, Driver } from "@/api/types";
import { useCoarseTime } from "@/hooks/useCoarseTime";
import { useCarDataWindow } from "@/hooks/useCarDataWindow";
import { useCarDataForLap } from "@/hooks/useCarDataForLap";
import { chunkIndexFor } from "@/hooks/useLocationChunks";
import { TelemetryChart } from "@/components/TelemetryChart/TelemetryChart";
import { resampleToAxis, computeDelta, smooth } from "@/utils/telemetry";
import { teamColor, telemetryComparisonColors } from "@/utils/color";
import { lastAtOrBefore } from "@/utils/sortedTime";
import { useSettings } from "@/stores/settings";
import { speedUnitLabel, toDisplaySpeed } from "@/utils/units";
import { TOKEN_HEX } from "@/designTokens";
import { DriverHeadshot } from "@/components/DriverHeadshot";
import {
  FOCUSED_TELEMETRY_TICK_MS,
  TELEMETRY_SHIFT_LIGHTS,
  TELEMETRY_SPEED_BAR_MAX_KMH,
  TELEMETRY_TRACE_WINDOW_MS,
} from "@/constants";
import {
  buildSpeedTrace,
  drsState,
  shiftLightTone,
  shiftLightsLit,
  type DrsState,
  type ShiftLightTone,
  type SpeedTrace,
  type TraceSample,
} from "./hudModel";

interface Props {
  readonly sessionKey: number | null;
  readonly driver: Driver | null;
  readonly compareDriver?: Driver | null;
  readonly sessionStartMs: number;
  readonly driverLap?: number | null;
  readonly compareDriverLap?: number | null;
  /** True when the all-driver car_data window is already being fetched
   * (leaderboard telemetry columns) — reuse it instead of per-driver requests. */
  readonly sharedAllDriverWindow?: boolean;
  readonly telemetryEnabled?: boolean;
  readonly layout?: "panel" | "widget" | "ring";
  readonly expandedRing?: boolean;
  readonly onClear: () => void;
  readonly onClearCompare?: () => void;
}

// Live speed/throttle/brake/gear/DRS for the spotlighted driver at the playhead.
// car_data is fetched in windows around `t` for this one driver only.
export function FocusedTelemetry({
  sessionKey,
  driver,
  compareDriver = null,
  sessionStartMs,
  driverLap = null,
  compareDriverLap = null,
  sharedAllDriverWindow = false,
  telemetryEnabled = true,
  layout = "panel",
  expandedRing = false,
  onClear,
  onClearCompare,
}: Props) {
  // car_data arrives at ~3.7 Hz, so a coarse playhead keeps the HUD smooth
  // without 60-fps re-renders from a direct useTimeline() call.
  const t = useCoarseTime(FOCUSED_TELEMETRY_TICK_MS);
  const metricSystem = useSettings((s) => s.metricSystem);
  const chunkIdx = chunkIndexFor(t);
  const { data } = useCarDataWindow(
    sessionKey,
    driver?.driver_number ?? null,
    sessionStartMs,
    chunkIdx,
    { sharedAllDriverWindow, enabled: telemetryEnabled },
  );
  const { data: compareData } = useCarDataWindow(
    sessionKey,
    compareDriver?.driver_number ?? null,
    sessionStartMs,
    chunkIdx,
    { sharedAllDriverWindow, enabled: telemetryEnabled },
  );
  const lapData = useCarDataForLap(
    sessionKey,
    driver?.driver_number ?? null,
    driverLap ?? null,
    { enabled: telemetryEnabled },
  );
  const compareLapData = useCarDataForLap(
    sessionKey,
    compareDriver?.driver_number ?? null,
    compareDriverLap ?? null,
    { enabled: telemetryEnabled },
  );

  const samples = useMemo(
    () => toTimedSamples(data, sessionStartMs),
    [data, sessionStartMs],
  );
  const sample = useMemo(
    () => lastAtOrBefore(samples, t, (entry) => entry.ms)?.d ?? null,
    [samples, t],
  );

  const compareSamples = useMemo(
    () => toTimedSamples(compareData, sessionStartMs),
    [compareData, sessionStartMs],
  );
  const compareSample = useMemo(
    () => lastAtOrBefore(compareSamples, t, (entry) => entry.ms)?.d ?? null,
    [compareSamples, t],
  );

  const color = teamColor(driver?.team_colour, "#ffffff");
  const compareTeamColor = teamColor(
    compareDriver?.team_colour,
    TOKEN_HEX.blue,
  );
  const compareColor = telemetryComparisonColors([color, compareTeamColor])[1]!;

  const compareTelemetry = useMemo(() => {
    if (!lapData.data?.length || !compareLapData.data?.length || !compareDriver)
      return null;
    const secondary = resampleToAxis(lapData.data, compareLapData.data);
    if (!secondary.length) return null;
    const xData = lapData.data.map((s) => s.distM);
    const toDisplay = (speed: number) => toDisplaySpeed(speed, metricSystem);
    return {
      xData,
      speed: [
        {
          label: driver?.name_acronym ?? "A",
          color,
          data: smooth(lapData.data.map((s) => toDisplay(s.speed))),
        },
        {
          label: compareDriver.name_acronym,
          color: compareColor,
          data: smooth(secondary.map((s) => toDisplay(s.speed))),
        },
      ],
      throttle: [
        {
          label: driver?.name_acronym ?? "A",
          color,
          fill: `${color}26`,
          data: smooth(lapData.data.map((s) => s.throttle)),
        },
        {
          label: compareDriver.name_acronym,
          color: compareColor,
          fill: `${compareColor}26`,
          data: smooth(secondary.map((s) => s.throttle)),
        },
      ],
      delta: [
        {
          label: `${compareDriver.name_acronym} Δ`,
          color: compareColor,
          data: computeDelta(lapData.data, secondary),
        },
      ],
    };
  }, [
    lapData.data,
    compareLapData.data,
    compareDriver,
    driver?.name_acronym,
    color,
    compareColor,
    metricSystem,
  ]);

  const speedUnit = speedUnitLabel(metricSystem);
  const speedChartMax = metricSystem === "imperial" ? 240 : 380;
  const widget = layout !== "panel";
  const ring = layout === "ring";
  const clearControls = (
    <div
      className={
        widget
          ? "flex items-center gap-2"
          : "flex shrink-0 flex-col items-end gap-2 pt-1"
      }
    >
      <button
        onClick={onClear}
        className={`${widget ? "flex h-5 w-5" : "hidden h-6 w-6 sm:flex"} items-center justify-center rounded-sm border border-panel text-muted transition-colors hover:border-line hover:text-fg`}
        aria-label="Clear focus"
        title="Clear focus"
      >
        <X size={12} strokeWidth={2.5} aria-hidden />
      </button>
      {compareDriver && onClearCompare && (
        <button
          onClick={onClearCompare}
          className="text-tiny font-black uppercase tracking-widest text-muted hover:text-fg"
          aria-label="Clear comparison driver"
          title="Clear comparison driver"
        >
          Clear compare
        </button>
      )}
    </div>
  );

  return (
    <div
      className={
        ring
          ? "pointer-events-auto w-72 max-w-full rounded-sm bg-panel text-caption text-fg"
          : widget
          ? "pointer-events-auto w-72 max-w-full overflow-hidden rounded-sm border border-panel border-l-2 bg-surface/70 text-caption text-fg shadow-sm backdrop-blur-sm"
          : "shrink-0 border-t border-panel bg-track px-3 py-2 text-xs"
      }
      style={widget && !ring ? { borderLeftColor: color } : undefined}
    >
      {widget && !ring && (
        <div className="flex items-center justify-between gap-1.5 border-b border-panel px-2 py-0.5">
          <span className="flex items-center gap-1.5 text-caption font-black uppercase tracking-caps text-fg/80">
            <Gauge size={12} aria-hidden />
            Driver telemetry
          </span>
          {clearControls}
        </div>
      )}
      <div className={widget ? "px-2 py-0.5" : "flex items-start gap-3"}>
        <div className="flex min-w-0 flex-1 flex-col gap-1.5">
          <DriverHud
            driver={driver}
            color={color}
            lap={driverLap}
            sample={sample}
            samples={samples}
            t={t}
            metricSystem={metricSystem}
            widget={widget}
            showIdentity={!ring}
            expandedTrace={ring && expandedRing}
            emptyLabel={
              compareDriver
                ? "No live sample"
                : "No telemetry at this point — scrub into the session"
            }
          />
          {compareDriver && (
            <DriverHud
              driver={compareDriver}
              color={compareColor}
              lap={compareDriverLap}
              sample={compareSample}
              samples={compareSamples}
              t={t}
              metricSystem={metricSystem}
              widget={widget}
              showIdentity
              expandedTrace={ring && expandedRing}
              emptyLabel="No live sample"
            />
          )}
        </div>

        {!widget && clearControls}
        {ring && compareDriver && clearControls}
      </div>

      {compareTelemetry && (
        <div
          className={
            widget
              ? "grid gap-2 border-t border-panel p-2"
              : "mt-3 grid gap-2 lg:grid-cols-3"
          }
        >
          <TelemetryChart
            title={`Speed (${speedUnit}) · L${driverLap ?? "—"} vs L${compareDriverLap ?? "—"}`}
            xData={compareTelemetry.xData}
            yMin={0}
            yMax={speedChartMax}
            height={180}
            series={compareTelemetry.speed}
          />
          <TelemetryChart
            title="Throttle"
            xData={compareTelemetry.xData}
            yMin={0}
            yMax={100}
            height={180}
            series={compareTelemetry.throttle}
          />
          <TelemetryChart
            title={`${compareDriver?.name_acronym ?? "B"} ahead (+)`}
            xData={compareTelemetry.xData}
            height={180}
            deltaReferenceColor={color}
            series={compareTelemetry.delta}
          />
        </div>
      )}
    </div>
  );
}

interface TimedSample extends TraceSample {
  readonly d: CarData;
}

function toTimedSamples(
  data: readonly CarData[],
  sessionStartMs: number,
): TimedSample[] {
  return data
    .map((d) => ({
      ms: new Date(d.date).getTime() - sessionStartMs,
      speed: d.speed,
      brake: d.brake,
      d,
    }))
    .sort((a, b) => a.ms - b.ms);
}

const TRACE_W = 112;
const TRACE_H = 32;

const SHIFT_LIGHT_CLASS: Record<ShiftLightTone, string> = {
  green: "bg-green",
  red: "bg-red",
  blue: "bg-blue",
};

const DRS_CLASS: Record<DrsState, string> = {
  open: "bg-green text-green-on shadow-[0_0_8px_rgb(var(--color-green)/0.6)]",
  eligible: "border border-green-line bg-green-tint text-green-fg",
  off: "border border-panel text-faint",
};

const DRS_TITLE: Record<DrsState, string> = {
  open: "DRS open",
  eligible: "DRS eligible",
  off: "DRS closed",
};

function DriverHud({
  driver,
  color,
  lap,
  sample,
  samples,
  t,
  metricSystem,
  emptyLabel,
  widget,
  showIdentity,
  expandedTrace,
}: {
  driver: Driver | null;
  color: string;
  lap: number | null;
  sample: CarData | null;
  samples: readonly TimedSample[];
  t: number;
  metricSystem: "metric" | "imperial";
  emptyLabel: string;
  widget: boolean;
  showIdentity: boolean;
  expandedTrace: boolean;
}) {
  const trace = useMemo(
    () =>
      sample
        ? buildSpeedTrace(
            samples,
            t,
            TELEMETRY_TRACE_WINDOW_MS,
            TRACE_W,
            TRACE_H,
            TELEMETRY_SPEED_BAR_MAX_KMH,
          )
        : null,
    [sample, samples, t],
  );
  const readouts = sample && (
    <div
      className={
        widget
          ? "flex shrink-0 flex-col items-start gap-1"
          : "col-span-3 flex min-w-0 items-center justify-between gap-2 sm:contents"
      }
    >
      <div className="min-w-0 sm:shrink-0">
        <ShiftLights rpm={sample.rpm} widget={widget} />
      </div>
      <Pedals throttle={sample.throttle} brake={sample.brake} widget={widget} />
      <DrsBadge drs={sample.drs} />
    </div>
  );

  return (
    <div
      className={
        widget
          ? "grid min-w-0 grid-cols-[minmax(0,1fr)_auto_auto] items-center gap-x-2 gap-y-1 py-0.5"
          : "grid min-w-0 grid-cols-[minmax(0,1fr)_auto_auto] items-center gap-x-2 gap-y-2 rounded-sm border-l-[3px] py-1.5 pl-2 pr-2 sm:flex sm:flex-wrap sm:gap-x-2"
      }
      style={
        widget
          ? undefined
          : {
              borderLeftColor: color,
              background: `linear-gradient(90deg, ${color}2e, ${color}0a 45%, transparent 80%)`,
            }
      }
    >
      <div
        className={
          widget
            ? "contents"
            : "contents sm:flex sm:shrink-0 sm:items-center sm:gap-2"
        }
      >
        {showIdentity && (
          <DriverIdentity
            driver={driver}
            color={color}
            lap={lap}
            widget={widget}
          />
        )}
        {sample && (
          <>
            <SpeedReadout
              speed={sample.speed}
              metricSystem={metricSystem}
              widget={widget}
            />
            <GearBox gear={sample.n_gear} widget={widget} />
          </>
        )}
      </div>

      {sample ? (
        widget ? (
          <div className="col-span-3 flex min-w-0 items-stretch gap-2">
            {trace && (
              <SpeedTraceSparkline trace={trace} color={color} widget expanded={expandedTrace} />
            )}
            {readouts}
          </div>
        ) : (
          <>
            {trace && (
              <SpeedTraceSparkline trace={trace} color={color} widget={false} />
            )}
            {readouts}
          </>
        )
      ) : (
        <span
          className={`col-span-3 text-muted ${widget ? "text-caption" : "sm:col-auto"}`}
        >
          {emptyLabel}
        </span>
      )}
    </div>
  );
}

function HudLabel({ children, widget }: { children: string; widget: boolean }) {
  return (
    <span
      className={`font-bold uppercase leading-none tracking-widest text-muted ${widget ? "text-tiny" : "text-micro"}`}
    >
      {children}
    </span>
  );
}

function DriverIdentity({
  driver,
  color,
  lap,
  widget,
}: {
  driver: Driver | null;
  color: string;
  lap: number | null;
  widget: boolean;
}) {
  return (
    <span
      className={`flex shrink-0 items-center gap-2 ${widget ? "min-w-0" : "w-[6.5rem] sm:w-auto"}`}
    >
      <DriverHeadshot driver={driver ?? undefined} accent={color} size="sm" />
      <span className="flex min-w-0 flex-col gap-1 leading-none">
        <span
          className={`truncate font-black tracking-wider ${widget ? "text-caption" : "text-sm"}`}
          style={{ color }}
        >
          {driver?.name_acronym ?? "—"}
        </span>
        <span className="font-mono text-tiny tabular-nums text-muted">
          {driver ? `#${driver.driver_number}` : ""}
          {lap != null && ` · L${lap}`}
        </span>
      </span>
    </span>
  );
}

function SpeedReadout({
  speed,
  metricSystem,
  widget,
}: {
  speed: number;
  metricSystem: "metric" | "imperial";
  widget: boolean;
}) {
  return (
    <span className="flex shrink-0 flex-col gap-1">
      <HudLabel widget={widget}>Speed</HudLabel>
      <span className="flex items-baseline gap-1 leading-none">
        <span
          className={`inline-block w-[3ch] text-right font-mono font-black tabular-nums text-fg ${widget ? "text-compact" : "text-stat"}`}
        >
          {Math.round(toDisplaySpeed(speed, metricSystem))}
        </span>
        <span className="text-tiny font-semibold text-muted">
          {speedUnitLabel(metricSystem)}
        </span>
      </span>
    </span>
  );
}

function SpeedTraceSparkline({
  trace,
  color,
  widget,
  expanded = false,
}: {
  trace: SpeedTrace;
  color: string;
  widget: boolean;
  expanded?: boolean;
}) {
  return (
    <svg
      viewBox={`0 0 ${TRACE_W} ${TRACE_H}`}
      preserveAspectRatio="none"
      className={
        widget
          ? `${expanded ? "h-16" : "h-10"} min-w-0 flex-1 self-stretch rounded-sm bg-sunken`
          : "hidden h-8 w-28 min-w-0 overflow-visible rounded-sm bg-sunken sm:block sm:flex-1 sm:max-w-44"
      }
      aria-hidden="true"
      data-testid="focused-speed-trace"
    >
      <title>Speed · last 15 s (red: braking)</title>
      <polygon
        points={`${trace.x0},${TRACE_H} ${trace.points} ${trace.x1},${TRACE_H}`}
        fill={`${color}26`}
      />
      <polyline
        points={trace.points}
        fill="none"
        stroke={color}
        strokeWidth={1.5}
        strokeLinejoin="round"
        vectorEffect="non-scaling-stroke"
      />
      {trace.brakeSpans.map(([a, b]) => (
        <rect
          key={a}
          x={a}
          y={TRACE_H - 3}
          width={Math.max(1.5, b - a)}
          height={3}
          fill={TOKEN_HEX.red}
        />
      ))}
    </svg>
  );
}

function GearBox({ gear, widget }: { gear: number; widget: boolean }) {
  const neutral = gear === 0;
  return (
    <span className="flex shrink-0 flex-col items-center gap-1">
      <HudLabel widget={widget}>Gear</HudLabel>
      <span
        className={`flex ${widget ? "h-5 w-5 text-compact" : "h-7 w-7 text-lg"} items-center justify-center rounded-sm border font-mono font-black leading-none tabular-nums ${
          neutral
            ? "border-orange-line bg-orange-tint text-orange-fg"
            : "border-line bg-panel text-fg"
        }`}
        title={neutral ? "Neutral" : `Gear ${gear}`}
      >
        {neutral ? "N" : gear}
      </span>
    </span>
  );
}

function ShiftLights({ rpm, widget }: { rpm: number; widget: boolean }) {
  const rounded = Math.max(0, Math.round(rpm));
  const lit = shiftLightsLit(rounded);
  const atShift = lit === TELEMETRY_SHIFT_LIGHTS;
  return (
    <span className={`flex shrink-0 flex-col ${widget ? "gap-0.5" : "gap-1"}`}>
      <span className="flex items-baseline justify-between gap-2">
        <HudLabel widget={widget}>RPM</HudLabel>
        <span
          className={`font-mono font-bold leading-none tabular-nums text-fg ${widget ? "text-caption" : "text-compact"}`}
        >
          {rounded}
        </span>
      </span>
      <span
        role="img"
        aria-label={`${rounded} rpm`}
        className="flex items-center gap-[2px]"
      >
        {Array.from({ length: TELEMETRY_SHIFT_LIGHTS }, (_, i) => (
          <span
            key={i}
            className={`h-1.5 w-1.5 rounded-full transition-colors duration-100 motion-reduce:transition-none ${
              i < lit
                ? atShift
                  ? "bg-blue animate-pulse motion-reduce:animate-none"
                  : SHIFT_LIGHT_CLASS[shiftLightTone(i)]
                : "bg-panel"
            }`}
          />
        ))}
      </span>
    </span>
  );
}

function Pedals({
  throttle,
  brake,
  widget,
}: {
  throttle: number;
  brake: number;
  widget: boolean;
}) {
  return (
    <span className={`flex shrink-0 flex-col ${widget ? "gap-0.5" : "gap-1"}`}>
      <PedalBar
        label="Thr"
        value={throttle}
        barClass="bg-green"
        widget={widget}
      />
      <PedalBar label="Brk" value={brake} barClass="bg-red" widget={widget} />
    </span>
  );
}

function PedalBar({
  label,
  value,
  barClass,
  widget,
}: {
  label: string;
  value: number;
  barClass: string;
  widget: boolean;
}) {
  const pct = Math.max(0, Math.min(100, Math.round(value)));
  return (
    <span className="flex items-center gap-1.5">
      <span
        className={`w-6 font-bold uppercase leading-none tracking-widest text-muted ${widget ? "text-tiny" : "text-micro"}`}
      >
        {label}
      </span>
      <span className="h-1.5 w-16 overflow-hidden rounded-sm bg-panel sm:w-20">
        <span
          className={`block h-full transition-[width] duration-200 ease-out motion-reduce:transition-none ${barClass}`}
          style={{ width: `${pct}%` }}
        />
      </span>
      <span
        className={`w-[3ch] text-right font-mono leading-none tabular-nums text-fg/80 ${widget ? "text-caption" : "text-tiny"}`}
      >
        {pct}
      </span>
    </span>
  );
}

function DrsBadge({ drs }: { drs: number | null }) {
  const state = drsState(drs);
  // Sessions without DRS data (e.g. 2026 active-aero cars) hide the badge.
  if (state === null) return null;
  return (
    <span
      className={`shrink-0 rounded-sm px-1.5 py-1 text-caption font-black uppercase leading-none tracking-widest transition-colors duration-150 motion-reduce:transition-none ${DRS_CLASS[state]}`}
      title={`${DRS_TITLE[state]} (raw value ${drs})`}
    >
      DRS
    </span>
  );
}
