import type { Stint } from "@/api/types";

interface Props {
  stints: Stint[];
  driverNumber: number;
  currentLap: number | null;
  startCompound?: string | null;
}

type Compound = Stint["compound"];

const COMPOUND_STYLE: Record<
  Compound,
  { color: string; letter: string; letterColor: string }
> = {
  SOFT: { color: "#ff3b30", letter: "S", letterColor: "#ffffff" },
  MEDIUM: { color: "#ffd400", letter: "M", letterColor: "#ffffff" },
  HARD: { color: "#f2f2f2", letter: "H", letterColor: "#111111" },
  INTERMEDIATE: { color: "#39d743", letter: "I", letterColor: "#ffffff" },
  WET: { color: "#39a3ff", letter: "W", letterColor: "#ffffff" },
  UNKNOWN: { color: "#7b7b82", letter: "?", letterColor: "#ffffff" },
};

function CompoundRing({ compound }: { compound: Compound }) {
  const { color, letter, letterColor } =
    COMPOUND_STYLE[compound] ?? COMPOUND_STYLE.UNKNOWN;

  return (
    <span className="relative inline-flex h-5 w-5 shrink-0 items-center justify-center sm:h-6 sm:w-6">
      <svg viewBox="0 0 24 24" className="absolute inset-0" aria-hidden="true">
        <circle
          cx="12"
          cy="12"
          r="8.5"
          fill="none"
          stroke={color}
          strokeWidth="3"
          strokeLinecap="round"
        />
      </svg>
      <span
        className="relative text-[9px] font-black uppercase leading-none sm:text-[10px]"
        style={{ color: letterColor }}
      >
        {letter}
      </span>
    </span>
  );
}

export function TyreBadge({
  stints,
  driverNumber,
  currentLap,
  startCompound,
}: Props) {
  const lap = currentLap ?? 0;
  const active = stints
    .filter((s) => s.driver_number === driverNumber)
    .find((s) => s.lap_start <= lap && lap <= (s.lap_end ?? 999));

  if (!active) return <span className="text-muted text-[10px]">—</span>;

  const age = lap - active.lap_start + (active.tyre_age_at_start ?? 0);
  const changed = startCompound && startCompound !== active.compound;
  const activeStyle = COMPOUND_STYLE[active.compound] ?? COMPOUND_STYLE.UNKNOWN;

  return (
    <span
      className="flex w-full items-center justify-between"
      title={`${active.compound} · ${age} lap${age === 1 ? "" : "s"} old`}
    >
      <span
        className="font-mono text-[10px] font-black tabular-nums sm:text-[11px]"
        style={{ color: activeStyle.color }}
      >
        {age}
      </span>
      <CompoundRing compound={active.compound} />
      {changed && (
        <span className="sr-only">Starting compound was {startCompound}</span>
      )}
    </span>
  );
}
