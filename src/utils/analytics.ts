type AnalyticsPrimitive = string | number | boolean;

type AnalyticsParams = Record<string, AnalyticsPrimitive | null | undefined>;

type GtagFn = (
  command: "event",
  eventName: string,
  params?: Record<string, AnalyticsPrimitive>,
) => void;

function getGtag(): GtagFn | null {
  if (typeof window === "undefined") return null;
  const maybeGtag = (window as Window & { gtag?: unknown }).gtag;
  return typeof maybeGtag === "function" ? (maybeGtag as GtagFn) : null;
}

function compactParams(params: AnalyticsParams) {
  return Object.fromEntries(
    Object.entries(params).filter(
      (entry): entry is [string, AnalyticsPrimitive] =>
        entry[1] !== undefined && entry[1] !== null,
    ),
  );
}

export function trackAnalyticsEvent(
  eventName: string,
  params: AnalyticsParams = {},
) {
  const gtag = getGtag();
  if (!gtag) return false;
  gtag("event", eventName, compactParams(params));
  return true;
}
