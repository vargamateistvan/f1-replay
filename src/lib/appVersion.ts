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
