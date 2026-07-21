import { describe, expect, it } from "vitest";
import { buildShareUrl } from "@/utils/share";

describe("buildShareUrl", () => {
  it("keeps only allowed search params in the shared url", () => {
    const url = buildShareUrl({
      currentUrl:
        "https://f1replay.app/telemetry?meeting=1&session=2&a=16&lb=22&smooth=1&utm_source=x&foo=bar",
      allowedSearchParams: ["meeting", "session", "a", "lb", "smooth"],
    });

    const parsed = new URL(url);

    expect(parsed.searchParams.get("meeting")).toBe("1");
    expect(parsed.searchParams.get("session")).toBe("2");
    expect(parsed.searchParams.get("a")).toBe("16");
    expect(parsed.searchParams.get("lb")).toBe("22");
    expect(parsed.searchParams.get("smooth")).toBe("1");
    expect(parsed.searchParams.get("utm_source")).toBeNull();
    expect(parsed.searchParams.get("foo")).toBeNull();
  });
});
