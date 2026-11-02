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
import type { Driver, Position } from "@/api/types";
import { teamColor } from "@/utils/color";
import { TOKEN_HEX } from "@/designTokens";
import {
  RACE_CHART_MARGIN,
  RACE_CHART_NOW_Z,
  RACE_CHART_VEIL_Z,
  RACE_CHART_X_AXIS_HEIGHT,
} from "@/constants";
import { ChartTooltipCard } from "@/components/RaceChart/ChartTooltipCard";
import { DriverEndLabels, type EndLabel } from "@/components/RaceChart/DriverEndLabels";
import { LapRangeToggle } from "@/components/RaceChart/LapRangeToggle";

interface Props {
  readonly drivers: Driver[];
  readonly positions: Position[];
  readonly lapStarts: number[]; // session-relative ms, sorted (one per lap)
  readonly sessionStartMs: number;
  readonly sessionTimeMs: number;
  readonly currentLap?: number;
  /** Highlighted line (the app's focused driver). */
  readonly focusDriver?: number | null;
  /** End-label click. */
  readonly onSelectDriver?: (driverNumber: number) => void;
}

// Classic position-by-lap "spaghetti" chart. Position at each lap boundary is the
// last known position for that driver at/before the boundary time — derived from
// the position series already loaded for Live Timing (no extra fetch).
export function LapChart({
  drivers,
  positions,
  lapStarts,
  sessionStartMs,
  sessionTimeMs,
  currentLap,
  focusDriver = null,
  onSelectDriver,
}: Props) {
  const [showAllLaps, setShowAllLaps] = useState(false);
  const [hovered, setHovered] = useState<number | null>(null);

  // Per-driver position entries in session-relative ms (matching lapStarts), sorted.
  const byDriver = useMemo(() => {
    const m = new Map<number, Array<{ ms: number; pos: number }>>();
    for (const p of positions) {
      let arr = m.get(p.driver_number);
      if (!arr) {
        arr = [];
        m.set(p.driver_number, arr);
      }
      arr.push({
        ms: new Date(p.date).getTime() - sessionStartMs,
        pos: p.position,
      });
    }
    for (const arr of m.values()) arr.sort((a, b) => a.ms - b.ms);
    return m;
  }, [positions, sessionStartMs]);

  const derivedCurrentLap = useMemo(() => {
    let lap = 0;
    for (let i = 0; i < lapStarts.length; i++)
      if (lapStarts[i]! <= sessionTimeMs) lap = i + 1;
    return lap;
  }, [lapStarts, sessionTimeMs]);

  const playbackLap = currentLap ?? derivedCurrentLap;

  const visibleLapCount = useMemo(() => {
    if (showAllLaps) return lapStarts.length;
    return Math.max(0, Math.min(playbackLap, lapStarts.length));
  }, [showAllLaps, playbackLap, lapStarts.length]);

  const rows = useMemo(() => {
    if (lapStarts.length === 0 || byDriver.size === 0) return [];
    if (visibleLapCount === 0) return [];
    return lapStarts.slice(0, visibleLapCount).map((lapMs, i) => {
      const row: Record<string, number> = { lap: i + 1 };
      for (const [num, arr] of byDriver) {
        const pos = stepPos(arr, lapMs);
        if (pos !== null) row[String(num)] = pos;
      }
      return row;
    });
  }, [lapStarts, byDriver, visibleLapCount]);

  const driverByNumber = useMemo(
    () => new Map(drivers.map((d) => [d.driver_number, d])),
    [drivers],
  );

  // Order at the last plotted lap → end labels.
  const endLabels = useMemo((): EndLabel[] => {
    const last = rows.at(-1);
    if (!last) return [];
    return drivers
      .filter((d) => typeof last[String(d.driver_number)] === "number")
      .map((d) => ({ driverNumber: d.driver_number, value: last[String(d.driver_number)]! }));
  }, [rows, drivers]);

  if (rows.length === 0) {
    return (
      <div className="flex min-h-[160px] flex-1 items-center justify-center px-4 text-center text-muted text-sm">
        No position data for a lap chart yet
      </div>
    );
  }

  const driverCount = Math.max(drivers.length, 2);
  const highlight = hovered ?? focusDriver;
  // Highlighted line last so it draws on top.
  const lineOrder = [...drivers].sort(
    (a, b) => Number(a.driver_number === highlight) - Number(b.driver_number === highlight),
  );
  const positionTicks = Array.from({ length: driverCount }, (_, i) => i + 1);

  return (
    <div className="flex min-h-0 flex-1 flex-col">
      <div className="flex shrink-0 items-center gap-2 border-b border-panel bg-track px-2 py-1.5 sm:px-3">
        <span className="min-w-0 flex-1 truncate text-caption text-muted">
          Position at the start of each lap
          <span className="hidden sm:inline"> · pick a name to focus</span>
        </span>
        <LapRangeToggle showAll={showAllLaps} onToggle={() => setShowAllLaps((v) => !v)} />
      </div>

      <div className="relative min-h-[240px] flex-1 bg-sunken">
        <div className="absolute inset-0">
          <ResponsiveContainer width="100%" height="100%">
            <LineChart data={rows} margin={RACE_CHART_MARGIN}>
              <CartesianGrid stroke="rgb(var(--color-panel))" vertical={false} />
              <XAxis
                dataKey="lap"
                height={RACE_CHART_X_AXIS_HEIGHT}
                tick={{ fill: TOKEN_HEX.faint, fontSize: 10 }}
                axisLine={{ stroke: "rgb(var(--color-panel))" }}
                tickLine={false}
                minTickGap={8}
              />
              <YAxis
                reversed
                domain={[1, driverCount]}
                ticks={positionTicks}
                interval="preserveStartEnd"
                allowDecimals={false}
                width={26}
                tick={{ fill: TOKEN_HEX.faint, fontSize: 10 }}
                axisLine={false}
                tickLine={false}
              />
              <Tooltip
                cursor={{ stroke: "rgb(var(--color-line))" }}
                content={<LapTooltip driverByNumber={driverByNumber} highlight={highlight} />}
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
              {showAllLaps && playbackLap > 0 && playbackLap < lapStarts.length && (
                <ReferenceArea
                  x1={playbackLap}
                  x2={lapStarts.length}
                  fill="rgb(var(--color-sunken))"
                  fillOpacity={0.7}
                  strokeOpacity={0}
                  ifOverflow="hidden"
                  zIndex={RACE_CHART_VEIL_Z}
                />
              )}
              {playbackLap > 0 && (
                <ReferenceLine x={playbackLap} stroke={TOKEN_HEX.f1red} strokeWidth={2} zIndex={RACE_CHART_NOW_Z} />
              )}
            </LineChart>
          </ResponsiveContainer>
        </div>
        <DriverEndLabels
          className="absolute inset-y-0 right-0"
          labels={endLabels}
          drivers={drivers}
          domain={[1, driverCount]}
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

function stepPos(
  arr: Array<{ ms: number; pos: number }>,
  boundaryMs: number,
): number | null {
  // arr is sorted ascending by ms; return last pos with ms <= boundaryMs
  let lo = 0;
  let hi = arr.length;
  while (lo < hi) {
    const mid = (lo + hi) >>> 1;
    if (arr[mid]!.ms <= boundaryMs) lo = mid + 1;
    else hi = mid;
  }
  return arr[lo - 1]?.pos ?? null;
}

interface TooltipProps {
  active?: boolean;
  label?: number | string;
  payload?: Array<{ dataKey?: string | number; value?: number }>;
  driverByNumber: ReadonlyMap<number, Driver>;
  highlight: number | null;
}
function LapTooltip({ active, label, payload, driverByNumber, highlight }: TooltipProps) {
  if (!active || !payload?.length) return null;
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
        value: `P${p.value}`,
        emphasis: num === highlight,
      };
    });
  return <ChartTooltipCard title={`Lap ${label}`} rows={rows} />;
}
