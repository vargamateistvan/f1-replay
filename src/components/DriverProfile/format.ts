import type { GridCell } from "@/utils/championship";

export function fmt(value: number | null, digits = 1): string {
  if (value === null) return "–";
  return Number.isInteger(value) ? String(value) : value.toFixed(digits);
}

const STATUS_TEXT: Record<Exclude<GridCell["status"], "finished">, string> = {
  dnf: "DNF",
  dns: "DNS",
  dsq: "DSQ",
};

export function finishText(cell: GridCell): string {
  return cell.status === "finished" ? `P${cell.position}` : STATUS_TEXT[cell.status];
}
