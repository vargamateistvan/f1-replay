import { minisectorClass } from "./sectorColors";

export type SectorTier = "fastest" | "personal" | "normal" | "none";

interface Props {
  tier: SectorTier;
  segments?: readonly number[] | null;
  showMinisectors?: boolean;
  widthClass?: string;
  title?: string;
}

// Coloured rectangle matching F1.com sector-status encoding:
//   fastest  = purple (session best)
//   personal = green (driver personal best)
//   normal   = yellow (slower than the driver's personal best)
//   none     = empty  (not yet set)
const TIER_CLASS: Record<SectorTier, string> = {
  fastest: "bg-purple",
  personal: "bg-green",
  normal: "bg-yellow",
  none: "bg-panel",
};

export function SectorBar({
  tier,
  segments,
  showMinisectors = true,
  widthClass = "w-7",
  title,
}: Props) {
  if (showMinisectors && segments && segments.length > 0) {
    return (
      <div
        title={title}
        className={`${widthClass} shrink-0 flex flex-col gap-[2px]`}
      >
        <span className={`block h-[7px] ${TIER_CLASS[tier]}`} />
        <span className="block h-[4px] rounded-sm overflow-hidden flex items-stretch gap-px">
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
      className={`${widthClass} h-[7px] shrink-0 ${TIER_CLASS[tier]}`}
    />
  );
}
