import { useMemo, useState } from "react";
import {
  LineChart,
  Line,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  ResponsiveContainer,
  ReferenceLine,
  ReferenceArea,
} from "recharts";
import type { Driver, Interval } from "@/api/types";
import { teamColor } from "@/utils/color";
import { TOKEN_HEX } from "@/designTokens";
import {
  GAP_CHART_AXIS_STEPS_SEC,
  GAP_CHART_MAX_TICKS,
  GAP_CHART_MAX_SEC,
  GAP_CHART_TOP_N,
  RACE_CHART_MARGIN,
  RACE_CHART_NOW_Z,
  RACE_CHART_VEIL_Z,
  RACE_CHART_X_AXIS_HEIGHT,
} from "@/constants";
import { FOCUS_RING } from "@/components/Button/buttonClass";
import { ChartTooltipCard } from "@/components/RaceChart/ChartTooltipCard";
import { DriverEndLabels, type EndLabel } from "@/components/RaceChart/DriverEndLabels";
import { LapRangeToggle } from "@/components/RaceChart/LapRangeToggle";

interface Props {
  readonly drivers: Driver[];
  readonly intervals: Interval[];
  readonly sessionTimeMs: number;
  readonly sessionStartMs: number;
  readonly lapStarts?: number[];
  readonly currentLap?: number;
  readonly retiredDrivers?: ReadonlySet<number>;
  /** Highlighted line (the app's focused driver). */
  readonly focusDriver?: number | null;
  /** End-label click. */
  readonly onSelectDriver?: (driverNumber: number) => void;
}

