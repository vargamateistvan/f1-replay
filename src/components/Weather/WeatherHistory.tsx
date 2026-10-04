import { useMemo } from "react";
import {
  CartesianGrid,
  Line,
  LineChart,
  ReferenceLine,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from "recharts";
import type { Weather } from "@/api/types";
import { WEATHER_CHART_HEIGHT } from "@/constants";
import { formatSessionElapsedTime } from "@/components/CommentaryPanels/commentaryList";
import { useSettings } from "@/stores/settings";
import {
  temperatureUnitLabel,
  toDisplayTemperature,
  toDisplayWindSpeed,
  windSpeedUnitLabel,
} from "@/utils/units";
import { WeatherPanel } from "./WeatherPanel";

type Props = Readonly<{
  entries: Weather[];
  sessionKey: number | null;
  sessionStartMs: number;
  sessionTimeMs: number;
}>;

type WeatherChartRow = {
  ms: number;
  air: number;
  track: number;
  wind: number;
  humidity: number;
  rain: number;
};

type WeatherChart = {
  title: string;
  unit: string;
  series: ReadonlyArray<{
    key: Exclude<keyof WeatherChartRow, "ms">;
    label: string;
    color: string;
  }>;
  domain: [number | "auto", number | "auto"];
  isRain?: boolean;
};

function formatWeatherTime(ms: number): string {
  const elapsed = formatSessionElapsedTime(ms);
  return elapsed.split(":").length === 2
    ? `00:${elapsed}`
    : elapsed.padStart(8, "0");
}

export function WeatherHistory({
  entries,
  sessionKey,
  sessionStartMs,
  sessionTimeMs,
}: Props) {
  const metricSystem = useSettings((s) => s.metricSystem);
  const rows = useMemo<WeatherChartRow[]>(
    () =>
      entries
        .map((entry) => ({
          ms: Date.parse(entry.date) - sessionStartMs,
          air: toDisplayTemperature(entry.air_temperature, metricSystem),
          track: toDisplayTemperature(entry.track_temperature, metricSystem),
          wind: toDisplayWindSpeed(entry.wind_speed, metricSystem),
          humidity: entry.humidity,
          rain: entry.rainfall > 0 ? 1 : 0,
        }))
        .filter((row) => Number.isFinite(row.ms) && row.ms >= 0)
        .sort((a, b) => a.ms - b.ms),
    [entries, sessionStartMs, metricSystem],
  );
  const charts: WeatherChart[] = [
    {
      title: "Temperature",
      unit: `°${temperatureUnitLabel(metricSystem)}`,
      series: [
        { key: "track", label: "Track", color: "#fb923c" },
        { key: "air", label: "Air", color: "#38bdf8" },
      ],
      domain: ["auto", "auto"],
    },
    {
      title: "Wind speed",
      unit: windSpeedUnitLabel(metricSystem),
      series: [{ key: "wind", label: "Wind", color: "#a78bfa" }],
      domain: [0, "auto"],
    },
    {
      title: "Humidity",
      unit: "%",
      series: [{ key: "humidity", label: "Humidity", color: "#2dd4bf" }],
      domain: [0, 100],
    },
    {
      title: "Rain",
      unit: "Wet / Dry",
      series: [{ key: "rain", label: "Conditions", color: "#38bdf8" }],
      domain: [0, 1],
      isRain: true,
    },
  ];
  const endMs = Math.max(1, rows.at(-1)?.ms ?? 0);

  return (
    <div className="min-h-0 overflow-y-auto">
      <WeatherPanel
        entries={entries}
        sessionKey={sessionKey}
        sessionStartMs={sessionStartMs}
        sessionTimeMs={sessionTimeMs}
      />
      <div className="p-3">
        <p className="mb-3 text-xs text-muted">
          Full-session weather history (HH:mm:ss). The red line marks the playhead.
          Rain indicates wet or dry conditions, not rainfall amount.
        </p>
        {rows.length === 0 ? (
          <div className="py-6 text-center text-xs text-muted">
            No weather history available
          </div>
        ) : (
          <div className="grid grid-cols-1 gap-3 lg:grid-cols-2">
            {charts.map((chart) => (
              <section
                key={chart.title}
                aria-label={`${chart.title} history`}
                className="min-w-0 border border-panel bg-track p-3"
              >
                <div className="mb-2 flex flex-wrap items-center justify-between gap-2">
                  <h3 className="text-[10px] font-bold uppercase tracking-wider text-white">
                    {chart.title}{" "}
                    <span className="text-muted">({chart.unit})</span>
                  </h3>
                  <div className="flex gap-3 text-[10px]">
                    {chart.series.map((series) => (
                      <span key={series.key} style={{ color: series.color }}>
                        {series.label}
                      </span>
                    ))}
                  </div>
                </div>
                <ResponsiveContainer width="100%" height={WEATHER_CHART_HEIGHT}>
                  <LineChart
                    data={rows}
                    syncId="weather-history"
                    margin={{ top: 8, right: 12, left: 0, bottom: 4 }}
                  >
                    <CartesianGrid stroke="rgb(var(--color-panel))" />
                    <XAxis
                      dataKey="ms"
                      type="number"
                      domain={[0, endMs]}
                      tickFormatter={formatWeatherTime}
                      tick={{ fill: "rgb(var(--color-muted))", fontSize: 10 }}
                      tickLine={false}
                      axisLine={{ stroke: "rgb(var(--color-panel))" }}
                    />
                    <YAxis
                      width={48}
                      domain={chart.domain}
                      ticks={chart.isRain ? [0, 1] : undefined}
                      tickFormatter={(value: number) =>
                        chart.isRain ? (value > 0 ? "Wet" : "Dry") : `${value}`
                      }
                      tick={{ fill: "rgb(var(--color-muted))", fontSize: 10 }}
                      tickLine={false}
                      axisLine={false}
                    />
                    <Tooltip
                      labelFormatter={(value) =>
                        `Session time: ${formatWeatherTime(Number(value))}`
                      }
                      formatter={(value) =>
                        chart.isRain
                          ? Number(value) > 0 ? "Wet" : "Dry"
                          : `${Number(value).toFixed(1)} ${chart.unit}`
                      }
                      contentStyle={{
                        backgroundColor: "rgb(var(--color-surface))",
                        borderColor: "rgb(var(--color-panel))",
                        color: "rgb(var(--color-muted))",
                        fontSize: 12,
                      }}
                    />
                    <ReferenceLine x={sessionTimeMs} stroke="#E8002D" />
                    {chart.series.map((series) => (
                      <Line
                        key={series.key}
                        dataKey={series.key}
                        name={series.label}
                        stroke={series.color}
                        type={chart.isRain ? "stepAfter" : "linear"}
                        dot={rows.length === 1}
                        isAnimationActive={false}
                        strokeWidth={2}
                      />
                    ))}
                  </LineChart>
                </ResponsiveContainer>
              </section>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}
