import { describe, expect, it } from "vitest";
import type { RaceControl } from "@/api/types";
import { detectQualiPhase } from "@/utils/session";

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
