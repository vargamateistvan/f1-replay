import type { CircuitLayout } from "@/data/circuits";

/**
 * Stroke props that restrict a full-track path to one timing sector: the
 * layout's sector clip rectangle when it has one, otherwise an equal-thirds
 * dash along the path.
 */
export function sectorStrokeProps(
  sectorNum: 1 | 2 | 3,
  circuitLayout: CircuitLayout | null,
):
  | { clipPath: string }
  | { pathLength: number; strokeDasharray: string; strokeDashoffset: number } {
  const hasClip = circuitLayout?.sectors.some((s) => s.number === sectorNum);
  return hasClip
    ? { clipPath: `url(#track-sector-clip-${sectorNum})` }
    : {
        pathLength: 300,
        strokeDasharray: "100 200",
        strokeDashoffset: -(sectorNum - 1) * 100,
      };
}
