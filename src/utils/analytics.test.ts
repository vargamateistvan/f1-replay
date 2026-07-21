import { beforeEach, describe, expect, it, vi } from "vitest";
import { trackAnalyticsEvent } from "@/utils/analytics";

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
});
