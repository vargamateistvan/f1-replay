import type { Driver } from "@/api/types";
import { DriverHeadshot } from "@/components/DriverHeadshot";
import { MaybeLink } from "@/components/MaybeLink";
import { FOCUS_RING } from "@/components/Button/buttonClass";

export interface PodiumEntry {
  key: string;
  position: number;
  /** Big label: driver acronym or team name. */
  label: string;
  /** Secondary line: full name / team, or a team's wins. */
  detail?: string;
  color: string;
  points: number;
  /** Headshot for driver entries. */
  driver?: Driver;
  href?: string;
}

const MEDAL = ["text-podium-gold", "text-podium-silver", "text-podium-bronze"];

/**
 * The championship top three as cards above the standings table: medal
 * position, team colour, points and the gap to the leader.
 */
export function StandingsPodium({
  entries,
  label,
}: {
  entries: PodiumEntry[];
  /** Accessible name, e.g. "Driver championship top three". */
  label: string;
}) {
  const top = entries.slice(0, 3);
  if (top.length === 0) return null;
  const leaderPoints = top[0].points;
  return (
    <ol
      aria-label={label}
      className="grid shrink-0 grid-cols-3 gap-2 border-b border-panel bg-sunken p-2 sm:p-3"
    >
      {top.map((e, i) => {
        const gap = leaderPoints - e.points;
        return (
          <li key={e.key} className="min-w-0">
            <MaybeLink
              to={e.href}
              aria-label={`P${e.position} ${e.label}, ${e.points} points`}
              className={`group relative flex h-full min-w-0 flex-col gap-2 overflow-hidden rounded-sm border border-panel bg-surface p-2.5 pt-3 transition-colors hover:border-line sm:flex-row sm:items-center sm:gap-3 sm:p-3 sm:pt-3.5 ${FOCUS_RING}`}
            >
              <span
                aria-hidden="true"
                className="absolute inset-x-0 top-0 h-1"
                style={{ background: e.color }}
              />
              <span className="flex items-center gap-2 sm:contents">
                <span
                  className={`text-xl font-black leading-none tabular-nums sm:text-stat ${
                    MEDAL[i] ?? "text-fg"
                  }`}
                >
                  {e.position}
                </span>
                {e.driver !== undefined && (
                  <span className="hidden sm:block">
                    <DriverHeadshot driver={e.driver} accent={e.color} size="md" />
                  </span>
                )}
              </span>
              <span className="min-w-0 flex-1">
                <span
                  className="block truncate text-small font-black uppercase tracking-wider group-hover:underline sm:text-sm"
                  style={{ color: e.color }}
                >
                  {e.label}
                </span>
                {e.detail && (
                  <span className="hidden truncate text-small text-muted sm:block">
                    {e.detail}
                  </span>
                )}
              </span>
              <span className="text-left sm:text-right">
                <span className="block font-mono text-base font-bold leading-tight tabular-nums text-fg sm:text-xl">
                  {e.points}
                  <span className="ml-1 text-tiny font-bold text-muted">PTS</span>
                </span>
                <span
                  className={`block font-mono text-tiny font-bold uppercase tracking-wider tabular-nums ${
                    gap === 0 ? "text-f1red-fg" : "text-muted"
                  }`}
                >
                  {gap === 0 ? "Leader" : `−${gap}`}
                </span>
              </span>
            </MaybeLink>
          </li>
        );
      })}
    </ol>
  );
}
