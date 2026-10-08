import { Trophy } from "lucide-react";
import type { RemainingPoints, TitleOutlook } from "@/utils/championship";

export interface TitleEntry {
  key: string;
  label: string;
  color: string;
  points: number;
  title?: TitleOutlook;
}

interface Props {
  /** Championship order, leader first. */
  readonly entries: TitleEntry[];
  readonly remaining: RemainingPoints | null;
  readonly scope: "driver" | "team";
}

function plural(n: number, word: string): string {
  return `${n} ${word}${n === 1 ? "" : "s"}`;
}

// Summarises who can still mathematically win the championship.
export function TitleOutlookBanner({ entries, remaining, scope }: Props) {
  if (!remaining || entries.length === 0 || !entries[0].title) return null;

  const leader = entries[0];
  const available = scope === "team" ? remaining.team : remaining.driver;
  const sessionsLeft = remaining.races + remaining.sprints;

  if (leader.title?.status === "champion") {
    return (
      <div
        role="status"
        className="flex items-center gap-2 border-b border-panel bg-surface px-4 py-2 text-xs"
      >
        <Trophy className="h-4 w-4 shrink-0 text-amber-300" aria-hidden />
        <span className="font-black" style={{ color: leader.color }}>
          {leader.label}
        </span>
        <span className="text-muted">
          {sessionsLeft === 0
            ? "won the championship"
            : `clinched the title with ${plural(remaining.races, "race")} to go`}
        </span>
      </div>
    );
  }

  const inContention = entries.filter(
    (e) => e.title?.status === "leader" || e.title?.status === "contender",
  );

  return (
    <div
      role="status"
      className="flex flex-wrap items-center gap-x-3 gap-y-1.5 border-b border-panel bg-surface px-4 py-2 text-xs"
    >
      <span className="flex items-center gap-2">
        <Trophy className="h-4 w-4 shrink-0 text-muted" aria-hidden />
        <span className="font-bold text-white">
          {plural(inContention.length, scope === "team" ? "team" : "driver")} in
          contention
        </span>
        <span className="text-muted">
          · {available} pts left ({plural(remaining.races, "race")}
          {remaining.sprints > 0 ? `, ${plural(remaining.sprints, "sprint")}` : ""})
        </span>
      </span>
      <span className="flex flex-wrap gap-1.5">
        {inContention.map((e) => (
          <span
            key={e.key}
            className="flex items-center gap-1.5 border border-panel px-2 py-0.5 font-mono text-[10px]"
            title={`Can reach at most ${e.title?.maxPoints ?? e.points} pts`}
          >
            <span className="font-black" style={{ color: e.color }}>
              {e.label}
            </span>
            <span className="tabular-nums text-muted">
              {e === leader ? `${e.points}` : `−${leader.points - e.points}`}
            </span>
          </span>
        ))}
      </span>
    </div>
  );
}
