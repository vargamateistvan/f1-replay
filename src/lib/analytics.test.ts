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

    expect(gtag).toHaveBeenCalledWith("event", "page_view", {
      app_version: "1.2.3",
      page_location: "https://f1replay.app/",
      page_path: "/telemetry",
      page_title: "F1 Replay",
    });
  });

  it("adds app_version to custom events without overwriting explicit params", async () => {
    const gtag = vi.fn();
    window.gtag = gtag;
    const { trackEvent } = await importFreshAnalytics();

    trackEvent("nav_click", {
      app_version: "custom",
      destination: "/settings",
    });

    expect(gtag).toHaveBeenCalledWith("event", "nav_click", {
      app_version: "custom",
      destination: "/settings",
    });
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
