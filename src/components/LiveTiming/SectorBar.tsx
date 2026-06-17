export type SectorTier = "fastest" | "personal" | "fast" | "normal" | "none";

interface Props {
  tier: SectorTier;
  segments?: readonly number[] | null;
  showMinisectors?: boolean;
  widthClass?: string;
  title?: string;
}

// Coloured rectangle matching F1.com sector-status encoding:
//   fastest  = purple (session best)
//   personal = yellow (driver personal best)
//   fast     = green  (within threshold of best but not best)
//   normal   = dim    (set but unimpressive)
//   none     = empty  (not yet set)
function minisectorClass(code: number): string {
  // OpenF1 minisector state IDs can vary by session feed. Map common families
  // to tower-friendly colours, and fallback to neutral for unknown codes.
  if (code >= 2064) return "bg-[#9b59f5]";
  if (code === 2051) return "bg-[#f5d400]";
  if (code >= 2049) return "bg-[#39b54a]";
  if (code > 0) return "bg-white/35";
  return "bg-panel";
}

export function SectorBar({
  tier,
  segments,
  showMinisectors = true,
  widthClass = "w-7",
  title,
}: Props) {
  const colour: Record<SectorTier, string> = {
    fastest: "bg-[#9b59f5]",
    personal: "bg-[#f5d400]",
    fast: "bg-[#39b54a]",
    normal: "bg-white/30",
    none: "bg-panel",
  };

  if (showMinisectors && segments && segments.length > 0) {
    return (
      <div
        title={title}
        className={`${widthClass} shrink-0 flex flex-col gap-[2px]`}
      >
        <span className={`block h-[7px] ${colour[tier]}`} />
        <span className="block h-[4px] rounded-[1px] overflow-hidden flex items-stretch gap-px">
          {segments.map((code, idx) => (
            <span
              key={`${idx}-${code}`}
              className={`h-full flex-1 ${minisectorClass(code)}`}
            />
          ))}
        </span>
      </div>
    );
  }

  return (
    <div
      title={title}
      className={`${widthClass} h-[7px] shrink-0 ${colour[tier]}`}
    />
  );
}
