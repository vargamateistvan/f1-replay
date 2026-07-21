import { beforeEach, describe, expect, it, vi } from "vitest";
import {
  getPageViewAnalyticsParams,
  trackAnalyticsEvent,
  trackPageView,
} from "@/utils/analytics";

describe("trackAnalyticsEvent", () => {
  beforeEach(() => {
    delete (window as Window & { gtag?: unknown }).gtag;
  });

  it("returns false when gtag is unavailable", () => {
    expect(
      trackAnalyticsEvent("share_link_copied", { share_surface: "test" }),
    ).toBe(false);
  });

  it("sends compacted params to gtag when available", () => {
    const gtag = vi.fn();
    (window as Window & { gtag?: unknown }).gtag = gtag;

    expect(
      trackAnalyticsEvent("share_link_copied", {
        share_surface: "playback_bar",
        speed: 4,
        has_timestamp: true,
        ignored: undefined,
      }),
    ).toBe(true);

    expect(gtag).toHaveBeenCalledWith("event", "share_link_copied", {
      share_surface: "playback_bar",
      speed: 4,
      has_timestamp: true,
    });
  });

  it("classifies replay timestamp deep links", () => {
    expect(
      getPageViewAnalyticsParams("/", "?meeting=1&session=2&t=45", "POP"),
    ).toEqual({
      page_path: "/",
      route_surface: "raceweekend",
      navigation_type: "pop",
      has_query_params: true,
      deep_link_kind: "replay_timestamp",
      is_deep_link: true,
    });
  });

  it("tracks app page views through gtag", () => {
    const gtag = vi.fn();
    (window as Window & { gtag?: unknown }).gtag = gtag;

    expect(trackPageView("/telemetry", "?session=2&a=16&lb=22", "PUSH")).toBe(
      true,
    );

    expect(gtag).toHaveBeenCalledWith("event", "app_page_view", {
      page_path: "/telemetry",
      route_surface: "telemetry",
      navigation_type: "push",
      has_query_params: true,
      deep_link_kind: "telemetry_state",
      is_deep_link: true,
    });
  });
});
