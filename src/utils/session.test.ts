import { describe, expect, it } from "vitest";
import type { RaceControl } from "@/api/types";
import {
  detectQualiPhase,
  qualiClockRemainingMs,
  sessionStartLabel,
} from "@/utils/session";

function rc(
  date: string,
  message: string,
  qualifyingPhase: number | null,
): RaceControl {
  return {
    category: "Other",
    date,
    driver_number: null,
    flag: null,
    lap_number: null,
    meeting_key: 1,
    message,
    qualifying_phase: qualifyingPhase,
    scope: null,
    sector: null,
    session_key: 1,
  };
}

describe("detectQualiPhase", () => {
  const sessionStart = new Date("2026-01-01T12:00:00Z").getTime();

  it("uses qualifying_phase even when messages are out of order", () => {
    const messages: RaceControl[] = [
      rc("2026-01-01T12:20:00Z", "Q3 PERIOD STARTED", 3),
      rc("2026-01-01T12:10:00Z", "Q2 PERIOD STARTED", 2),
      rc("2026-01-01T12:00:00Z", "Q1 PERIOD STARTED", 1),
    ];

    expect(detectQualiPhase(messages, sessionStart, 9 * 60_000)).toBe("Q1");
    expect(detectQualiPhase(messages, sessionStart, 15 * 60_000)).toBe("Q2");
    expect(detectQualiPhase(messages, sessionStart, 25 * 60_000)).toBe("Q3");
  });

  it("falls back to message parsing when qualifying_phase is missing", () => {
    const messages: RaceControl[] = [
      rc("2026-01-01T12:00:00Z", "Q1 PERIOD STARTED", null),
      rc("2026-01-01T12:10:00Z", "Q2 PERIOD STARTED", null),
      rc("2026-01-01T12:20:00Z", "Q3 GREEN LIGHT", null),
    ];

    expect(detectQualiPhase(messages, sessionStart, 30 * 60_000)).toBe("Q3");
  });
});

