import type { Meeting, Session } from "@/api/types";
import { LIVE_BUFFER_MS } from "@/constants";

export type ScheduleStatus = "completed" | "live" | "upcoming" | "cancelled";

export interface ScheduleSession {
  session: Session;
  status: ScheduleStatus;
}

export interface ScheduleRound {
  meeting: Meeting;
  /** Championship round number; null for testing and cancelled events. */
  round: number | null;
  isTesting: boolean;
  isSprint: boolean;
  status: ScheduleStatus;
  /** First round that hasn't finished yet (the one to highlight). */
  isNext: boolean;
  sessions: ScheduleSession[];
}

export interface SeasonSchedule {
  rounds: ScheduleRound[];
  totalRounds: number;
  completedRounds: number;
}

const msOf = (iso: string) => new Date(iso).getTime();

export function isTestingMeeting(meeting: Pick<Meeting, "meeting_name">): boolean {
  return /testing/i.test(meeting.meeting_name);
}

// Same ±LIVE_BUFFER_MS window as isSessionLive(), but against a given clock so
// the schedule is deterministic in tests.
export function sessionStatus(session: Session, nowMs: number): ScheduleStatus {
  if (session.is_cancelled) return "cancelled";
  const start = msOf(session.date_start);
  const end = msOf(session.date_end);
  if (nowMs > end + LIVE_BUFFER_MS) return "completed";
  if (nowMs >= start - LIVE_BUFFER_MS) return "live";
  return "upcoming";
}

function roundStatus(
  meeting: Meeting,
  sessions: ScheduleSession[],
  nowMs: number,
): ScheduleStatus {
  if (meeting.is_cancelled) return "cancelled";
  const active = sessions.filter((s) => s.status !== "cancelled");
  if (active.length === 0) {
    // Sessions not published yet — fall back to the meeting's own dates.
    if (nowMs > msOf(meeting.date_end)) return "completed";
    if (nowMs >= msOf(meeting.date_start)) return "live";
    return "upcoming";
  }
  if (active.every((s) => s.status === "completed")) return "completed";
  if (active.some((s) => s.status === "live")) return "live";
  // Between two sessions of the same weekend still counts as under way.
  if (active.some((s) => s.status === "completed")) return "live";
  return "upcoming";
}

// One entry per meeting in calendar order, with its sessions attached.
// Testing is listed but not numbered; cancelled events keep their slot
// without a round number, like the official calendar.
export function buildSeasonSchedule(
  meetings: Meeting[],
  sessions: Session[],
  nowMs: number,
): SeasonSchedule {
  const byMeeting = new Map<number, Session[]>();
  for (const session of sessions) {
    const list = byMeeting.get(session.meeting_key) ?? [];
    list.push(session);
    byMeeting.set(session.meeting_key, list);
  }

  let round = 0;
  let nextAssigned = false;
  const rounds = [...meetings]
    .sort((a, b) => msOf(a.date_start) - msOf(b.date_start))
    .map((meeting): ScheduleRound => {
      const meetingSessions = (byMeeting.get(meeting.meeting_key) ?? [])
        .slice()
        .sort((a, b) => msOf(a.date_start) - msOf(b.date_start))
        .map((session) => ({ session, status: sessionStatus(session, nowMs) }));
      const isTesting = isTestingMeeting(meeting);
      const status = roundStatus(meeting, meetingSessions, nowMs);
      const numbered = !isTesting && !meeting.is_cancelled;
      const isNext =
        !nextAssigned && (status === "live" || status === "upcoming");
      if (isNext) nextAssigned = true;
      return {
        meeting,
        round: numbered ? ++round : null,
        isTesting,
        isSprint: meetingSessions.some((s) => s.session.session_type === "Sprint"),
        status,
        isNext,
        sessions: meetingSessions,
      };
    });

  return {
    rounds,
    totalRounds: round,
    completedRounds: rounds.filter((r) => r.round !== null && r.status === "completed")
      .length,
  };
}

// Round the schedule opens on: the weekend under way, else the latest
// finished race weekend, else (pre-season) the first one still to come.
export function scheduleFocusRound(rounds: ScheduleRound[]): ScheduleRound | null {
  const live = rounds.find((r) => r.status === "live");
  if (live) return live;
  const lastCompleted = rounds.findLast(
    (r) => r.round !== null && r.status === "completed",
  );
  return lastCompleted ?? rounds.find((r) => r.status === "upcoming") ?? null;
}

// "3d 4h", "5h 12m", "8m" — coarse countdown to the next session.
export function formatCountdown(ms: number): string {
  const totalMin = Math.max(0, Math.floor(ms / 60_000));
  const days = Math.floor(totalMin / 1440);
  const hours = Math.floor((totalMin % 1440) / 60);
  const mins = totalMin % 60;
  if (days > 0) return `${days}d ${hours}h`;
  if (hours > 0) return `${hours}h ${mins}m`;
  return `${mins}m`;
}
