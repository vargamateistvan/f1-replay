import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

async function importFreshAnalytics() {
  vi.resetModules();
  return import("./analytics");
}

describe("analytics", () => {
  const originalLocation = globalThis.location;
  const originalReferrer = document.referrer;

  beforeEach(() => {
    vi.unstubAllEnvs();
    vi.stubEnv("PROD", true);
    vi.stubEnv("VITE_GA_MEASUREMENT_ID", "G-TEST123");
    vi.stubEnv("VITE_APP_VERSION", "1.2.3");
    vi.stubGlobal("window", globalThis.window);
    Object.defineProperty(window, "innerWidth", {
      configurable: true,
      value: 1440,
    });
    Object.defineProperty(window, "innerHeight", {
      configurable: true,
      value: 900,
    });
    Object.defineProperty(globalThis, "location", {
      configurable: true,
      value: new URL("https://f1replay.app/"),
    });
    document.title = "F1 Replay";
  });

  afterEach(() => {
    vi.restoreAllMocks();
    vi.unstubAllEnvs();
    Object.defineProperty(globalThis, "location", {
      configurable: true,
      value: originalLocation,
    });
    Object.defineProperty(document, "referrer", {
      configurable: true,
      value: originalReferrer,
    });
    delete window.gtag;
  });

  it("adds app_version to page views", async () => {
    const gtag = vi.fn();
    window.gtag = gtag;
    const { trackPageView } = await importFreshAnalytics();

    trackPageView("/telemetry");

    expect(gtag).toHaveBeenCalledWith(
      "event",
      "page_view",
      expect.objectContaining({
        app_version: "1.2.3",
        language: expect.any(String),
        route_name: "raceweekend",
        page_location: "https://f1replay.app/",
        page_path: "/telemetry",
        page_title: "F1 Replay",
        selected_view: undefined,
        screen_class: "desktop",
        viewport_height: 900,
        viewport_width: 1440,
      }),
    );
  });

  it("adds app_version to custom events without overwriting explicit params", async () => {
    Object.defineProperty(globalThis, "location", {
      configurable: true,
      value: new URL(
        "https://f1replay.app/?year=2025&meeting=22&session=202&view=tracker",
      ),
    });
    const gtag = vi.fn();
    window.gtag = gtag;
    const { trackEvent } = await importFreshAnalytics();

    trackEvent("nav_click", {
      app_version: "custom",
      destination: "/settings",
    });

    expect(gtag).toHaveBeenCalledWith(
      "event",
      "nav_click",
      expect.objectContaining({
        app_version: "custom",
        destination: "/settings",
        meeting_key: 22,
        page_path: "/?year=2025&meeting=22&session=202&view=tracker",
        route_name: "raceweekend",
        screen_class: "desktop",
        season_year: 2025,
        selected_view: "tracker",
        session_key: 202,
        viewport_height: 900,
        viewport_width: 1440,
      }),
    );
  });

  it("tracks app session start with landing and referrer context", async () => {
    Object.defineProperty(document, "referrer", {
      configurable: true,
      value: "https://www.google.com/search?q=f1+replay",
    });
    const gtag = vi.fn();
    window.gtag = gtag;
    const { initializeAnalytics } = await importFreshAnalytics();

    initializeAnalytics();

    expect(gtag).toHaveBeenCalledWith(
      "config",
      "G-TEST123",
      expect.objectContaining({
        app_version: "1.2.3",
        send_page_view: false,
      }),
    );
    expect(gtag).toHaveBeenCalledWith(
      "event",
      "app_session_started",
      expect.objectContaining({
        landing_path: "/",
        referrer_host: "www.google.com",
        route_name: "raceweekend",
      }),
    );
  });

  it("classifies smaller viewports for event context", async () => {
    Object.defineProperty(window, "innerWidth", {
      configurable: true,
      value: 390,
    });
    const gtag = vi.fn();
    window.gtag = gtag;
    const { trackEvent } = await importFreshAnalytics();

    trackEvent("mobile_nav_opened");

    expect(gtag).toHaveBeenCalledWith(
      "event",
      "mobile_nav_opened",
      expect.objectContaining({
        screen_class: "mobile",
        viewport_width: 390,
      }),
    );
  });

  it("tracks page engagement for meaningful dwell time", async () => {
    const gtag = vi.fn();
    window.gtag = gtag;
    const { trackPageEngagement } = await importFreshAnalytics();

    trackPageEngagement("/telemetry", 12_345, "navigate");

    expect(gtag).toHaveBeenCalledWith(
      "event",
      "page_engagement",
      expect.objectContaining({
        engagement_time_msec: 12345,
        exit_reason: "navigate",
        page_path: "/telemetry",
      }),
    );
  });

  it("skips page engagement when dwell time is too short", async () => {
    const gtag = vi.fn();
    window.gtag = gtag;
    const { trackPageEngagement } = await importFreshAnalytics();

    trackPageEngagement("/telemetry", 250, "hidden");

    expect(gtag).not.toHaveBeenCalled();
  });

  it("skips tracking outside production", async () => {
    vi.stubEnv("PROD", false);
    const gtag = vi.fn();
    window.gtag = gtag;
    const { trackEvent } = await importFreshAnalytics();

    trackEvent("nav_click", { destination: "/settings" });

    expect(gtag).not.toHaveBeenCalled();
  });
});
