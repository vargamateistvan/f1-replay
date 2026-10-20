import type {
  GridCell,
  ProgressionRound,
  RaceHref,
} from "@/utils/championship";
import {
  FINISH_BUCKETS,
  type DriverSeasonStats,
  type FinishBucket,
} from "@/utils/driverProfile";
import { cellTone } from "@/components/ResultsGrid/cellTone";
import { ErrorMessage } from "@/components/ErrorMessage";
import { MaybeLink } from "@/components/MaybeLink";
import { finishText, fmt } from "./format";

const SECTION_TITLE =
  "mb-3 text-[10px] font-bold uppercase tracking-[0.12em] text-muted";

const HEAD =
  "sticky top-0 bg-track py-2 text-[10px] font-bold uppercase tracking-wider text-muted shadow-[inset_0_-1px_0_rgb(var(--color-panel))]";

function signed(value: number | null): string {
  if (value === null) return "–";
  return `${value > 0 ? "+" : ""}${fmt(value)}`;
}

// ── Stat tiles ────────────────────────────────────────────────────────────────

export function StatTile({
  label,
  value,
  hint,
}: Readonly<{
  label: string;
  value: string;
  hint?: string;
}>) {
  return (
    <div data-standing-row className="min-w-0 bg-track px-3 py-2 sm:py-2.5">
      <div className="truncate text-[9px] font-bold uppercase tracking-[0.14em] text-muted">
        {label}
      </div>
      {/* Phones: hint beside the value so ten tiles stay ~5 short rows. */}
      <div className="mt-1 flex min-w-0 items-baseline gap-1.5 sm:block">
        <div className="shrink-0 font-mono text-base font-black tabular-nums leading-none sm:text-lg">
          {value}
        </div>
        {hint && (
          <div className="truncate text-[10px] leading-none text-muted sm:mt-1 sm:leading-normal">
            {hint}
          </div>
        )}
      </div>
    </div>
  );
}

export function DriverStatTiles({
  stats,
  points,
  position,
}: Readonly<{
  stats: DriverSeasonStats;
  points: number;
  position: number;
}>) {
  return (
    <div className="grid grid-cols-2 gap-px bg-panel sm:grid-cols-5 2xl:grid-cols-10">
      <StatTile
        label="Position"
        value={`P${position}`}
        hint={`${points} pts`}
      />
      <StatTile
        label="Wins"
        value={String(stats.wins)}
        hint={stats.sprintWins ? `+${stats.sprintWins} sprint` : undefined}
      />
      <StatTile label="Podiums" value={String(stats.podiums)} />
      <StatTile label="Poles" value={String(stats.poles)} />
      <StatTile
        label="Points finishes"
        value={`${stats.pointsFinishes}/${stats.races}`}
      />
      <StatTile
        label="Avg finish"
        value={fmt(stats.averageFinish)}
        hint={stats.bestFinish ? `best P${stats.bestFinish}` : undefined}
      />
      <StatTile
        label="Avg quali"
        value={fmt(stats.averageQualifying)}
        hint={
          stats.bestQualifying ? `best P${stats.bestQualifying}` : undefined
        }
      />
      <StatTile
        label="Pts / race"
        value={fmt(stats.pointsPerRace)}
        hint={
          stats.sprintPoints ? `+${stats.sprintPoints} sprint pts` : undefined
        }
      />
      <StatTile
        label="Places gained"
        value={signed(stats.averagePositionsGained)}
        hint="avg, quali → finish"
      />
      <StatTile
        label="Retirements"
        value={String(stats.dnfs + stats.dns + stats.dsq)}
        hint={
          stats.dns || stats.dsq
            ? `${stats.dnfs} DNF · ${stats.dns} DNS · ${stats.dsq} DSQ`
            : undefined
        }
      />
    </div>
  );
}

// ── Finish distribution ───────────────────────────────────────────────────────

const BUCKET_LABEL: Record<FinishBucket, string> = {
  win: "Wins",
  podium: "P2–P3",
  points: "Points",
  noPoints: "No points",
  dnf: "DNF / DNS / DSQ",
};

// Reuses the results-grid tones so the colours mean the same thing.
const BUCKET_TONE: Record<FinishBucket, string> = {
  win: cellTone({ position: 1, points: 25, status: "finished" }),
  podium: cellTone({ position: 3, points: 15, status: "finished" }),
  points: cellTone({ position: 6, points: 8, status: "finished" }),
  noPoints: "bg-muted/30",
  dnf: "bg-f1red",
};

