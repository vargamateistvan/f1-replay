import { useState } from "react";
import type {
  GridCell,
  ProgressionRound,
  RaceHref,
} from "@/utils/championship";
import type { DriverStanding } from "@/utils/standings";
import { ErrorMessage } from "@/components/ErrorMessage";
import { DriverHeadshot } from "@/components/DriverHeadshot";
import { MaybeLink } from "@/components/MaybeLink";
import { STATUS_TONE, cellTone } from "./cellTone";

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
  /** Driver profile links; names render as plain text without them. */
  readonly driverHref?: (driverNumber: number) => string;
  /** Replay links: column headers open the race, cells focus that driver. */
  readonly raceHref?: RaceHref;
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
  const extras = cell.pole ? ["pole position"] : [];
  return [where, `${cell.points} pts`, ...extras].join(" · ");
}

function markerText(cell: GridCell | null): string {
  if (!cell) return "";
  return cell.pole ? "P" : "";
}

function Marker({ text }: { text: string }) {
  return (
    <sup className="ml-px text-[8px] font-bold leading-none">{text}</sup>
  );
}

const MARKERS: { mark: string; description: string }[] = [
  { mark: "P", description: "Pole position" },
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
export function ResultsGrid({
  rounds,
  standings,
  cells,
  loading,
  driverHref,
  raceHref,
}: Props) {
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
                  <MaybeLink
                    to={raceHref?.(round)}
                    className="block hover:text-white hover:underline"
                  >
                    {round.code}
                  </MaybeLink>
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
                      <MaybeLink
                        to={driverHref?.(d.driverNumber)}
                        title={d.fullName}
                        className="font-black text-xs hover:underline"
                        style={{ color: d.color }}
                      >
                        {d.acronym}
                      </MaybeLink>
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
                        <MaybeLink
                          to={cell ? raceHref?.(round, d.driverNumber) : undefined}
                          className="block hover:underline"
                        >
                          {cellText(cell, mode)}
                          {markerText(cell) && <Marker text={markerText(cell)} />}
                        </MaybeLink>
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
