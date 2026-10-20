import { describe, expect, it } from "vitest";
import { replayPath, roundReplayPath, toSafeExternalUrl } from "@/utils/url";

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

describe("replayPath", () => {
  it("opens the tracker on a session, optionally focused on a driver", () => {
    expect(replayPath({ year: 2024, meetingKey: 1229, sessionKey: 9472 })).toBe(
      "/?year=2024&meeting=1229&session=9472&view=tracker",
    );
    expect(
      replayPath({ year: 2024, meetingKey: 1229, sessionKey: 9472, focus: 4 }),
    ).toBe("/?year=2024&meeting=1229&session=9472&view=tracker&focus=4");
  });
});

describe("roundReplayPath", () => {
  it("needs a meeting key", () => {
    expect(roundReplayPath(2024, { sessionKey: 9472 })).toBeUndefined();
    expect(roundReplayPath(2024, { sessionKey: 9472, meetingKey: 1229 }, 1)).toBe(
      "/?year=2024&meeting=1229&session=9472&view=tracker&focus=1",
    );
  });
});
