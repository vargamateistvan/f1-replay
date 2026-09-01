import { appVersion } from "@/lib/appVersion";

type EventParams = Record<string, string | number | boolean | undefined>;
type GtagCommand = "js" | "config" | "event";
type EngagementEndReason = "navigate" | "hidden" | "pagehide" | "unmount";

type Gtag = (
  command: GtagCommand,
  target: string | Date,
  params?: EventParams,
) => void;

declare global {
  interface Window {
    dataLayer: unknown[];
    gtag?: Gtag;
  }
}

const GA_MEASUREMENT_ID =
  import.meta.env.VITE_GA_MEASUREMENT_ID?.trim() || "G-R9T6QJHL5X";

let initialized = false;

function routeNameForPath(pathname: string): string {
  if (pathname === "/") return "raceweekend";
  if (pathname === "/telemetry") return "telemetry";
  if (pathname === "/standings") return "standings";
  if (pathname === "/settings") return "settings";
  if (pathname === "/privacy") return "privacy";
  if (pathname === "/terms") return "terms";
  return "unknown";
}

function parseNumericParam(
  searchParams: URLSearchParams,
  key: string,
): number | undefined {
  const raw = searchParams.get(key);
  if (!raw) return undefined;
  const parsed = Number(raw);
  return Number.isFinite(parsed) ? parsed : undefined;
}

function isLocalhostHost(hostname: string): boolean {
  return (
    hostname === "localhost" ||
    hostname === "127.0.0.1" ||
    hostname === "[::1]"
  );
}

function shouldTrackAnalytics(): boolean {
  return (
    GA_MEASUREMENT_ID.length > 0 &&
    typeof window !== "undefined" &&
    import.meta.env.PROD &&
    !isLocalhostHost(window.location.hostname)
  );
}

function screenClassForWidth(width: number): "mobile" | "tablet" | "desktop" {
  if (width < 768) return "mobile";
  if (width < 1024) return "tablet";
  return "desktop";
}

function referrerHost(): string | undefined {
  if (typeof document === "undefined" || !document.referrer) return undefined;
  try {
    return new URL(document.referrer).host;
  } catch {
    return document.referrer;
  }
}

function buildCommonEventParams(): EventParams {
  if (typeof window === "undefined") {
    return {
      app_version: appVersion ?? undefined,
    };
  }

  const searchParams = new URLSearchParams(window.location.search);

  return {
    app_version: appVersion ?? undefined,
    language: globalThis.navigator?.language,
    page_path: `${window.location.pathname}${window.location.search}${window.location.hash}`,
    route_name: routeNameForPath(window.location.pathname),
    season_year: parseNumericParam(searchParams, "year"),
    meeting_key: parseNumericParam(searchParams, "meeting"),
    session_key: parseNumericParam(searchParams, "session"),
    screen_class: screenClassForWidth(window.innerWidth),
    selected_view: searchParams.get("view") ?? undefined,
    viewport_height: window.innerHeight,
    viewport_width: window.innerWidth,
  };
}

export function initializeAnalytics(): void {
  if (initialized || !shouldTrackAnalytics() || typeof window === "undefined")
    return;
  initialized = true;
  window.gtag?.("event", "app_session_started", {
    ...buildCommonEventParams(),
    landing_path: `${window.location.pathname}${window.location.search}${window.location.hash}`,
    referrer_host: referrerHost(),
  });
}

export function trackPageView(path: string): void {
  if (!shouldTrackAnalytics()) return;
  window.gtag?.("event", "page_view", {
    ...buildCommonEventParams(),
    page_location: window.location.href,
    page_path: path,
    page_title: document.title,
  });
}

export function trackEvent(eventName: string, params: EventParams = {}): void {
  if (!shouldTrackAnalytics()) return;
  window.gtag?.("event", eventName, {
    ...buildCommonEventParams(),
    ...params,
  });
}

export function trackPageEngagement(
  path: string,
  durationMs: number,
  reason: EngagementEndReason,
): void {
  if (!shouldTrackAnalytics()) return;
  const engagementTimeMs = Math.round(durationMs);
  if (engagementTimeMs < 1_000) return;
  window.gtag?.("event", "page_engagement", {
    ...buildCommonEventParams(),
    engagement_time_msec: engagementTimeMs,
    exit_reason: reason,
    page_path: path,
  });
}

export function analyticsEnabled(): boolean {
  return shouldTrackAnalytics();
}
