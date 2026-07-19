// OpenF1 interval fields are mixed-type: number, string tokens ("LAP", "PIT"),
// and stringified numeric gaps such as "+0.842".
export function parseIntervalSeconds(
  value: number | string | null,
): number | null {
  if (typeof value === "number") {
    return Number.isFinite(value) ? value : null;
  }
  if (typeof value !== "string") return null;

  const normalized = value.trim().replace(/^\+/, "");
  if (!normalized) return null;

  const parsed = Number(normalized);
  return Number.isFinite(parsed) ? parsed : null;
}
