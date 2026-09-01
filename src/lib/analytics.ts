import { appVersion } from "@/lib/appVersion";

type EventParams = Record<string, string | number | boolean | undefined>;
type GtagCommand = "js" | "config" | "event";

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

function buildCommonEventParams(): EventParams {
  if (typeof window === "undefined") {
    return {
      app_version: appVersion ?? undefined,
    };
  }

  return {
    app_version: appVersion ?? undefined,
    language: globalThis.navigator?.language,
    page_path: `${window.location.pathname}${window.location.search}${window.location.hash}`,
    screen_class: screenClassForWidth(window.innerWidth),
    viewport_height: window.innerHeight,
    viewport_width: window.innerWidth,
  };
}

export function initializeAnalytics(): void {
  if (initialized || !shouldTrackAnalytics() || typeof window === "undefined")
    return;
  initialized = true;
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

export function analyticsEnabled(): boolean {
  return shouldTrackAnalytics();
}
