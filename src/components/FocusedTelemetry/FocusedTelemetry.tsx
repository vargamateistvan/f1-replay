import { useMemo } from "react";
import type { Driver } from "@/api/types";
import { useCoarseTime } from "@/hooks/useCoarseTime";
import { useCarDataWindow } from "@/hooks/useCarDataWindow";
import { useCarDataForLap } from "@/hooks/useCarDataForLap";
import { chunkIndexFor } from "@/hooks/useLocationChunks";
import { TelemetryChart } from "@/components/TelemetryChart/TelemetryChart";
import { resampleToAxis, computeDelta, smooth } from "@/utils/telemetry";
import { teamColor } from "@/utils/color";
import { lastAtOrBefore } from "@/utils/sortedTime";
import { useSettings } from "@/stores/settings";
import { speedUnitLabel, toDisplaySpeed } from "@/utils/units";

interface Props {
  readonly sessionKey: number | null;
  readonly driver: Driver | null;
  readonly compareDriver?: Driver | null;
  readonly sessionStartMs: number;
  readonly driverLap?: number | null;
  readonly compareDriverLap?: number | null;
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
  onClear,
  onClearCompare,
}: Props) {
  // chunkIndexFor(t) only changes every 5 minutes — 500 ms resolution is more
  // than sufficient and avoids 60-fps re-renders from a direct useTimeline() call.
  const t = useCoarseTime(500);
  const metricSystem = useSettings((s) => s.metricSystem);
  const chunkIdx = chunkIndexFor(t);
  const { data } = useCarDataWindow(
    sessionKey,
    driver?.driver_number ?? null,
    sessionStartMs,
    chunkIdx,
  );
  const { data: compareData } = useCarDataWindow(
    sessionKey,
    compareDriver?.driver_number ?? null,
    sessionStartMs,
    chunkIdx,
  );
  const lapData = useCarDataForLap(
    sessionKey,
    driver?.driver_number ?? null,
    driverLap ?? null,
  );
  const compareLapData = useCarDataForLap(
    sessionKey,
    compareDriver?.driver_number ?? null,
    compareDriverLap ?? null,
  );

  // Samples sorted by session-relative time for a step lookup.
  const samples = useMemo(
    () =>
      data
        .map((d) => ({ ms: new Date(d.date).getTime() - sessionStartMs, d }))
        .sort((a, b) => a.ms - b.ms),
    [data, sessionStartMs],
  );

  // Last sample at or before the playhead (binary search).
  const sample = useMemo(
    () => lastAtOrBefore(samples, t, (entry) => entry.ms)?.d ?? null,
    [samples, t],
  );

  const compareSamples = useMemo(
    () =>
      compareData
        .map((d) => ({ ms: new Date(d.date).getTime() - sessionStartMs, d }))
        .sort((a, b) => a.ms - b.ms),
    [compareData, sessionStartMs],
  );

  const compareSample = useMemo(
    () => lastAtOrBefore(compareSamples, t, (entry) => entry.ms)?.d ?? null,
    [compareSamples, t],
  );

  const color = teamColor(driver?.team_colour, "#ffffff");
  const drsOn = (sample?.drs ?? 0) >= 10;
  const compareColor = teamColor(compareDriver?.team_colour, "#4da6ff");
  const compareDrsOn = (compareSample?.drs ?? 0) >= 10;

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

  return (
    <div className="shrink-0 border-t border-panel bg-track px-3 py-2 text-xs">
      <div className="flex flex-wrap items-center gap-4">
        <DriverStrip
          acronym={driver?.name_acronym ?? "—"}
          color={color}
          sample={sample}
          drsOn={drsOn}
          metricSystem={metricSystem}
        />

        {compareDriver && (
          <>
            <span className="hidden sm:inline text-muted text-[10px] uppercase tracking-widest">
              vs
            </span>
            <DriverStrip
              acronym={compareDriver.name_acronym}
              color={compareColor}
              sample={compareSample}
              drsOn={compareDrsOn}
              metricSystem={metricSystem}
            />
          </>
        )}

        {compareDriver && onClearCompare && (
          <button
            onClick={onClearCompare}
            className="ml-auto shrink-0 text-muted hover:text-white text-[10px] font-black uppercase tracking-widest"
            aria-label="Clear comparison driver"
            title="Clear comparison driver"
          >
            Clear compare
          </button>
        )}

        <button
          onClick={onClear}
          className="shrink-0 text-muted hover:text-white text-sm leading-none"
          aria-label="Clear focus"
          title="Clear focus"
        >
          ✕
        </button>
      </div>

      {sample === null && !compareDriver && (
        <div className="mt-2 text-muted">
          No telemetry at this point — scrub into the session
        </div>
      )}

      {compareTelemetry && (
        <div className="mt-3 grid gap-2 lg:grid-cols-3">
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
            title={`${driver?.name_acronym ?? "A"} ahead (+)`}
            xData={compareTelemetry.xData}
            height={180}
            series={compareTelemetry.delta}
          />
        </div>
      )}
    </div>
  );
}