// Gap-to-leader over session time. Each line is one driver; Y=0 is the leader,
// increasing values mean further behind. Derived from the intervals series already
// loaded for Live Timing — no extra fetch needed.
export function GapChart({
  drivers,
  intervals,
  sessionTimeMs,
  sessionStartMs,
  lapStarts = [],
  currentLap = 0,
  retiredDrivers,
  focusDriver = null,
  onSelectDriver,
}: Props) {
  const activeDrivers = useMemo(
    () =>
      drivers.filter(
        (driver) => !retiredDrivers?.has(driver.driver_number),
      ),
    [drivers, retiredDrivers],
  );
  const [showAllLaps, setShowAllLaps] = useState(false);
  const [topOnly, setTopOnly] = useState(false);
  const [hovered, setHovered] = useState<number | null>(null);

  // Per-driver sorted arrays of {ms, gap}. Strings like "1 LAP" are excluded;
  // gaps are capped at GAP_CHART_MAX_SEC so lapped cars don't distort the Y axis.
  const byDriver = useMemo(() => {
    const m = new Map<number, Array<{ ms: number; gap: number }>>();
    for (const iv of intervals) {
      if (retiredDrivers?.has(iv.driver_number)) continue;
      if (typeof iv.gap_to_leader !== "number") continue;
      const ms = new Date(iv.date).getTime() - sessionStartMs;
      if (ms < 0) continue;
      let arr = m.get(iv.driver_number);
      if (!arr) {
        arr = [];
        m.set(iv.driver_number, arr);
      }
      arr.push({ ms, gap: Math.min(iv.gap_to_leader, GAP_CHART_MAX_SEC) });
    }
    for (const arr of m.values()) arr.sort((a, b) => a.ms - b.ms);
    return m;
  }, [intervals, retiredDrivers, sessionStartMs]);

  // Shared time axis: bucket all interval timestamps to the nearest 5 s so
  // different drivers' rows align on the same x values.
  const timeBuckets = useMemo(() => {
    const seen = new Set<number>();
    for (const iv of intervals) {
      if (retiredDrivers?.has(iv.driver_number)) continue;
      const ms =
        Math.round((new Date(iv.date).getTime() - sessionStartMs) / 5_000) *
        5_000;
      if (ms >= 0) seen.add(ms);
    }
    return Array.from(seen).sort((a, b) => a - b);
  }, [intervals, retiredDrivers, sessionStartMs]);

  // Build one chart row per time bucket up to the current playhead (fallback mode).
  const timeRows = useMemo(() => {
    if (timeBuckets.length === 0 || byDriver.size === 0) return [];
    return timeBuckets
      .filter((ms) => ms <= sessionTimeMs)
      .map((ms) => {
        const row: Record<string, number> = { ms };
        for (const [num, arr] of byDriver) {
          const gap = stepGap(arr, ms);
          if (gap !== null) row[String(num)] = gap;
        }
        return row;
      });
  }, [timeBuckets, sessionTimeMs, byDriver]);

  // Preferred mode: one row per lap boundary, so the chart tracks replay lap progression.
  const lapRows = useMemo(() => {
    if (lapStarts.length === 0 || byDriver.size === 0) return [];
    const visibleLapCount = showAllLaps
      ? lapStarts.length
      : Math.max(0, Math.min(currentLap, lapStarts.length));
    if (visibleLapCount === 0) return [];

    const rows: Array<Record<string, number>> = [];
    for (let i = 0; i < visibleLapCount; i++) {
      const lap = i + 1;
      const boundaryMs = lapStarts[i]!;
      const row: Record<string, number> = { lap };
      for (const [num, arr] of byDriver) {
        const gap = stepGap(arr, boundaryMs);
        if (gap !== null) row[String(num)] = gap;
      }
      rows.push(row);
    }
    return rows;
  }, [lapStarts, currentLap, byDriver, showAllLaps]);

  const useLapAxis = lapRows.length > 0;
  const rows = useLapAxis ? lapRows : timeRows;

  const driverByNumber = useMemo(
    () => new Map(drivers.map((d) => [d.driver_number, d])),
    [drivers],
  );

  // Order at the last plotted point; "Top N" keeps the front of it.
  const endLabels = useMemo((): EndLabel[] => {
    const last = rows.at(-1);
    if (!last) return [];
    const labels = activeDrivers
      .filter((d) => typeof last[String(d.driver_number)] === "number")
      .map((d) => ({ driverNumber: d.driver_number, value: last[String(d.driver_number)]! }))
      .sort((a, b) => a.value - b.value);
    return topOnly ? labels.slice(0, GAP_CHART_TOP_N) : labels;
  }, [rows, activeDrivers, topOnly]);

  const shownDrivers = useMemo(() => {
    if (!topOnly) return activeDrivers;
    const keep = new Set(endLabels.map((l) => l.driverNumber));
    return activeDrivers.filter((d) => keep.has(d.driver_number));
  }, [activeDrivers, endLabels, topOnly]);

  // Y axis fits the plotted gaps: the smallest step giving at most
  // GAP_CHART_MAX_TICKS intervals, rounded up to it, capped.
  const yAxis = useMemo(() => {
    let max = 0;
    for (const row of rows)
      for (const d of shownDrivers) {
        const v = row[String(d.driver_number)];
        if (v !== undefined && v > max) max = v;
      }
    max = Math.min(Math.max(max, 1), GAP_CHART_MAX_SEC);
    const step =
      GAP_CHART_AXIS_STEPS_SEC.find((s) => max / s <= GAP_CHART_MAX_TICKS) ??
      GAP_CHART_AXIS_STEPS_SEC[GAP_CHART_AXIS_STEPS_SEC.length - 1];
    const top = Math.min(GAP_CHART_MAX_SEC, Math.ceil(max / step) * step);
    const ticks: number[] = [];
    for (let v = 0; v <= top; v += step) ticks.push(v);
    return { max: top, ticks };
  }, [rows, shownDrivers]);
  const yMax = yAxis.max;

  if (rows.length === 0) {
    return (
      <div className="flex min-h-[160px] flex-1 items-center justify-center px-4 text-center text-muted text-sm">
        No gap data available yet
      </div>
    );
  }

  const highlight = hovered ?? focusDriver;
  const lineOrder = [...shownDrivers].sort(
    (a, b) => Number(a.driver_number === highlight) - Number(b.driver_number === highlight),
  );

  return (
    <div className="flex min-h-0 flex-1 flex-col">
      <div className="flex shrink-0 items-center gap-2 border-b border-panel bg-track px-2 py-1.5 sm:px-3">
        <span className="min-w-0 flex-1 truncate text-caption text-muted">
          Gap to leader
          <span className="hidden sm:inline"> · pick a name to focus</span>
        </span>
        <button
          type="button"
          onClick={() => setTopOnly((v) => !v)}
          aria-pressed={topOnly}
          className={`h-5 shrink-0 border px-2 text-tiny font-black uppercase tracking-widest transition-colors ${FOCUS_RING} ${
            topOnly
              ? "border-f1red bg-f1red text-white"
              : "border-panel bg-track text-muted hover:text-fg"
          }`}
          title={topOnly ? `Showing the top ${GAP_CHART_TOP_N}` : "Showing every car"}
        >
          Top {GAP_CHART_TOP_N}
        </button>
        {lapStarts.length > 0 && (
          <LapRangeToggle showAll={showAllLaps} onToggle={() => setShowAllLaps((v) => !v)} />
        )}
      </div>

      <div className="relative min-h-[240px] flex-1 bg-sunken">
        <div className="absolute inset-0">
          <ResponsiveContainer width="100%" height="100%">
            <LineChart data={rows} margin={RACE_CHART_MARGIN}>
              <CartesianGrid stroke="rgb(var(--color-panel))" vertical={false} />
              <XAxis
                dataKey={useLapAxis ? "lap" : "ms"}
                type="number"
                domain={["dataMin", "dataMax"]}
                height={RACE_CHART_X_AXIS_HEIGHT}
                tickFormatter={useLapAxis ? undefined : msToMin}
                allowDecimals={false}
                tick={{ fill: TOKEN_HEX.faint, fontSize: 10 }}
                axisLine={{ stroke: "rgb(var(--color-panel))" }}
                tickLine={false}
              />
              <YAxis
                reversed
                domain={[0, yMax]}
                ticks={yAxis.ticks}
                allowDataOverflow
                width={34}
                tick={{ fill: TOKEN_HEX.faint, fontSize: 10 }}
                axisLine={false}
                tickLine={false}
                tickFormatter={(v: number) => (v === 0 ? "LEAD" : `+${v}s`)}
              />
              <Tooltip
                cursor={{ stroke: "rgb(var(--color-line))" }}
                content={
                  <GapTooltip
                    axisMode={useLapAxis ? "lap" : "time"}
                    driverByNumber={driverByNumber}
                    highlight={highlight}
                  />
                }
              />
              {lineOrder.map((d) => {
                const isHighlight = d.driver_number === highlight;
                return (
                  <Line
                    key={d.driver_number}
                    type="monotone"
                    dataKey={String(d.driver_number)}
                    name={d.name_acronym}
                    stroke={teamColor(d.team_colour)}
                    strokeWidth={isHighlight ? 3 : 1.5}
                    strokeOpacity={highlight === null || isHighlight ? 1 : 0.25}
                    dot={false}
                    activeDot={isHighlight ? { r: 3 } : false}
                    isAnimationActive={false}
                    connectNulls
                  />
                );
              })}
              {/* Laps still to come (All mode) are veiled. */}
              {useLapAxis && showAllLaps && currentLap > 0 && currentLap < lapStarts.length && (
                <ReferenceArea
                  x1={currentLap}
                  x2={lapStarts.length}
                  fill="rgb(var(--color-sunken))"
                  fillOpacity={0.7}
                  strokeOpacity={0}
                  ifOverflow="hidden"
                  zIndex={RACE_CHART_VEIL_Z}
                />
              )}
              <ReferenceLine
                x={useLapAxis ? currentLap : sessionTimeMs}
                stroke={TOKEN_HEX.f1red}
                strokeWidth={2}
                zIndex={RACE_CHART_NOW_Z}
              />
            </LineChart>
          </ResponsiveContainer>
        </div>
        <DriverEndLabels
          className="absolute inset-y-0 right-0"
          labels={endLabels}
          drivers={drivers}
          domain={[0, yMax]}
          plotTop={RACE_CHART_MARGIN.top}
          plotBottom={RACE_CHART_MARGIN.bottom + RACE_CHART_X_AXIS_HEIGHT}
          highlight={highlight}
          onHover={setHovered}
          onSelect={onSelectDriver}
          widthPx={RACE_CHART_MARGIN.right}
        />
      </div>
    </div>
  );
}

