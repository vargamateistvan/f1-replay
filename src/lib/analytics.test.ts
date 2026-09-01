import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

async function importFreshAnalytics() {
  vi.resetModules();
  return import("./analytics");
}

describe("analytics", () => {
  const originalLocation = globalThis.location;

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
        page_location: "https://f1replay.app/",
        page_path: "/telemetry",
        page_title: "F1 Replay",
        screen_class: "desktop",
        viewport_height: 900,
        viewport_width: 1440,
      }),
    );
  });

  it("adds app_version to custom events without overwriting explicit params", async () => {
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
        page_path: "/",
        screen_class: "desktop",
        viewport_height: 900,
        viewport_width: 1440,
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

  it("skips tracking outside production", async () => {
    vi.stubEnv("PROD", false);
    const gtag = vi.fn();
    window.gtag = gtag;
    const { trackEvent } = await importFreshAnalytics();

    trackEvent("nav_click", { destination: "/settings" });

    expect(gtag).not.toHaveBeenCalled();
  });
});