export function FinishDistribution({
  counts,
}: Readonly<{
  counts: Record<FinishBucket, number>;
}>) {
  const total = FINISH_BUCKETS.reduce((sum, b) => sum + counts[b], 0);
  return (
    <section aria-label="Grand Prix finishes">
      <h2 className={SECTION_TITLE}>Grand Prix finishes</h2>
      {total === 0 ? (
        <div className="text-xs text-muted">No races yet</div>
      ) : (
        <>
          <div
            className="flex h-3 overflow-hidden rounded-sm bg-panel"
            role="img"
            aria-label={FINISH_BUCKETS.map(
              (b) => `${BUCKET_LABEL[b]}: ${counts[b]}`,
            ).join(", ")}
          >
            {FINISH_BUCKETS.map((b) =>
              counts[b] > 0 ? (
                <div
                  key={b}
                  className={BUCKET_TONE[b]}
                  style={{ width: `${(counts[b] / total) * 100}%` }}
                />
              ) : null,
            )}
          </div>
          <div className="mt-2 flex flex-wrap gap-x-3 gap-y-1 text-[10px] text-muted">
            {FINISH_BUCKETS.map((b) => (
              <span key={b} className="flex items-center gap-1.5">
                <span
                  className={`h-2.5 w-2.5 border border-panel ${BUCKET_TONE[b]}`}
                />
                {BUCKET_LABEL[b]}
                <span className="font-mono font-bold text-white tabular-nums">
                  {counts[b]}
                </span>
              </span>
            ))}
          </div>
        </>
      )}
    </section>
  );
}

// ── Round-by-round results ────────────────────────────────────────────────────

export function SeasonResults({
  rounds,
  cells,
  totals,
  positions,
  loading,
  raceHref,
}: Readonly<{
  rounds: ProgressionRound[];
  cells: (GridCell | null)[];
  /** Cumulative points after each round. */
  totals: number[];
  /** Championship position after each round. */
  positions: (number | null)[];
  loading?: boolean;
  /** Replay link per round (the page focuses its driver). */
  raceHref?: RaceHref;
}>) {
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
    <div className="max-md:overflow-x-auto">
      <table className="w-full border-collapse">
        <thead>
          <tr>
            <th scope="col" className={`${HEAD} px-2 sm:px-3 text-left`}>
              Round
            </th>
            <th
              scope="col"
              className={`${HEAD} px-1.5 sm:px-2 text-right`}
              title="Qualifying position"
            >
              Quali
            </th>
            <th scope="col" className={`${HEAD} px-1.5 sm:px-2 text-center`}>
              Finish
            </th>
            <th scope="col" className={`${HEAD} px-1.5 sm:px-2 text-right`}>
              Pts
            </th>
            <th scope="col" className={`${HEAD} px-1.5 sm:px-2 text-right`}>
              Total
            </th>
            <th
              scope="col"
              className={`${HEAD} px-2 sm:px-3 text-right`}
              title="Championship position after the round"
            >
              Champ
            </th>
          </tr>
        </thead>
        <tbody>
          {rounds.map((round, i) => {
            const cell = cells[i] ?? null;
            return (
              <tr
                key={round.sessionKey}
                data-standing-row
                className="border-b border-panel"
              >
                <th
                  scope="row"
                  className="px-2 sm:px-3 py-2 text-left text-xs font-normal"
                >
                  <MaybeLink
                    to={raceHref?.(round)}
                    title={`Watch ${round.label} on the tracker`}
                    className={`block max-w-[6.5rem] truncate hover:underline sm:max-w-none ${round.isSprint ? "text-muted italic" : "font-bold"}`}
                  >
                    {round.label}
                  </MaybeLink>
                </th>
                <td className="px-1.5 sm:px-2 py-2 text-right font-mono text-xs tabular-nums text-muted">
                  {cell?.qualifying !== undefined ? `P${cell.qualifying}` : ""}
                  {cell?.pole && (
                    <sup className="ml-px text-[8px] font-bold text-amber-300">
                      P
                    </sup>
                  )}
                </td>
                <td className="px-1.5 sm:px-2 py-1.5 text-center">
                  <span
                    className={`inline-block min-w-[2.75rem] px-1 py-0.5 font-mono text-xs tabular-nums ${cellTone(cell)}`}
                  >
                    {cell ? finishText(cell) : "—"}
                  </span>
                </td>
                <td className="px-1.5 sm:px-2 py-2 text-right font-mono text-xs tabular-nums">
                  {cell && cell.points > 0 ? cell.points : "–"}
                </td>
                <td className="px-1.5 sm:px-2 py-2 text-right font-mono text-xs font-bold tabular-nums">
                  {totals[i] ?? "–"}
                </td>
                <td className="px-2 sm:px-3 py-2 text-right font-mono text-xs tabular-nums text-muted">
                  {positions[i] != null ? `P${positions[i]}` : "–"}
                </td>
              </tr>
            );
          })}
        </tbody>
      </table>
    </div>
  );
}
