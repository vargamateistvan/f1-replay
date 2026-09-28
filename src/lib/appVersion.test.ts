import { describe, expect, it } from "vitest";
import {
  formatAppVersion,
  formatReleaseDate,
  normalizeAppVersion,
} from "@/lib/appVersion";

describe("appVersion", () => {
  it("formats release dates and rejects missing or invalid input", () => {
    expect(formatReleaseDate(null)).toBeNull();
    expect(formatReleaseDate("not-a-date")).toBeNull();

    const short = formatReleaseDate("2026-09-20T10:00:00Z", "short");
    expect(short).toContain("2026");
    expect(short).not.toMatch(/10:00/);

    expect(formatReleaseDate("2026-09-20T10:00:00Z")).toMatch(/10:00:00/);
  });

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