function DriverStrip({
  acronym,
  color,
  sample,
  drsOn,
  metricSystem,
}: {
  acronym: string;
  color: string;
  sample: {
    speed: number;
    n_gear: number;
    rpm: number;
    throttle: number;
    brake: number;
  } | null;
  drsOn: boolean;
  metricSystem: "metric" | "imperial";
}) {
  const speedValue = sample
    ? Math.round(toDisplaySpeed(sample.speed, metricSystem))
    : null;
  const speedUnit = speedUnitLabel(metricSystem);

  return (
    <span className="flex items-center gap-4 min-w-0">
      <span className="flex items-center gap-2 shrink-0">
        <span className="w-[3px] h-4" style={{ background: color }} />
        <span className="font-black" style={{ color }}>
          {acronym}
        </span>
      </span>

      {sample ? (
        <>
          <Metric
            label="Speed"
            value={`${speedValue}`}
            unit={speedUnit}
            w="w-[3ch]"
          />
          <Metric
            label="Gear"
            value={sample.n_gear === 0 ? "N" : String(sample.n_gear)}
            w="w-[1ch]"
          />
          <Metric label="RPM" value={`${Math.round(sample.rpm)}`} w="w-[5ch]" />
          <Bar label="Thr" value={sample.throttle} color="#39d743" />
          <Bar label="Brk" value={sample.brake} color="#ff5252" />
          <span
            className={`px-1.5 py-0.5 text-[10px] font-black uppercase tracking-widest ${
              drsOn ? "bg-[#39d743] text-black" : "bg-panel text-[#636369]"
            }`}
            title="DRS"
          >
            DRS
          </span>
        </>
      ) : (
        <span className="text-muted">No live sample</span>
      )}
    </span>
  );
}

function Metric({
  label,
  value,
  unit,
  w = "w-auto",
}: {
  label: string;
  value: string;
  unit?: string;
  w?: string;
}) {
  return (
    <span className="flex items-baseline gap-1 shrink-0">
      <span className="text-[10px] font-bold uppercase tracking-widest text-muted">
        {label}
      </span>
      <span
        className={`font-mono font-bold tabular-nums text-white text-right inline-block ${w}`}
      >
        {value}
      </span>
      {unit && <span className="text-[10px] text-muted">{unit}</span>}
    </span>
  );
}

function Bar({
  label,
  value,
  color,
}: {
  label: string;
  value: number;
  color: string;
}) {
  return (
    <span className="flex items-center gap-1.5 shrink-0">
      <span className="text-[10px] font-bold uppercase tracking-widest text-muted">
        {label}
      </span>
      <span className="w-12 h-2 bg-panel overflow-hidden">
        <span
          className="block h-full"
          style={{
            width: `${Math.max(0, Math.min(100, value))}%`,
            background: color,
          }}
        />
      </span>
    </span>
  );
}
