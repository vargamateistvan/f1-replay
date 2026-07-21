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

const GA_MEASUREMENT_ID = import.meta.env.VITE_GA_MEASUREMENT_ID?.trim() ?? "";

let initialized = false;

function ensureDataLayer(): void {
  if (typeof window === "undefined") return;
  window.dataLayer = window.dataLayer || [];
}

function ensureGtagStub(): void {
  if (typeof window === "undefined") return;
  ensureDataLayer();
  if (!window.gtag) {
    window.gtag = function gtag(...args) {
      window.dataLayer.push(args);
    } as Gtag;
  }
}

function appendGtagScript(measurementId: string): void {
  if (typeof document === "undefined") return;
  const scriptId = "ga4-gtag-script";
  if (document.getElementById(scriptId)) return;

  const script = document.createElement("script");
  script.id = scriptId;
  script.async = true;
  script.src = `https://www.googletagmanager.com/gtag/js?id=${encodeURIComponent(measurementId)}`;
  document.head.appendChild(script);
}

export function initializeAnalytics(): void {
  if (initialized || !GA_MEASUREMENT_ID || typeof window === "undefined")
    return;

  ensureGtagStub();
  appendGtagScript(GA_MEASUREMENT_ID);
  window.gtag?.("js", new Date());
  window.gtag?.("config", GA_MEASUREMENT_ID, { send_page_view: false });
  initialized = true;
}

export function trackPageView(path: string): void {
  if (!GA_MEASUREMENT_ID || typeof window === "undefined") return;
  window.gtag?.("event", "page_view", {
    page_path: path,
    page_location: window.location.href,
    page_title: document.title,
  });
}

export function trackEvent(eventName: string, params: EventParams = {}): void {
  if (!GA_MEASUREMENT_ID || typeof window === "undefined") return;
  window.gtag?.("event", eventName, params);
}

export function analyticsEnabled(): boolean {
  return GA_MEASUREMENT_ID.length > 0;
}
