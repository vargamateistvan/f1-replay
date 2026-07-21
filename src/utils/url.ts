export function toSafeExternalUrl(
  raw: string | null | undefined,
): string | null {
  if (typeof raw !== "string") return null;

  const trimmed = raw.trim();
  if (!trimmed) return null;

  const normalized = trimmed.startsWith("http://")
    ? `https://${trimmed.slice("http://".length)}`
    : trimmed;

  try {
    const parsed = new URL(normalized);
    if (parsed.protocol !== "https:" && parsed.protocol !== "http:") {
      return null;
    }
    if (!parsed.hostname) return null;
    return parsed.toString();
  } catch {
    return null;
  }
}
