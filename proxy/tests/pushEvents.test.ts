import { describe, expect, it } from "vitest";
import {
  pushSessionType, reminderEvent, resultsEvent, startedEvent, type PushSession,
} from "../src/pushEvents";

const start = Date.parse("2026-07-05T14:00:00Z");
const session: PushSession = {
  session_key: 10, meeting_key: 2, year: 2026, session_name: "Qualifying",
  session_type: "Qualifying", date_start: new Date(start).toISOString(),
  date_end: new Date(start + 60 * 60_000).toISOString(), is_cancelled: false,
};
const row = (offset: number, message: string, qualifying_phase: number | null) => ({
  date: new Date(start + offset).toISOString(), message, qualifying_phase,
});

describe("automatic notification event detection", () => {
  it("classifies sprint shootouts separately and ignores unknown sessions", () => {
    expect(pushSessionType({ session_type: "Qualifying", session_name: "Sprint Shootout" })).toBe("sprintQualifying");
    expect(pushSessionType({ session_type: "Testing", session_name: "Testing" })).toBeNull();
  });

  it("limits reminders to the exact two-minute post-threshold window", () => {
    expect(reminderEvent(session, start - 10 * 60_000 - 1)).toBeNull();
    expect(reminderEvent(session, start - 10 * 60_000)?.kind).toBe("reminder");
    expect(reminderEvent(session, start - 8 * 60_000)).toBeNull();
    expect(reminderEvent({ ...session, is_cancelled: true }, start - 9 * 60_000)).toBeNull();
  });

  it("uses the first start only, never Q2 or a later restart", () => {
    const rows = [row(0, "SESSION STARTED", 1), row(600_000, "SESSION STARTED", 2)];
    expect(startedEvent(session, rows, start + 60_000)?.kind).toBe("started");
    expect(startedEvent(session, rows, start + 600_000)).toBeNull();
    expect(startedEvent(session, [rows[1]], start + 600_000)).toBeNull();
    expect(startedEvent(session, [row(0, "SESSION STARTED", null), row(600_000, "SESSION STARTED", null)], start + 600_000)).toBeNull();
  });

  it("requires a final qualifying chequered flag and valid results after the scheduled end", () => {
    const results = [{ session_key: 10, driver_number: 1, position: 1 }];
    const end = start + 60 * 60_000;
    expect(resultsEvent(session, [row(30 * 60_000, "CHEQUERED FLAG", 1)], results, end)).toBeNull();
    const q3 = [row(59 * 60_000, "CHEQUERED FLAG", 3)];
    expect(resultsEvent(session, q3, results, end)?.kind).toBe("results");
    expect(resultsEvent(session, q3, [], end)).toBeNull();
    expect(resultsEvent(session, q3, [{ ...results[0], session_key: 99 }], end)).toBeNull();
    expect(resultsEvent(session, q3, results, end + 24 * 60 * 60_000)).toBeNull();
  });
});
