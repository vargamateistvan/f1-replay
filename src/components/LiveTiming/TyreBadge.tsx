import type { Stint } from "@/api/types";
import { COMPOUND_COLORS, COMPOUND_HARD_LIGHT_COLOR, COMPOUND_LETTERS } from "@/constants";
import { useSettings } from "@/stores/settings";

interface Props {
  stints: Stint[];
  driverNumber: number;
  currentLap: number | null;
  startCompound?: string | null;
}

type Compound = Stint["compound"];

function compoundColor(compound: Compound, lightMode: boolean): string {
  if (lightMode && compound === "HARD") return COMPOUND_HARD_LIGHT_COLOR;
  return COMPOUND_COLORS[compound] ?? COMPOUND_COLORS.UNKNOWN;
}

const RING_SIZE = {
  md: {
    box: "h-5 w-5 sm:h-6 sm:w-6",
    inset: "inset-[4px]",
    letter: "text-tiny sm:text-caption",
  },
  // Fits inside a 12–13px text line without growing it (toasts).
  sm: { box: "h-4 w-4", inset: "inset-[3px]", letter: "text-micro" },
};

export function CompoundRing({
  compound,
  size = "md",
}: {
  compound: Compound;
  size?: keyof typeof RING_SIZE;
}) {
  const sz = RING_SIZE[size];
  const lightMode = useSettings((s) => s.lightMode);
  const color = compoundColor(compound, lightMode);
  const letter = COMPOUND_LETTERS[compound] ?? COMPOUND_LETTERS.UNKNOWN;

  return (
    <span
      className={`relative inline-flex shrink-0 items-center justify-center ${sz.box}`}
    >
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
        className={`absolute ${sz.inset} rounded-full bg-track`}
        aria-hidden="true"
      />
      <span
        className={`relative ${sz.letter} font-black uppercase leading-none text-fg`}
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
  const lightMode = useSettings((s) => s.lightMode);
  const lap = currentLap ?? 0;
  const active = stints
    .filter((s) => s.driver_number === driverNumber)
    .find((s) => s.lap_start <= lap && lap <= (s.lap_end ?? 999));

  if (!active) return <span className="text-muted text-caption">—</span>;

  const age = lap - active.lap_start + (active.tyre_age_at_start ?? 0);
  const changed = startCompound && startCompound !== active.compound;

  return (
    <span
      className="flex w-full items-center justify-between"
      title={`${active.compound} · ${age} lap${age === 1 ? "" : "s"} old`}
    >
      <span
        className="font-mono text-caption font-black tabular-nums text-fg sm:text-small"
        style={{ color: lightMode ? undefined : compoundColor(active.compound, false) }}
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
