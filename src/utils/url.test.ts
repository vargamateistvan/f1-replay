import { describe, expect, it } from "vitest";
import { toSafeExternalUrl } from "@/utils/url";

describe("toSafeExternalUrl", () => {
  it("returns null for empty and invalid values", () => {
    expect(toSafeExternalUrl("")).toBeNull();
    expect(toSafeExternalUrl("   ")).toBeNull();
    expect(toSafeExternalUrl(null)).toBeNull();
    expect(toSafeExternalUrl("javascript:alert(1)")).toBeNull();
    expect(toSafeExternalUrl("data:text/html,<p>x</p>")).toBeNull();
    expect(toSafeExternalUrl("/relative/path")).toBeNull();
  });

  it("preserves safe https urls", () => {
    expect(toSafeExternalUrl("https://example.com/image.png")).toBe(
      "https://example.com/image.png",
    );
  });

  it("upgrades http urls to https", () => {
    expect(toSafeExternalUrl("http://example.com/audio.mp3")).toBe(
      "https://example.com/audio.mp3",
    );
  });
});
