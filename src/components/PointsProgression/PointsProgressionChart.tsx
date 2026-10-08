import { useMemo, useState } from "react";
import {
  LineChart,
  Line,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  ResponsiveContainer,
} from "recharts";
import type { ProgressionRound } from "@/utils/championship";
import { ErrorMessage } from "@/components/ErrorMessage";
import { PROGRESSION_DEFAULT_LINES } from "@/constants";

export interface ProgressionSeries {
  key: string;
  label: string;
  color: string;
  /** Distinguishes teammates who share a team colour. */
  dashed?: boolean;
  values: number[];
}

interface Props {
  readonly rounds: ProgressionRound[];
  /** In championship order; only the first few are drawn until "show all". */
  readonly series: ProgressionSeries[];
  readonly loading?: boolean;
}

interface TooltipEntry {
  dataKey?: string | number;
  name?: string;
  value?: number;
  color?: string;
}

function ProgressionTooltip({
  active,
  payload,
  label,
}: {
  active?: boolean;
  payload?: TooltipEntry[];
  label?: string;
}) {
  if (!active || !payload?.length) return null;
  const rows = [...payload].sort((a, b) => (b.value ?? 0) - (a.value ?? 0));
  return (
    <div className="bg-surface border border-panel text-xs font-mono px-3 py-2 rounded shadow-lg">
      <div className="text-muted mb-1">After {label}</div>
      {rows.map((row) => (
        <div key={String(row.dataKey)} className="flex justify-between gap-4">
          <span className="font-bold" style={{ color: row.color }}>
            {row.name}
          </span>
          <span className="tabular-nums text-white">{row.value}</span>
        </div>
      ))}
    </div>
  );
}

// Cumulative championship points after every Race/Sprint, one line per entry.
export function PointsProgressionChart({ rounds, series, loading }: Props) {
  const [showAll, setShowAll] = useState(false);
  const [highlighted, setHighlighted] = useState<string | null>(null);

  const visible = useMemo(
    () => (showAll ? series : series.slice(0, PROGRESSION_DEFAULT_LINES)),
    [series, showAll],
  );
  const rows = useMemo(
    () =>
      rounds.map((round, i) => {
        const row: Record<string, string | number> = { label: round.label };
        for (const s of visible) row[s.key] = s.values[i] ?? 0;
        return row;
      }),
    [rounds, visible],
  );

  if (rounds.length === 0) {
    return (
      <div className="min-h-32">
        <ErrorMessage
          message={loading ? "Loading race results…" : "No race results yet"}
          variant="empty"
        />
      </div>
    );
  }

  return (
    <div>
      <ResponsiveContainer width="100%" height={360}>
        <LineChart data={rows} margin={{ top: 8, right: 16, left: 0, bottom: 4 }}>
          <CartesianGrid stroke="rgb(var(--color-panel))" vertical={false} />
          <XAxis
            dataKey="label"
            tick={{ fill: "rgb(var(--color-muted))", fontSize: 10 }}
            axisLine={{ stroke: "rgb(var(--color-panel))" }}
            tickLine={false}
            interval="preserveStartEnd"
            minTickGap={8}
          />
          <YAxis
            width={36}
            tick={{ fill: "rgb(var(--color-muted))", fontSize: 10 }}
            axisLine={false}
            tickLine={false}
          />
          <Tooltip content={<ProgressionTooltip />} />
          {visible.map((s) => {
            const dimmed = highlighted !== null && highlighted !== s.key;
            return (
              <Line
                key={s.key}
                type="linear"
                dataKey={s.key}
                name={s.label}
                stroke={s.color}
                strokeWidth={highlighted === s.key ? 3 : 1.75}
                strokeOpacity={dimmed ? 0.15 : 1}
                strokeDasharray={s.dashed ? "5 3" : undefined}
                dot={false}
                isAnimationActive={false}
              />
            );
          })}
        </LineChart>
      </ResponsiveContainer>

      <div className="mt-3 flex flex-wrap items-center gap-1.5">
        {visible.map((s) => (
          <button
            key={s.key}
            type="button"
            onMouseEnter={() => setHighlighted(s.key)}
            onMouseLeave={() => setHighlighted(null)}
            onFocus={() => setHighlighted(s.key)}
            onBlur={() => setHighlighted(null)}
            className="flex items-center gap-1.5 border border-panel px-2 py-1 text-[10px] font-bold text-muted hover:text-white focus:text-white focus:outline-none"
          >
            <span
              className="h-0.5 w-3"
              style={{
                background: s.dashed
                  ? `repeating-linear-gradient(90deg, ${s.color} 0 3px, transparent 3px 5px)`
                  : s.color,
              }}
            />
            {s.label}
          </button>
        ))}
        {series.length > PROGRESSION_DEFAULT_LINES && (
          <button
            type="button"
            onClick={() => setShowAll((v) => !v)}
            className="ml-auto border border-panel px-2 py-1 text-[10px] font-bold uppercase tracking-[0.12em] text-muted hover:text-white"
          >
            {showAll ? `Top ${PROGRESSION_DEFAULT_LINES}` : `Show all ${series.length}`}
          </button>
        )}
      </div>
    </div>
  );
}
