import type { Stint } from "@/api/types";

interface Props {
  stints: Stint[];
  driverNumber: number;
  currentLap: number | null;
  startCompound?: string | null;
}

type Compound = Stint["compound"];

const COMPOUND_STYLE: Record<Compound, { bg: string; letter: string }> = {
  SOFT: { bg: "#e8002d", letter: "S" },
  MEDIUM: { bg: "#f5a623", letter: "M" },
  HARD: { bg: "#e0e0e0", letter: "H" },
  INTERMEDIATE: { bg: "#39b54a", letter: "I" },
  WET: { bg: "#1e90ff", letter: "W" },
  UNKNOWN: { bg: "#555", letter: "?" },
};

function CompoundDot({ compound }: { compound: Compound }) {
  const { bg, letter } = COMPOUND_STYLE[compound] ?? COMPOUND_STYLE.UNKNOWN;
  return (
    <span
      className="flex h-4 w-4 shrink-0 items-center justify-center rounded-full text-[8px] font-black sm:h-5 sm:w-5 sm:text-[9px]"
      style={{
        backgroundColor: bg,
        color: compound === "HARD" ? "#000" : "#fff",
      }}
      title={compound}
    >
      {letter}
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

  return (
    <span
      className="flex items-center gap-0.5 sm:gap-1"
      title={`${active.compound} · ${age} lap${age === 1 ? "" : "s"} old`}
    >
      {changed && (
        <>
          <CompoundDot compound={startCompound as Compound} />
          <span className="text-[8px] text-muted/50 sm:text-[9px]">→</span>
        </>
      )}
      <CompoundDot compound={active.compound} />
      <span className="hidden rounded bg-panel px-1.5 py-0.5 text-[9px] font-black uppercase tracking-[0.08em] text-white/75 tabular-nums min-[430px]:inline-block">
        {age}L
      </span>
    </span>
  );
}
