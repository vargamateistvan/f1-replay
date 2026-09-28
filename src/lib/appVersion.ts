export function normalizeAppVersion(version: string | null | undefined) {
  const trimmed = version?.trim();
  return trimmed ? trimmed : null;
}

export function formatAppVersion(version: string | null | undefined) {
  const normalized = normalizeAppVersion(version);
  if (!normalized) return "dev";
  if (normalized.startsWith("v")) return normalized;
  return /^[0-9]/.test(normalized) ? `v${normalized}` : normalized;
}

export const appVersion = normalizeAppVersion(import.meta.env.VITE_APP_VERSION);
export const appVersionLabel = formatAppVersion(appVersion);

export const RELEASES_PAGE_URL =
  "https://github.com/vargamateistvan/f1-replay/releases";
export const LATEST_RELEASE_API_URL =
  "https://api.github.com/repos/vargamateistvan/f1-replay/releases/latest";

export type ReleaseDateStyle = "full" | "short";

export function formatReleaseDate(
  isoDate: string | null | undefined,
  style: ReleaseDateStyle = "full",
): string | null {
  if (!isoDate) return null;
  const date = new Date(isoDate);
  if (Number.isNaN(date.getTime())) return null;
  const options: Intl.DateTimeFormatOptions =
    style === "short"
      ? { month: "short", day: "numeric", year: "numeric", timeZone: "UTC" }
      : {
          month: "short",
          day: "numeric",
          year: "numeric",
          hour: "2-digit",
          minute: "2-digit",
          second: "2-digit",
          hour12: false,
          timeZoneName: "short",
          timeZone: "UTC",
        };
  return new Intl.DateTimeFormat(undefined, options).format(date);
}
