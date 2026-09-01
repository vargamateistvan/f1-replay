import { describe, expect, it } from "vitest";
import { formatAppVersion, normalizeAppVersion } from "@/lib/appVersion";

describe("appVersion", () => {
  it("normalizes blank versions to null", () => {
    expect(normalizeAppVersion(undefined)).toBeNull();
    expect(normalizeAppVersion("")).toBeNull();
    expect(normalizeAppVersion("   ")).toBeNull();
  });

  it("adds a v prefix for semantic versions", () => {
    expect(formatAppVersion("1.2.3")).toBe("v1.2.3");
    expect(formatAppVersion("v2.0.0")).toBe("v2.0.0");
  });

  it("falls back to a dev label when no build version is available", () => {
    expect(formatAppVersion(null)).toBe("dev");
  });
});
