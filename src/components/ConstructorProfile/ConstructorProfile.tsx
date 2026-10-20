import { Link } from "react-router-dom";
import type {
  GridCell,
  ProgressionRound,
  RaceHref,
} from "@/utils/championship";
import type { ConstructorSeasonStats } from "@/utils/constructorProfile";
import { driverPath } from "@/utils/driverProfile";
import type { DriverStanding } from "@/utils/standings";
import { cellTone } from "@/components/ResultsGrid/cellTone";
import { ErrorMessage } from "@/components/ErrorMessage";
import { DriverHeadshot } from "@/components/DriverHeadshot";
import { MaybeLink } from "@/components/MaybeLink";
import { StatTile } from "@/components/DriverProfile/DriverProfile";
import { finishText, fmt } from "@/components/DriverProfile/format";

const SECTION_TITLE =
  "mb-3 text-[10px] font-bold uppercase tracking-[0.12em] text-muted";

const HEAD =
  "sticky top-0 bg-track py-2 text-[10px] font-bold uppercase tracking-wider text-muted shadow-[inset_0_-1px_0_rgb(var(--color-panel))]";

// ── Stat tiles ────────────────────────────────────────────────────────────────

export function ConstructorStatTiles({
  stats,
  points,
  position,
}: Readonly<{
  stats: ConstructorSeasonStats;
  points: number;
  position: number;
}>) {
  return (
    <div className="grid grid-cols-2 gap-px bg-panel sm:grid-cols-5 2xl:grid-cols-10">
      <StatTile label="Position" value={`P${position}`} hint={`${points} pts`} />
      <StatTile
        label="Wins"
        value={String(stats.wins)}
        hint={stats.sprintWins ? `+${stats.sprintWins} sprint` : undefined}
      />
      <StatTile label="Podiums" value={String(stats.podiums)} hint="car finishes" />
      <StatTile label="Poles" value={String(stats.poles)} />
      <StatTile label="1-2 finishes" value={String(stats.oneTwos)} />
      <StatTile
        label="Double points"
        value={`${stats.doublePoints}/${stats.races}`}
        hint="both cars scored"
      />
      <StatTile
        label="Points finishes"
        value={`${stats.pointsFinishes}/${stats.entries}`}
        hint="car finishes"
      />
      <StatTile
        label="Pts / race"
        value={fmt(stats.pointsPerRace)}
        hint={stats.sprintPoints ? `+${stats.sprintPoints} sprint pts` : undefined}
      />
      <StatTile
        label="Avg quali"
        value={fmt(stats.averageQualifying)}
        hint="all cars"
      />
      <StatTile
        label="Retirements"
        value={String(stats.retirements)}
        hint="DNF · DNS · DSQ"
      />
    </div>
  );
}

// ── Driver line-up ────────────────────────────────────────────────────────────

// Each driver's share of the team's points, linking to their profile.
export function DriverLineup({
  drivers,
  teamPoints,
  color,
  search,
}: Readonly<{
  drivers: DriverStanding[];
  teamPoints: number;
  color: string;
  search: string;
}>) {
  return (
    <section aria-label="Drivers">
      <h2 className={SECTION_TITLE}>Drivers</h2>
      <ul className="space-y-3">
        {drivers.map((d) => {
          const share = teamPoints > 0 ? (d.points / teamPoints) * 100 : 0;
          return (
            <li key={d.driverNumber}>
              <Link
                to={`${driverPath(d.driverNumber)}${search}`}
                aria-label={`${d.fullName} driver profile`}
                className="group flex items-center gap-3"
              >
                <DriverHeadshot driver={d.driver} accent={color} size="sm" />
                <span className="min-w-0 flex-1">
                  <span className="flex items-baseline justify-between gap-2 text-xs">
                    <span className="truncate font-bold group-hover:underline">
                      {d.fullName}
                    </span>
                    <span className="shrink-0 font-mono tabular-nums text-muted">
                      P{d.position} ·{" "}
                      <span className="font-bold text-white">{d.points}</span> pts
                    </span>
                  </span>
                  <span className="mt-1 block h-1.5 overflow-hidden rounded bg-panel">
                    <span
                      className="block h-full"
                      style={{ width: `${share}%`, background: color }}
                    />
                  </span>
                </span>
              </Link>
            </li>
          );
        })}
      </ul>
    </section>
  );
}

// ── Round-by-round results ────────────────────────────────────────────────────

export function ConstructorResults({
  rounds,
  drivers,
  rows,
  roundPoints,
  totals,
  positions,
  loading,
  raceHref,
}: Readonly<{
  rounds: ProgressionRound[];
  drivers: DriverStanding[];
  /** One results-grid row per driver, aligned with `drivers`. */
  rows: (GridCell | null)[][];
  roundPoints: number[];
  /** Cumulative team points after each round. */
  totals: number[];
  /** Championship position after each round. */
  positions: (number | null)[];
  loading?: boolean;
  /** Replay links: the round label opens the race, a driver's cell focuses them. */
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
            {drivers.map((d) => (
              <th
                key={d.driverNumber}
                scope="col"
                title={d.fullName}
                className={`${HEAD} px-1.5 sm:px-2 text-center`}
              >
                {d.acronym}
              </th>
            ))}
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
          {rounds.map((round, i) => (
            <tr
              key={round.sessionKey}
              data-standing-row
              className="border-b border-panel"
            >
              <th scope="row" className="px-2 sm:px-3 py-2 text-left text-xs font-normal">
                <MaybeLink
                  to={raceHref?.(round)}
                  title={`Watch ${round.label} on the tracker`}
                  className={`block max-w-[6.5rem] truncate hover:underline sm:max-w-none ${round.isSprint ? "text-muted italic" : "font-bold"}`}
                >
                  {round.label}
                </MaybeLink>
              </th>
              {rows.map((row, d) => {
                const cell = row[i] ?? null;
                return (
                  <td key={drivers[d].driverNumber} className="px-1.5 sm:px-2 py-1.5 text-center">
                    <MaybeLink
                      to={cell ? raceHref?.(round, drivers[d].driverNumber) : undefined}
                      title={
                        cell
                          ? `Watch ${drivers[d].acronym} in ${round.label}`
                          : undefined
                      }
                      className={`inline-block min-w-[2.75rem] px-1 py-0.5 font-mono text-xs tabular-nums hover:ring-1 hover:ring-white/40 ${cellTone(cell)}`}
                    >
                      {cell ? finishText(cell) : "—"}
                      {cell?.pole && (
                        <sup className="ml-px text-[8px] font-bold">P</sup>
                      )}
                    </MaybeLink>
                  </td>
                );
              })}
              <td className="px-1.5 sm:px-2 py-2 text-right font-mono text-xs tabular-nums">
                {roundPoints[i] ? roundPoints[i] : "–"}
              </td>
              <td className="px-1.5 sm:px-2 py-2 text-right font-mono text-xs font-bold tabular-nums">
                {totals[i] ?? "–"}
              </td>
              <td className="px-2 sm:px-3 py-2 text-right font-mono text-xs tabular-nums text-muted">
                {positions[i] != null ? `P${positions[i]}` : "–"}
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}
