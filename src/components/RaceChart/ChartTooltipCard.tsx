import type { ReactNode } from "react";

export interface ChartTooltipRow {
  readonly key: string;
  readonly label: string;
  readonly color: string;
  readonly value: ReactNode;
  readonly emphasis?: boolean;
}

/** Recharts tooltip body for the tracker charts: eyebrow title + driver rows, two columns. */
export function ChartTooltipCard({
  title,
  rows,
}: {
  readonly title: string;
  readonly rows: readonly ChartTooltipRow[];
}) {
  const perColumn = Math.ceil(rows.length / 2);
  return (
    <div className="relative border border-panel bg-track py-1.5 pl-3 pr-2 text-caption shadow-[0_12px_28px_rgba(0,0,0,0.4)]">
      <span className="absolute inset-y-0 left-0 w-1 bg-f1red" aria-hidden="true" />
      <div className="mb-1 text-micro font-black uppercase tracking-eyebrow text-muted">
        {title}
      </div>
      <div
        className="grid grid-flow-col gap-x-3"
        style={{ gridTemplateRows: `repeat(${perColumn}, auto)` }}
      >
        {rows.map((r) => (
          <div
            key={r.key}
            className={`flex items-center gap-1.5 px-0.5 leading-4 ${r.emphasis ? "bg-panel" : ""}`}
          >
            <span className="w-7 font-black" style={{ color: r.color }}>
              {r.label}
            </span>
            <span className="font-mono tabular-nums text-fg">{r.value}</span>
          </div>
        ))}
      </div>
    </div>
  );
}
