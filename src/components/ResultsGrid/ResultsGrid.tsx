import { useState } from "react";
import type { GridCell, ProgressionRound } from "@/utils/championship";
import type { DriverStanding } from "@/utils/standings";
import { ErrorMessage } from "@/components/ErrorMessage";

type Mode = "position" | "points";

interface Props {
  readonly rounds: ProgressionRound[];
  /** Rows in championship order. */
  readonly standings: DriverStanding[];
  readonly cells: Map<number, (GridCell | null)[]>;
  readonly loading?: boolean;
}

const STATUS_TEXT: Record<Exclude<GridCell["status"], "finished">, string> = {
  dnf: "DNF",
  dns: "DNS",
  dsq: "DSQ",
};

function cellTone(cell: GridCell | null): string {
  if (!cell) return "text-muted/40";
  if (cell.status === "dnf") return "bg-red-500/15 text-red-300";
  if (cell.status !== "finished") return "text-muted";
  if (cell.position === 1) return "bg-amber-300 text-black font-black";
  if (cell.position === 2) return "bg-zinc-300 text-black font-bold";
  if (cell.position === 3) return "bg-[#cd7f32] text-black font-bold";
  if (cell.points > 0) return "bg-emerald-500/20 text-emerald-200";
  return "text-white/70";
}

function cellText(cell: GridCell | null, mode: Mode): string {
  if (!cell) return "";
  if (cell.status !== "finished") return STATUS_TEXT[cell.status];
  if (mode === "points") return cell.points > 0 ? String(cell.points) : "–";
  return String(cell.position);
}

function describe(cell: GridCell | null): string {
  if (!cell) return "did not take part";
  const where =
    cell.status === "finished" ? `P${cell.position}` : STATUS_TEXT[cell.status];
  return `${where} · ${cell.points} pts`;
}

const LEGEND: { label: string; tone: string }[] = [
  {
    label: "Win",
    tone: cellTone({ position: 1, points: 25, status: "finished" }),
  },
  {
    label: "P2",
    tone: cellTone({ position: 2, points: 18, status: "finished" }),
  },
  {
    label: "P3",
    tone: cellTone({ position: 3, points: 15, status: "finished" }),
  },
  {
    label: "Points",
    tone: cellTone({ position: 6, points: 8, status: "finished" }),
  },
  {
    label: "No points",
    tone: cellTone({ position: 15, points: 0, status: "finished" }),
  },
  {
    label: "DNF",
    tone: cellTone({ position: null, points: 0, status: "dnf" }),
  },
];

// Drivers × rounds table of finishing positions (or points), colour-coded.
export function ResultsGrid({ rounds, standings, cells, loading }: Props) {
  const [mode, setMode] = useState<Mode>("position");

  if (rounds.length === 0 || standings.length === 0) {
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
    <div className="flex flex-col gap-3 p-4 md:min-h-0 md:flex-1">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div className="flex flex-wrap gap-1.5 text-[10px] font-bold">
          {LEGEND.map((item) => (
            <span
              key={item.label}
              className="flex items-center gap-1.5 text-muted"
            >
              <span className={`h-3 w-3 border border-panel ${item.tone}`} />
              {item.label}
            </span>
          ))}
          <span className="text-muted">· S = Sprint</span>
        </div>
        <div className="flex" role="group" aria-label="Cell value">
          {(["position", "points"] as Mode[]).map((m) => (
            <button
              key={m}
              type="button"
              aria-pressed={mode === m}
              onClick={() => setMode(m)}
              className={`border px-2 py-1 text-[10px] font-bold uppercase tracking-[0.12em] ${
                mode === m
                  ? "border-f1red bg-f1red text-white"
                  : "border-panel bg-track text-muted hover:text-white"
              }`}
            >
              {m}
            </button>
          ))}
        </div>
      </div>

      {/* Capped on mobile so the sticky header and driver column stay usable. */}
      <div className="max-h-[70vh] overflow-auto border border-panel md:max-h-none md:min-h-0 md:flex-1">
        <table className="border-collapse font-mono text-[11px] tabular-nums">
          <thead>
            <tr className="bg-surface">
              <th
                scope="col"
                className="sticky left-0 top-0 z-20 bg-surface px-3 py-2 text-left text-[10px] font-bold uppercase tracking-widest text-muted"
              >
                Driver
              </th>
              {rounds.map((round) => (
                <th
                  key={round.sessionKey}
                  scope="col"
                  title={round.label}
                  className={`sticky top-0 z-10 min-w-[2.25rem] px-1 py-2 text-center text-[10px] font-bold ${
                    round.isSprint
                      ? "bg-surface text-muted/70"
                      : "bg-surface text-muted"
                  }`}
                >
                  <span className="block">{round.code}</span>
                  {round.isSprint && (
                    <span className="block text-[8px] text-muted/70">S</span>
                  )}
                </th>
              ))}
              <th
                scope="col"
                className="sticky right-0 top-0 z-20 bg-surface px-3 py-2 text-right text-[10px] font-bold uppercase tracking-widest text-muted"
              >
                Pts
              </th>
            </tr>
          </thead>
          <tbody>
            {standings.map((d) => {
              const row = cells.get(d.driverNumber) ?? [];
              return (
                <tr
                  key={d.driverNumber}
                  data-standing-row
                  className="border-t border-panel"
                >
                  <th
                    scope="row"
                    className="sticky left-0 z-10 bg-track px-3 py-1.5 text-left"
                  >
                    <span className="flex items-center gap-2">
                      <span className="w-5 text-right text-muted">
                        {d.position}
                      </span>
                      <span
                        className="h-3.5 w-[3px]"
                        style={{ background: d.color }}
                      />
                      <span className="font-black" style={{ color: d.color }}>
                        {d.acronym}
                      </span>
                    </span>
                  </th>
                  {rounds.map((round, i) => {
                    const cell = row[i] ?? null;
                    return (
                      <td
                        key={round.sessionKey}
                        title={`${d.acronym} · ${round.label}: ${describe(cell)}`}
                        className={`border-l border-panel px-1 py-1.5 text-center ${cellTone(cell)} ${
                          round.isSprint ? "text-[10px] italic" : ""
                        }`}
                      >
                        {cellText(cell, mode)}
                      </td>
                    );
                  })}
                  <td className="sticky right-0 z-10 border-l border-panel bg-track px-3 py-1.5 text-right font-bold text-white">
                    {d.points}
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>
    </div>
  );
}