// Binary search: last gap at or before boundaryMs. Same pattern as LapChart.stepPos.
function stepGap(
  arr: Array<{ ms: number; gap: number }>,
  boundaryMs: number,
): number | null {
  let lo = 0,
    hi = arr.length;
  while (lo < hi) {
    const mid = (lo + hi) >>> 1;
    if (arr[mid]!.ms <= boundaryMs) lo = mid + 1;
    else hi = mid;
  }
  return arr[lo - 1]?.gap ?? null;
}

function msToMin(ms: number): string {
  const m = Math.floor(ms / 60_000);
  const s = Math.floor((ms % 60_000) / 1_000);
  return s === 0 ? `${m}'` : `${m}'${s.toString().padStart(2, "0")}`;
}

interface GapTooltipProps {
  active?: boolean;
  label?: number;
  payload?: Array<{ dataKey?: string | number; value?: number }>;
  axisMode?: "time" | "lap";
  driverByNumber: ReadonlyMap<number, Driver>;
  highlight: number | null;
}

function GapTooltip({
  active,
  label,
  payload,
  axisMode = "time",
  driverByNumber,
  highlight,
}: GapTooltipProps) {
  if (!active || !payload?.length || label == null) return null;
  const rows = payload
    .filter((p): p is { dataKey: string | number; value: number } => typeof p.value === "number")
    .sort((a, b) => a.value - b.value)
    .map((p) => {
      const num = Number(p.dataKey);
      const driver = driverByNumber.get(num);
      return {
        key: String(num),
        label: driver?.name_acronym ?? String(num),
        color: teamColor(driver?.team_colour),
        value: p.value === 0 ? "Leader" : `+${p.value.toFixed(3)}`,
        emphasis: num === highlight,
      };
    });
  return (
    <ChartTooltipCard
      title={axisMode === "lap" ? `Lap ${label}` : msToMin(label)}
      rows={rows}
    />
  );
}