describe("qualiClockRemainingMs", () => {
  const start = new Date("2024-11-02T10:30:00Z").getTime();
  const at = (hms: string) => new Date(`2024-11-02T${hms}Z`).getTime() - start;
  const status = (hms: string, message: string, phase: number | null) => ({
    ...rc(`2024-11-02T${hms}Z`, message, phase),
    category: "SessionStatus",
  });
  const MIN = 60_000;

  // São Paulo 2024 qualifying (red flags in every phase).
  const brazil: RaceControl[] = [
    status("10:30:00", "SESSION STARTED", 1),
    status("10:39:10", "SESSION ABORTED", 1),
    status("10:47:00", "SESSION STARTED", 1),
    status("10:55:50", "SESSION FINISHED", 1),
    status("11:03:00", "SESSION STARTED", 2),
    status("11:12:09", "SESSION ABORTED", 2),
    status("11:20:00", "SESSION STARTED", 2),
    status("11:25:05", "SESSION ABORTED", 2),
    status("11:27:21", "SESSION FINISHED", 2),
    status("11:37:00", "SESSION STARTED", 3),
    status("11:42:01", "SESSION ABORTED", 3),
  ];

  it("counts down Q1 from 18 minutes and freezes under a red flag", () => {
    expect(qualiClockRemainingMs(brazil, start, 0, "Qualifying")).toBe(
      18 * MIN,
    );
    expect(qualiClockRemainingMs(brazil, start, 5 * MIN, "Qualifying")).toBe(
      13 * MIN,
    );
    const atRed = 18 * MIN - (9 * MIN + 10_000);
    expect(
      qualiClockRemainingMs(brazil, start, at("10:39:10"), "Qualifying"),
    ).toBe(atRed);
    expect(
      qualiClockRemainingMs(brazil, start, at("10:45:00"), "Qualifying"),
    ).toBe(atRed);
    expect(
      qualiClockRemainingMs(brazil, start, at("10:50:00"), "Qualifying"),
    ).toBe(atRed - 3 * MIN);
  });

  it("reads zero in the break between phases, then starts the next phase", () => {
    expect(
      qualiClockRemainingMs(brazil, start, at("10:58:00"), "Qualifying"),
    ).toBe(0);
    expect(
      qualiClockRemainingMs(brazil, start, at("11:05:00"), "Qualifying"),
    ).toBe(13 * MIN);
    expect(
      qualiClockRemainingMs(brazil, start, at("11:30:00"), "Qualifying"),
    ).toBe(0);
    expect(
      qualiClockRemainingMs(brazil, start, at("11:40:00"), "Qualifying"),
    ).toBe(9 * MIN);
    expect(
      qualiClockRemainingMs(brazil, start, at("11:50:00"), "Qualifying"),
    ).toBe(12 * MIN - (5 * MIN + 1_000));
  });

  it("infers phases from SESSION FINISHED when qualifying_phase is missing", () => {
    const untagged = brazil.map((m) => ({ ...m, qualifying_phase: null }));
    expect(
      qualiClockRemainingMs(untagged, start, at("11:05:00"), "Qualifying"),
    ).toBe(13 * MIN);
  });

  it("uses sprint qualifying phase lengths", () => {
    expect(
      qualiClockRemainingMs(brazil, start, at("11:05:00"), "Sprint Qualifying"),
    ).toBe(8 * MIN);
  });

  it("returns null without session status messages", () => {
    expect(qualiClockRemainingMs([], start, 0, "Qualifying")).toBeNull();
  });

  describe("Singapore 2026 (late start, 13-minute Q3)", () => {
    const sgStart = new Date("2026-10-10T13:00:00Z").getTime();
    const sgAt = (hms: string) =>
      new Date(`2026-10-10T${hms}Z`).getTime() - sgStart;
    const sg = (hms: string, message: string, phase: number | null) => ({
      ...rc(`2026-10-10T${hms}Z`, message, phase),
      category: "SessionStatus",
    });
    const feed: RaceControl[] = [
      sg("13:30:00", "SESSION STARTED", null),
      sg("13:48:00", "SESSION FINISHED", null),
      sg("13:55:00", "SESSION STARTED", 2),
      sg("14:10:00", "SESSION FINISHED", 2),
      sg("14:17:00", "SESSION STARTED", 3),
      sg("14:30:00", "SESSION FINISHED", 3),
    ];
    const clock = (hms: string, rows = feed) =>
      qualiClockRemainingMs(rows, sgStart, sgAt(hms), "Qualifying");

    it("holds Q1 at 18:00 until the delayed start", () => {
      expect(clock("13:10:00")).toBe(18 * MIN);
      expect(clock("13:40:00")).toBe(8 * MIN);
      expect(clock("13:50:00")).toBe(0);
      expect(clock("14:00:00")).toBe(10 * MIN);
      expect(clock("14:12:00")).toBe(0);
    });

    it("runs Q3 for 13 minutes", () => {
      expect(clock("14:17:00")).toBe(13 * MIN);
      expect(clock("14:29:00")).toBe(MIN);
      expect(clock("14:29:00", feed.slice(0, 5))).toBe(MIN);
    });
  });
});

describe("sessionStartLabel", () => {
  it("names the opening chapter after the session", () => {
    expect(sessionStartLabel("Race")).toBe("Race Start");
    expect(sessionStartLabel(undefined)).toBe("Race Start");
    expect(sessionStartLabel("Sprint")).toBe("Sprint Start");
    expect(sessionStartLabel("Qualifying")).toBe("Qualifying Start");
    expect(sessionStartLabel("Sprint Qualifying")).toBe("Qualifying Start");
    expect(sessionStartLabel("Sprint Shootout")).toBe("Qualifying Start");
    expect(sessionStartLabel("Practice 2")).toBe("Practice Start");
  });
});
