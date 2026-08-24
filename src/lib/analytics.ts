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

export function initializeAnalytics(): void {
  if (initialized || !shouldTrackAnalytics() || typeof window === "undefined")
    return;
  initialized = true;
}

export function trackPageView(path: string): void {
  if (!shouldTrackAnalytics()) return;
  window.gtag?.("event", "page_view", {
    page_path: path,
    page_location: window.location.href,
    page_title: document.title,
  });
}

export function trackEvent(eventName: string, params: EventParams = {}): void {
  if (!shouldTrackAnalytics()) return;
  window.gtag?.("event", eventName, params);
}

export function analyticsEnabled(): boolean {
  return shouldTrackAnalytics();
}
