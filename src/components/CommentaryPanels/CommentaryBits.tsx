import type { ReactNode } from "react";
import type { Driver } from "@/api/types";
import { teamColor } from "@/utils/color";
import { COMMENTARY_GROUP_HEADER_CLASS } from "./commentaryList";

type ChipDriver = Pick<Driver, "driver_number" | "name_acronym" | "team_colour">;

/** Car number in a team-colour box followed by the acronym in team colour. */
export function DriverChip({
  driver,
  driverNumber,
}: Readonly<{ driver: ChipDriver | undefined | null; driverNumber: number }>) {
  const color = teamColor(driver?.team_colour);
  return (
    <span className="inline-flex items-center gap-1 align-middle">
      <span
        aria-hidden="true"
        className="inline-flex h-4 min-w-[18px] items-center justify-center rounded-sm px-0.5 font-mono text-[9px] font-black tabular-nums text-white"
        style={{
          backgroundColor: color,
          textShadow: "0 1px 1px rgba(0,0,0,0.5)",
        }}
      >
        {driver?.driver_number ?? driverNumber}
      </span>
      <span className="font-black uppercase tracking-widest" style={{ color }}>
        {driver?.name_acronym ?? driverNumber}
      </span>
    </span>
  );
}

/** Red "New" tag for an item the playhead just crossed. */
export function FreshTag() {
  return (
    <span className="rounded-sm bg-f1red px-1 py-px text-[8px] font-black uppercase tracking-widest text-white">
      New
    </span>
  );
}

/** Sticky lap/phase header with optional extras and the item count on the right. */
export function CommentaryGroupHeader({
  label,
  count,
  children,
}: Readonly<{ label: string; count: number; children?: ReactNode }>) {
  return (
    <div className={`${COMMENTARY_GROUP_HEADER_CLASS} flex items-center gap-2`}>
      <span>{label}</span>
      {children}
      <span className="ml-auto font-mono tabular-nums tracking-normal">
        {count}
      </span>
    </div>
  );
}

export interface CommentaryStat {
  key: string;
  label: string;
  value: ReactNode;
  /** Small line under the value (driver, unit…). */
  detail?: ReactNode;
  /** Value colour; defaults to white. */
  accent?: string;
}

/** Row of stat tiles at the top of a feed (totals up to the playhead). */
export function CommentarySummary({
  stats,
}: Readonly<{ stats: CommentaryStat[] }>) {
  if (stats.length === 0) return null;
  return (
    <div
      className="grid gap-1"
      style={{ gridTemplateColumns: `repeat(${stats.length}, minmax(0, 1fr))` }}
    >
      {stats.map((stat) => (
        <div
          key={stat.key}
          className="min-w-0 rounded border border-panel bg-track px-2 py-1.5"
        >
          <div className="text-[8px] font-black uppercase tracking-widest text-muted">
            {stat.label}
          </div>
          <div
            className="mt-0.5 truncate font-mono text-[13px] font-black leading-tight tabular-nums"
            style={{ color: stat.accent ?? "#fff" }}
          >
            {stat.value}
          </div>
          {stat.detail && (
            <div className="mt-0.5 truncate text-[9px] text-muted">
              {stat.detail}
            </div>
          )}
        </div>
      ))}
    </div>
  );
}
