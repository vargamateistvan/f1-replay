// Minisector codes (OpenF1 `segments_sector_*`): 2048 yellow, 2049 green,
// 2051 purple, 2064 pit lane, 0 not available.
export function minisectorClass(code: number): string {
  if (code === 2051) return "bg-purple";
  if (code === 2048) return "bg-yellow";
  if (code === 2049) return "bg-green";
  if (code === 2064) return "bg-blue";
  if (code === 0) return "bg-panel";
  return "bg-faint";
}
