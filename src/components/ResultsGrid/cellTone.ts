import type { GridCell } from "@/utils/championship";

type Status = Exclude<GridCell["status"], "finished">;

// Non-classified results share F1 red, getting stronger from DNS to DSQ.
export const STATUS_TONE: Record<Status, string> = {
  dns: "text-f1red/60 font-bold",
  dnf: "bg-f1red/10 text-f1red font-bold",
  dsq: "bg-f1red text-white font-bold",
};

// Podiums keep their medal colours; everything else uses the app palette
// (panel tiles, muted text, F1 red) so the grid matches the standings tables.
export function cellTone(cell: GridCell | null): string {
  if (!cell) return "text-muted/40";
  if (cell.status !== "finished") return STATUS_TONE[cell.status];
  if (cell.position === 1) return "bg-podium-gold text-black font-black";
  if (cell.position === 2) return "bg-podium-silver text-black font-bold";
  if (cell.position === 3) return "bg-podium-bronze text-black font-bold";
  if (cell.points > 0) return "bg-panel text-fg font-bold";
  return "text-muted";
}
