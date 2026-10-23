import { describe, expect, it } from "vitest";
import type { Meeting, Session } from "@/api/types";
import { LIVE_BUFFER_MS } from "@/constants";
import {
  buildSeasonSchedule,
  formatCountdown,
  isTestingMeeting,
  scheduleFocusRound,
  sessionStatus,
} from "./schedule";

const HOUR = 3_600_000;
const DAY = 24 * HOUR;
const T0 = Date.UTC(2026, 2, 1);
const iso = (ms: number) => new Date(ms).toISOString();

function meeting(key: number, name: string, startMs: number, extra: Partial<Meeting> = {}): Meeting {
  return {
    meeting_key: key,
    meeting_name: name,
    meeting_official_name: name,
    date_start: iso(startMs),
    date_end: iso(startMs + 3 * DAY),
    is_cancelled: false,
    year: 2026,
    gmt_offset: "00:00:00",
    ...extra,
  } as Meeting;
}

function session(
  key: number,
  meetingKey: number,
  type: Session["session_type"],
  startMs: number,
  extra: Partial<Session> = {},
): Session {
  return {
    session_key: key,
    meeting_key: meetingKey,
    session_name: type,
    session_type: type,
    date_start: iso(startMs),
    date_end: iso(startMs + HOUR),
    is_cancelled: false,
    year: 2026,
    gmt_offset: "00:00:00",
    ...extra,
  } as Session;
}

describe("isTestingMeeting", () => {
  it("matches pre-season testing only", () => {
    expect(isTestingMeeting({ meeting_name: "Pre-Season Testing" })).toBe(true);
    expect(isTestingMeeting({ meeting_name: "Bahrain Grand Prix" })).toBe(false);
  });
});

describe("sessionStatus", () => {
  const s = session(1, 1, "Race", T0);
  it("uses the live buffer on both sides", () => {
    expect(sessionStatus(s, T0 - LIVE_BUFFER_MS - 1)).toBe("upcoming");
    expect(sessionStatus(s, T0 - LIVE_BUFFER_MS)).toBe("live");
    expect(sessionStatus(s, T0 + HOUR + LIVE_BUFFER_MS)).toBe("live");
    expect(sessionStatus(s, T0 + HOUR + LIVE_BUFFER_MS + 1)).toBe("completed");
  });
  it("reports cancelled sessions", () => {
    expect(sessionStatus({ ...s, is_cancelled: true }, T0)).toBe("cancelled");
  });
});

describe("buildSeasonSchedule", () => {
  const meetings = [
    meeting(3, "Chinese Grand Prix", T0 + 14 * DAY),
    meeting(1, "Pre-Season Testing", T0 - 14 * DAY),
    meeting(2, "Australian Grand Prix", T0),
    meeting(4, "Imola Grand Prix", T0 + 21 * DAY, { is_cancelled: true }),
    meeting(5, "Japanese Grand Prix", T0 + 28 * DAY),
  ];
  const sessions = [
    session(21, 2, "Race", T0 + 2 * DAY),
    session(20, 2, "Practice", T0),
    session(30, 3, "Sprint", T0 + 15 * DAY),
    session(31, 3, "Race", T0 + 16 * DAY),
  ];

  it("orders by date, numbers championship rounds and skips testing/cancelled", () => {
    const { rounds, totalRounds } = buildSeasonSchedule(meetings, sessions, T0 - 30 * DAY);
    expect(rounds.map((r) => [r.meeting.meeting_key, r.round])).toEqual([
      [1, null],
      [2, 1],
      [3, 2],
      [4, null],
      [5, 3],
    ]);
    expect(totalRounds).toBe(3);
    expect(rounds[3].status).toBe("cancelled");
  });

  it("sorts sessions and flags sprint weekends", () => {
    const { rounds } = buildSeasonSchedule(meetings, sessions, T0);
    expect(rounds[1].sessions.map((s) => s.session.session_key)).toEqual([20, 21]);
    expect(rounds[1].isSprint).toBe(false);
    expect(rounds[2].isSprint).toBe(true);
  });

  it("treats a weekend between sessions as live and highlights it as next", () => {
    const { rounds, completedRounds } = buildSeasonSchedule(meetings, sessions, T0 + DAY);
    expect(rounds[0].status).toBe("completed");
    expect(rounds[1].status).toBe("live");
    expect(rounds.filter((r) => r.isNext).map((r) => r.meeting.meeting_key)).toEqual([2]);
    expect(completedRounds).toBe(0);
  });

  it("moves next to the first unfinished round", () => {
    const { rounds, completedRounds } = buildSeasonSchedule(meetings, sessions, T0 + 5 * DAY);
    expect(rounds[1].status).toBe("completed");
    expect(rounds.find((r) => r.isNext)?.meeting.meeting_key).toBe(3);
    expect(completedRounds).toBe(1);
  });

  it("falls back to meeting dates when sessions aren't published", () => {
    const { rounds } = buildSeasonSchedule(meetings, sessions, T0 + 29 * DAY);
    expect(rounds[4].sessions).toEqual([]);
    expect(rounds[4].status).toBe("live");
    expect(rounds[4].isNext).toBe(true);
  });
});

describe("formatCountdown", () => {
  it("shows the two largest units", () => {
    expect(formatCountdown(3 * DAY + 4 * HOUR + 59_000)).toBe("3d 4h");
    expect(formatCountdown(5 * HOUR + 12 * 60_000)).toBe("5h 12m");
    expect(formatCountdown(8 * 60_000 + 30_000)).toBe("8m");
    expect(formatCountdown(-1)).toBe("0m");
  });
});

describe("scheduleFocusRound", () => {
  const meetings = [
    meeting(1, "Pre-Season Testing", T0 - 14 * DAY),
    meeting(2, "Australian Grand Prix", T0),
    meeting(3, "Chinese Grand Prix", T0 + 14 * DAY),
    meeting(4, "Imola Grand Prix", T0 + 21 * DAY, { is_cancelled: true }),
  ];
  const sessions = [
    session(20, 2, "Practice", T0),
    session(21, 2, "Race", T0 + 2 * DAY),
    session(30, 3, "Race", T0 + 16 * DAY),
  ];
  const focusAt = (nowMs: number) =>
    scheduleFocusRound(buildSeasonSchedule(meetings, sessions, nowMs).rounds)?.meeting
      .meeting_key;

  it("prefers the weekend under way", () => {
    expect(focusAt(T0 + DAY)).toBe(2);
  });
  it("otherwise picks the latest finished race weekend, not the next one", () => {
    expect(focusAt(T0 + 7 * DAY)).toBe(2);
  });
  it("skips cancelled events after the last race", () => {
    expect(focusAt(T0 + 40 * DAY)).toBe(3);
  });
  it("ignores finished testing and falls back to the first upcoming round", () => {
    expect(focusAt(T0 - 7 * DAY)).toBe(2);
  });
  it("is null with no rounds", () => {
    expect(scheduleFocusRound([])).toBeNull();
  });
});
