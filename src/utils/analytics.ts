type AnalyticsPrimitive = string | number | boolean;

type AnalyticsParams = Record<string, AnalyticsPrimitive | null | undefined>;

type GtagFn = (
  command: "event",
  eventName: string,
  params?: Record<string, AnalyticsPrimitive>,
) => void;

const TELEMETRY_SHARE_PARAMS = new Set([
  "meeting",
  "session",
  "a",
  "b",
  "c",
  "la",
  "lb",
  "lc",
  "lap",
  "smooth",
  "card",
]);

const RACEWEEKEND_STATE_PARAMS = new Set([
  "meeting",
  "session",
  "t",
  "speed",
  "view",
  "ttab",
  "ctab",
  "cmode",
  "focus",
  "compare",
]);

const STANDINGS_STATE_PARAMS = new Set(["year", "tab"]);

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

function getRouteSurface(pathname: string) {
  if (pathname === "/") return "raceweekend";
  if (pathname === "/telemetry") return "telemetry";
  if (pathname === "/standings") return "standings";
  if (pathname === "/settings") return "settings";
  if (pathname === "/privacy") return "privacy";
  if (pathname === "/terms") return "terms";
  return "other";
}

function getDeepLinkKind(pathname: string, searchParams: URLSearchParams) {
  if ([...searchParams.keys()].length === 0) return null;

  if (pathname === "/") {
    if (searchParams.has("t")) return "replay_timestamp";
    if ([...RACEWEEKEND_STATE_PARAMS].some((key) => searchParams.has(key))) {
      return "raceweekend_state";
    }
  }

  if (
    pathname === "/telemetry" &&
    [...TELEMETRY_SHARE_PARAMS].some((key) => searchParams.has(key))
  ) {
    return "telemetry_state";
  }

  if (
    pathname === "/standings" &&
    [...STANDINGS_STATE_PARAMS].some((key) => searchParams.has(key))
  ) {
    return "standings_state";
  }

  return "query_state";
}

export function getPageViewAnalyticsParams(
  pathname: string,
  search: string,
  navigationType?: string,
) {
  const searchParams = new URLSearchParams(search);
  const deepLinkKind = getDeepLinkKind(pathname, searchParams);

  return compactParams({
    page_path: pathname,
    route_surface: getRouteSurface(pathname),
    navigation_type: navigationType?.toLowerCase(),
    has_query_params: [...searchParams.keys()].length > 0,
    deep_link_kind: deepLinkKind,
    is_deep_link: deepLinkKind !== null,
  });
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

export function trackPageView(
  pathname: string,
  search: string,
  navigationType?: string,
) {
  return trackAnalyticsEvent(
    "app_page_view",
    getPageViewAnalyticsParams(pathname, search, navigationType),
  );
}
