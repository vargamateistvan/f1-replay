import { useState } from "react";
import type { GridCell, ProgressionRound } from "@/utils/championship";
import type { DriverStanding } from "@/utils/standings";
import { ErrorMessage } from "@/components/ErrorMessage";
import { DriverHeadshot } from "@/components/DriverHeadshot";

type Mode = "position" | "points";

// Matches the driver/constructor standings table headers; the inset shadow
// stands in for border-b, which border-collapse drops on sticky cells.
const HEAD =
  "sticky top-0 bg-track py-2 text-[10px] font-bold uppercase tracking-widest shadow-[inset_0_-1px_0_rgb(var(--color-panel))]";

interface Props {
  readonly rounds: ProgressionRound[];
  /** Rows in championship order. */
  readonly standings: DriverStanding[];
  readonly cells: Map<number, (GridCell | null)[]>;
  readonly loading?: boolean;
}

type Status = Exclude<GridCell["status"], "finished">;

const STATUS_TEXT: Record<Status, string> = {
  dnf: "DNF",
  dns: "DNS",
  dsq: "DSQ",
};

const STATUS_DESCRIPTION: Record<Status, string> = {
  dnf: "Did not finish",
  dns: "Did not start",
  dsq: "Disqualified",
};

// Non-classified results share F1 red, getting stronger from DNS to DSQ.
const STATUS_TONE: Record<Status, string> = {
  dns: "text-f1red/60 font-bold",
  dnf: "bg-f1red/10 text-f1red font-bold",
  dsq: "bg-f1red text-white font-bold",
};

// Podiums keep their medal colours; everything else uses the app palette
// (panel tiles, muted text, F1 red) so the grid matches the standings tables.
function cellTone(cell: GridCell | null): string {
  if (!cell) return "text-muted/40";
  if (cell.status !== "finished") return STATUS_TONE[cell.status];
  if (cell.position === 1) return "bg-amber-300 text-black font-black";
  if (cell.position === 2) return "bg-[#c0c0c0] text-black font-bold";
  if (cell.position === 3) return "bg-[#cd7f32] text-black font-bold";
  if (cell.points > 0) return "bg-panel text-white font-bold";
  return "text-muted";
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
    cell.status === "finished"
      ? `P${cell.position}`
      : `${STATUS_TEXT[cell.status]} (${STATUS_DESCRIPTION[cell.status].toLowerCase()})`;
  const extras = [
    cell.pole ? "pole position" : null,
    cell.fastestLap ? "fastest lap" : null,
  ].filter(Boolean);
  return [where, `${cell.points} pts`, ...extras].join(" · ");
}

function markerText(cell: GridCell | null): string {
  if (!cell) return "";
  return `${cell.pole ? "P" : ""}${cell.fastestLap ? "F" : ""}`;
}

function Marker({ text }: { text: string }) {
  return (
    <sup className="ml-px text-[8px] font-bold leading-none">{text}</sup>
  );
}

const MARKERS: { mark: string; description: string }[] = [
  { mark: "P", description: "Pole position" },
  { mark: "F", description: "Fastest lap" },
];

const LEGEND: { label: string; tone: string; description?: string }[] = [
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
  ...(["dns", "dnf", "dsq"] as Status[]).map((status) => ({
    label: STATUS_TEXT[status],
    tone: STATUS_TONE[status],
    description: STATUS_DESCRIPTION[status],
  })),
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
    <div className="flex flex-col md:min-h-0 md:flex-1">
      <div className="flex flex-wrap items-center justify-between gap-3 border-b border-panel bg-surface px-4 py-2">
        <div className="flex flex-wrap gap-x-2.5 gap-y-1.5 text-[10px] font-bold">
          {LEGEND.map((item) => (
            <span
              key={item.label}
              className="flex items-center gap-1.5 text-muted"
            >
              {item.description ? (
                <>
                  <span
                    className={`border border-panel px-1 font-mono text-[9px] leading-3 ${item.tone}`}
                  >
                    {item.label}
                  </span>
                  {item.description}
                </>
              ) : (
                <>
                  <span className={`h-3 w-3 border border-panel ${item.tone}`} />
                  {item.label}
                </>
              )}
            </span>
          ))}
          {MARKERS.map((item) => (
            <span
              key={item.mark}
              className="flex items-center gap-1.5 text-muted"
            >
              <span className="font-mono text-white">
                1<Marker text={item.mark} />
              </span>
              {item.description}
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
      <div className="max-h-[70vh] overflow-auto md:max-h-none md:min-h-0 md:flex-1">
        <table className="w-full border-collapse">
          <thead>
            <tr>
              <th scope="col" className={`${HEAD} left-0 z-20 px-3 text-left text-muted`}>
                Driver
              </th>
              {rounds.map((round) => (
                <th
                  key={round.sessionKey}
                  scope="col"
                  title={round.label}
                  className={`${HEAD} z-10 min-w-[2.5rem] px-1 text-center ${
                    round.isSprint ? "text-muted/70" : "text-muted"
                  }`}
                >
                  <span className="block">{round.code}</span>
                  {round.isSprint && (
                    <span className="block text-[8px] text-muted/70">S</span>
                  )}
                </th>
              ))}
              <th scope="col" className={`${HEAD} right-0 z-20 px-3 text-right text-muted`}>
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
                  className="border-b border-panel"
                >
                  <th
                    scope="row"
                    className="sticky left-0 z-10 bg-track px-3 py-3 text-left font-normal"
                  >
                    <span className="flex items-center gap-2">
                      <span className="w-5 font-black text-sm tabular-nums">
                        {d.position}
                      </span>
                      <DriverHeadshot
                        driver={d.driver}
                        accent={d.color}
                        size="xxs"
                      />
                      <span
                        className="h-4 w-[3px] shrink-0"
                        style={{ background: d.color }}
                      />
                      <span
                        className="font-black text-xs"
                        style={{ color: d.color }}
                      >
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
                        className={`border-l border-panel px-1 py-3 text-center font-mono text-xs tabular-nums ${cellTone(cell)} ${
                          round.isSprint ? "text-[10px] italic" : ""
                        }`}
                      >
                        {cellText(cell, mode)}
                        {markerText(cell) && <Marker text={markerText(cell)} />}
                      </td>
                    );
                  })}
                  <td className="sticky right-0 z-10 border-l border-panel bg-track px-3 py-3 text-right font-mono text-sm font-bold tabular-nums">
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
