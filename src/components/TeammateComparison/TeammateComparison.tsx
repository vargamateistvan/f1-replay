import type { TeammateComparison as Comparison } from "@/hooks/useStandings";
import { DriverHeadshot } from "@/components/DriverHeadshot";
import { ErrorMessage } from "@/components/ErrorMessage";

interface Props {
  readonly comparisons: Comparison[];
  readonly qualifyingLoading?: boolean;
}

function SplitRow({
  label,
  a,
  b,
  color,
  pending,
}: {
  label: string;
  a: number;
  b: number;
  color: string;
  pending?: boolean;
}) {
  const total = a + b;
  const pctA = total === 0 ? 50 : (a / total) * 100;
  return (
    <div className="grid grid-cols-[2.5rem_1fr_2.5rem] items-center gap-2">
      <span
        className={`text-right font-mono text-sm tabular-nums ${
          a > b ? "font-black text-white" : "text-muted"
        }`}
      >
        {pending ? "…" : a}
      </span>
      <div>
        <div className="mb-1 text-center text-[9px] font-bold uppercase tracking-[0.16em] text-muted">
          {label}
        </div>
        <div
          className="flex h-1.5 overflow-hidden rounded bg-panel"
          role="img"
          aria-label={`${label}: ${a}–${b}`}
        >
          <div style={{ width: `${pctA}%`, background: color }} />
          <div
            style={{ width: `${100 - pctA}%`, background: color, opacity: 0.35 }}
          />
        </div>
      </div>
      <span
        className={`font-mono text-sm tabular-nums ${
          b > a ? "font-black text-white" : "text-muted"
        }`}
      >
        {pending ? "…" : b}
      </span>
    </div>
  );
}

// Head-to-head records for each team's two regular drivers.
export function TeammateComparison({ comparisons, qualifyingLoading }: Props) {
  if (comparisons.length === 0) {
    return (
      <div className="min-h-32">
        <ErrorMessage
          message="No teammate data for the selected season"
          variant="empty"
        />
      </div>
    );
  }

  return (
    <div className="grid gap-px bg-panel sm:grid-cols-2 xl:grid-cols-3">
      {comparisons.map((c) => (
        <section
          key={c.team}
          data-standing-row
          className="bg-track p-4"
          aria-label={`${c.team} teammate comparison`}
        >
          <header className="mb-3 flex items-center gap-2">
            <span className="h-4 w-[3px]" style={{ background: c.color }} />
            <h3
              className="text-xs font-black uppercase tracking-[0.12em]"
              style={{ color: c.color }}
            >
              {c.team}
            </h3>
          </header>

          <div className="mb-4 flex items-center justify-between">
            <span className="flex items-center gap-2">
              <DriverHeadshot driver={c.a.driver} accent={c.color} size="sm" />
              <span>
                <span className="block text-sm font-black">{c.a.acronym}</span>
                <span className="block text-[10px] text-muted">P{c.a.position}</span>
              </span>
            </span>
            <span className="text-[10px] font-bold uppercase text-muted">vs</span>
            <span className="flex items-center gap-2 text-right">
              <span>
                <span className="block text-sm font-black">{c.b.acronym}</span>
                <span className="block text-[10px] text-muted">P{c.b.position}</span>
              </span>
              <DriverHeadshot driver={c.b.driver} accent={c.color} size="sm" />
            </span>
          </div>

          <div className="space-y-3">
            <SplitRow
              label="Qualifying"
              a={c.qualifying.a}
              b={c.qualifying.b}
              color={c.color}
              pending={qualifyingLoading && c.qualifying.a + c.qualifying.b === 0}
            />
            <SplitRow label="Race" a={c.race.a} b={c.race.b} color={c.color} />
            <SplitRow label="Points" a={c.a.points} b={c.b.points} color={c.color} />
          </div>
        </section>
      ))}
    </div>
  );
}
