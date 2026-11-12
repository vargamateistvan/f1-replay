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
    expect(startedEvent(session, [row(0, "SESSION STARTED", null)], start + 1)).toBeNull();
    const race = { ...session, session_type: "Race", session_name: "Race" };
    expect(startedEvent(race, [row(0, "SESSION STARTED", null)], start + 1)?.kind).toBe("started");
    expect(startedEvent(race, [row(0, "RED FLAG", null), row(600_000, "SESSION STARTED", null)], start + 600_001)).toBeNull();
  });

  it("requires a final qualifying chequered flag and valid results after the scheduled end", () => {
    const results = [{ session_key: 10, driver_number: 1, position: 1 }];
    const drivers = [{ session_key: 10, driver_number: 1 }];
    const end = start + 60 * 60_000;
    expect(resultsEvent(session, [row(30 * 60_000, "CHEQUERED FLAG", 1)], results, drivers, end)).toBeNull();
    const q3 = [row(59 * 60_000, "CHEQUERED FLAG", 3)];
    expect(resultsEvent(session, q3, results, drivers, end)?.kind).toBe("results");
    expect(resultsEvent(session, q3, [], drivers, end)).toBeNull();
    expect(resultsEvent(session, q3, [{ ...results[0], session_key: 99 }], drivers, end)).toBeNull();
    expect(resultsEvent(session, q3, results, drivers, end + 24 * 60 * 60_000)).toBeNull();
    expect(resultsEvent(session, q3, results, [...drivers, { session_key: 10, driver_number: 2 }], end)).toBeNull();
    expect(resultsEvent(session, q3, [...results, results[0]], drivers, end)).toBeNull();
    expect(resultsEvent(session, [row(-1, "CHEQUERED FLAG", 3)], results, drivers, end)).toBeNull();
  });

  it("rejects duplicated, missing, or unrelated classification and driver entries", () => {
    const end = start + 60 * 60_000;
    const flags = [row(59 * 60_000, "CHEQUERED FLAG", 3)];
    const drivers = [
      { session_key: 10, driver_number: 1 },
      { session_key: 10, driver_number: 2 },
    ];
    const results = [
      { session_key: 10, driver_number: 1, position: 1 },
      { session_key: 10, driver_number: 2, position: 2 },
    ];
    expect(resultsEvent(session, flags, results, drivers, end)?.kind).toBe("results");
    expect(resultsEvent(session, flags, [results[0]], drivers, end)).toBeNull();
    expect(resultsEvent(session, flags, [results[0], { ...results[1], position: 1 }], drivers, end)).toBeNull();
    expect(resultsEvent(session, flags, [results[0], { ...results[1], driver_number: 3 }], drivers, end)).toBeNull();
    expect(resultsEvent(session, flags, [{ ...results[0], position: null }, results[1]], drivers, end)).toBeNull();
    expect(resultsEvent(session, flags, results, [drivers[0], drivers[0]], end)).toBeNull();
    expect(resultsEvent(session, flags, results, [drivers[0], { ...drivers[1], session_key: 11 }], end)).toBeNull();
  });

  it("recognizes Singapore 2023 qualifying timing messages", () => {
    // OpenF1 session 9161: Q1 at 13:00, Q2 at 13:53, Q3 flag at 14:28 UTC.
    const qStart = Date.parse("2023-09-16T13:00:00Z");
    const qualifying: PushSession = {
      ...session, session_key: 9161, date_start: new Date(qStart).toISOString(),
      date_end: "2023-09-16T14:00:00Z",
    };
    const messages = [
      { date: "2023-09-16T13:00:00.278Z", message: "SESSION STARTED", qualifying_phase: 1 },
      { date: "2023-09-16T13:18:00Z", message: "CHEQUERED FLAG", qualifying_phase: 1 },
      { date: "2023-09-16T13:53:00.300Z", message: "SESSION STARTED", qualifying_phase: 2 },
      { date: "2023-09-16T14:16:00.292Z", message: "SESSION STARTED", qualifying_phase: 3 },
      { date: "2023-09-16T14:28:01Z", message: "CHEQUERED FLAG", qualifying_phase: 3 },
    ];
    expect(startedEvent(qualifying, messages, qStart + 60_000)?.kind).toBe("started");
    expect(startedEvent(qualifying, messages, Date.parse("2023-09-16T13:54:00Z"))).toBeNull();
    const drivers = [{ session_key: 9161, driver_number: 55 }];
    const results = [{ ...drivers[0], position: 1 }];
    expect(resultsEvent(qualifying, messages, results, drivers, Date.parse("2023-09-16T14:29:00Z"))?.kind).toBe("results");
  });

  it("recognizes Singapore 2023 practice and race starts and chequered flags", () => {
    // OpenF1 sessions 9158 and 9165.
    for (const sample of [
      { key: 9158, type: "Practice", name: "Practice 1", start: "2023-09-15T09:30:00Z", end: "2023-09-15T10:30:00Z", actual: "2023-09-15T09:30:00.281Z", flag: "2023-09-15T10:30:00Z" },
      { key: 9165, type: "Race", name: "Race", start: "2023-09-17T12:00:00Z", end: "2023-09-17T14:00:00Z", actual: "2023-09-17T12:03:44.658Z", flag: "2023-09-17T13:50:26Z" },
    ]) {
      const current: PushSession = {
        ...session, session_key: sample.key, session_type: sample.type,
        session_name: sample.name, date_start: sample.start, date_end: sample.end,
      };
      const messages = [
        { date: sample.actual, message: "SESSION STARTED", qualifying_phase: null },
        { date: sample.flag, message: "CHEQUERED FLAG", qualifying_phase: null },
      ];
      const drivers = [{ session_key: sample.key, driver_number: 1 }];
      const results = [{ ...drivers[0], position: 1 }];
      expect(startedEvent(current, messages, Date.parse(sample.actual) + 60_000)?.kind).toBe("started");
      expect(resultsEvent(current, messages, results, drivers, Date.parse(sample.end))?.kind).toBe("results");
    }
  });
});
