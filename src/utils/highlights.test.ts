import { describe, expect, it } from "vitest";
import {
  isPreferredHighlight,
  matchHighlightSession,
  normalizeEventName,
  parseHighlightTitle,
} from "./highlights";

const meetings = [
  { meeting_key: 1, meeting_name: "Mexico City Grand Prix", year: 2026 },
  { meeting_key: 2, meeting_name: "São Paulo Grand Prix", year: 2026 },
  { meeting_key: 3, meeting_name: "Mexico City Grand Prix", year: 2025 },
  { meeting_key: 4, meeting_name: "Chinese Grand Prix", year: 2023 },
];

const session = (session_key: number, meeting_key: number, session_name: string) => ({
  session_key,
  meeting_key,
  session_name,
  is_cancelled: false,
});

const sessions = [
  session(10, 1, "Practice 1"),
  session(11, 1, "Practice 2"),
  session(12, 1, "Qualifying"),
  session(13, 1, "Race"),
  session(20, 2, "Sprint Qualifying"),
  session(21, 2, "Sprint"),
  session(22, 2, "Race"),
  session(30, 3, "Race"),
  session(40, 4, "Sprint Shootout"),
];

describe("parseHighlightTitle", () => {
  it("parses the channel's highlight titles", () => {
    expect(parseHighlightTitle("FP2 Highlights | 2026 Mexico City Grand Prix")).toEqual({
      kind: "fp2",
      year: 2026,
      eventName: "Mexico City Grand Prix",
    });
    expect(parseHighlightTitle("Race Highlights | 2026 United States Grand Prix")?.kind).toBe(
      "race",
    );
    expect(parseHighlightTitle("Sprint Qualifying Highlights | 2026 São Paulo Grand Prix")?.kind).toBe(
      "sprintQualifying",
    );
    expect(parseHighlightTitle("Sprint Shootout Highlights | 2023 Austrian Grand Prix")?.kind).toBe(
      "sprintQualifying",
    );
    expect(parseHighlightTitle("Extended Highlights | 2021 Mexico City Grand Prix")).toEqual({
      kind: "extended",
      year: 2021,
      eventName: "Mexico City Grand Prix",
    });
  });

  it("drops a trailing sponsor segment", () => {
    expect(
      parseHighlightTitle("Qualifying Highlights | 2026 Qatar Grand Prix | Sponsor")?.eventName,
    ).toBe("Qatar Grand Prix");
  });

  it("ignores videos that are not session highlights", () => {
    expect(parseHighlightTitle("Top 10 Onboards | 2026 United States Grand Prix | Qatar Airways")).toBeNull();
    expect(parseHighlightTitle("Drivers React After The Race | 2026 United States Grand Prix")).toBeNull();
    expect(parseHighlightTitle("Best Overtakes Highlights | 2026 Mexico City Grand Prix")).toBeNull();
    expect(parseHighlightTitle("Furstappen Spotted On Track After FP1! 🐶")).toBeNull();
  });
});

describe("normalizeEventName", () => {
  it("ignores accents, case and punctuation", () => {
    expect(normalizeEventName("São Paulo Grand Prix")).toBe(normalizeEventName("Sao Paulo grand prix"));
    expect(normalizeEventName("Emilia-Romagna Grand Prix")).toBe(
      normalizeEventName("Emilia Romagna Grand Prix"),
    );
  });
});

describe("matchHighlightSession", () => {
  const match = (title: string) =>
    matchHighlightSession(parseHighlightTitle(title)!, meetings, sessions);

  it("finds the session by event, year and session name", () => {
    expect(match("FP1 Highlights | 2026 Mexico City Grand Prix")).toBe(10);
    expect(match("Race Highlights | 2026 Mexico City Grand Prix")).toBe(13);
    expect(match("Race Highlights | 2025 Mexico City Grand Prix")).toBe(30);
    expect(match("Sprint Highlights | 2026 Sao Paulo Grand Prix")).toBe(21);
    expect(match("Sprint Qualifying Highlights | 2026 São Paulo Grand Prix")).toBe(20);
  });

  it("maps Sprint Shootout highlights onto 2023 sessions", () => {
    expect(match("Sprint Shootout Highlights | 2023 Chinese Grand Prix")).toBe(40);
  });

  it("returns null for unknown events, years or sessions", () => {
    expect(match("Race Highlights | 2026 Atlantis Grand Prix")).toBeNull();
    expect(match("Race Highlights | 2021 Mexico City Grand Prix")).toBeNull();
    expect(match("FP3 Highlights | 2026 Mexico City Grand Prix")).toBeNull();
  });

  it("skips cancelled sessions", () => {
    const cancelled = sessions.map((s) => (s.session_key === 13 ? { ...s, is_cancelled: true } : s));
    expect(
      matchHighlightSession(
        parseHighlightTitle("Race Highlights | 2026 Mexico City Grand Prix")!,
        meetings,
        cancelled,
      ),
    ).toBeNull();
  });
});

describe("isPreferredHighlight", () => {
  const race = {
    videoId: "a",
    title: "Race Highlights | 2026 Mexico City Grand Prix",
    publishedAt: "2026-11-01T22:00:00Z",
  };
  const extended = {
    videoId: "b",
    title: "Extended Highlights | 2026 Mexico City Grand Prix",
    publishedAt: "2026-11-01T21:00:00Z",
  };

  it("takes any highlight when there is none yet", () => {
    expect(isPreferredHighlight(race, undefined)).toBe(true);
  });

  it("prefers race highlights over extended highlights", () => {
    expect(isPreferredHighlight(race, extended)).toBe(true);
    expect(isPreferredHighlight(extended, race)).toBe(false);
  });

  it("keeps the original upload over a later re-upload", () => {
    const reupload = { ...race, videoId: "c", publishedAt: "2026-12-01T00:00:00Z" };
    expect(isPreferredHighlight(reupload, race)).toBe(false);
    expect(isPreferredHighlight(race, reupload)).toBe(true);
    expect(isPreferredHighlight(race, race)).toBe(false);
  });
});
