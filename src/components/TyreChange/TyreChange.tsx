import { CompoundRing } from "@/components/LiveTiming/TyreBadge";
import type { PitTyre } from "@/timeline/events";

const COMPOUND_NAME: Record<PitTyre["compound"], string> = {
  SOFT: "Soft",
  MEDIUM: "Medium",
  HARD: "Hard",
  INTERMEDIATE: "Intermediate",
  WET: "Wet",
  UNKNOWN: "Unknown",
};

function describe(tyre: PitTyre, side: "off" | "on"): string {
  const name = COMPOUND_NAME[tyre.compound] ?? tyre.compound;
  if (side === "on")
    return tyre.age === 0 ? `New ${name}` : `Used ${name} (${tyre.age} laps)`;
  return `${name} after ${tyre.age} lap${tyre.age === 1 ? "" : "s"}`;
}

/**
 * Old compound + laps run → new compound + NEW / used age. Renders nothing without data.
 * `compact` fits inside an existing text line (small rings, no "L" suffix).
 */
export function TyreChange({
  off,
  on,
  compact = false,
}: Readonly<{
  off?: PitTyre | null;
  on?: PitTyre | null;
  compact?: boolean;
}>) {
  const ring = compact ? "sm" : "md";
  const laps = (n: number) => (compact ? `${n}` : `${n}L`);
  if (!off && !on) return null;
  const label = [
    off && `Off: ${describe(off, "off")}`,
    on && `On: ${describe(on, "on")}`,
  ]
    .filter(Boolean)
    .join(" · ");

  return (
    <span
      className={`inline-flex shrink-0 items-center font-mono text-caption leading-none tabular-nums ${compact ? "gap-0.5" : "gap-1"}`}
      title={label}
      aria-label={label}
      role="img"
    >
      {off && (
        <>
          <CompoundRing compound={off.compound} size={ring} />
          <span className="text-muted">{laps(off.age)}</span>
        </>
      )}
      {off && on && (
        <span className="text-muted" aria-hidden="true">
          →
        </span>
      )}
      {on && (
        <>
          <CompoundRing compound={on.compound} size={ring} />
          <span
            className={
              on.age === 0 ? "font-bold text-fg" : "text-fg/70"
            }
          >
            {on.age === 0 ? "NEW" : laps(on.age)}
          </span>
        </>
      )}
    </span>
  );
}
