import type { RaceControl } from "@/api/types";
import {
  QUALI_PHASE_DURATIONS_MS,
  QUALI_Q3_13_MIN_FROM_YEAR,
  QUALI_Q3_13_MIN_MS,
  SPRINT_QUALI_PHASE_DURATIONS_MS,
} from "@/constants";

export type QualiPhase = "Q1" | "Q2" | "Q3";

export function isPracticeSession(name: string): boolean {
  return /practice/i.test(name);
}

export function isQualiSession(name: string): boolean {
  return /qualifying/i.test(name);
}

export function isSprintSession(name: string | undefined): boolean {
  if (!name) return false;
  return /(^|\s)sprint(\s|$)/i.test(name) && !/qualifying/i.test(name);
}

export function isTimedSession(name: string): boolean {
  return isPracticeSession(name) || isQualiSession(name);
}

// Label for the opening chapter of a session ("Race Start", "Sprint Start"…).
export function sessionStartLabel(name: string | undefined): string {
  if (!name) return "Race Start";
  if (isQualiSession(name) || /shootout/i.test(name)) return "Qualifying Start";
  if (isPracticeSession(name)) return "Practice Start";
  if (isSprintSession(name)) return "Sprint Start";
  return "Race Start";
}

// Returns the qualifying phase (Q1/Q2/Q3) active at session-relative time t.
// Scans race control messages for "Q1 PERIOD STARTED" style markers.
// Only advances — a later "END OF Q1" message won't clear the phase.
export function detectQualiPhase(
  messages: RaceControl[],
  sessionStartMs: number,
  t: number,
): QualiPhase | null {
  if (!messages.length) return null;

  const sorted = [...messages].sort(
    (a, b) => new Date(a.date).getTime() - new Date(b.date).getTime(),
  );

  let phase: QualiPhase | null = null;
  for (const msg of sorted) {
    const ms = new Date(msg.date).getTime() - sessionStartMs;
    if (ms > t) break;

    const explicitPhase = msg.qualifying_phase;
    if (explicitPhase === 1 || explicitPhase === 2 || explicitPhase === 3) {
      phase = `Q${explicitPhase}` as QualiPhase;
      continue;
    }

    // Fallback for feeds that do not populate qualifying_phase.
    const m = msg.message.match(/\bQ([123])\b/i);
    if (m) {
      const candidate = `Q${m[1]}` as QualiPhase;
      if (phase === null || candidate > phase) phase = candidate;
    }
  }
  return phase;
}

const SESSION_STATUS_RE =
  /^SESSION (STARTED|RESUMED|ABORTED|SUSPENDED|FINISHED)\b/;

interface QualiPhaseRun {
  index: number;
  intervals: Array<{ start: number; end: number | null }>;
  finishedAt: number | null;
  // Chequered flag shown while the clock was running (not after a red flag),
  // so the recorded running time is the phase's real length.
  ranToTime: boolean;
}

function nominalQualiPhaseMs(
  index: number,
  sessionName: string,
  year: number,
): number {
  if (/sprint/i.test(sessionName))
    return SPRINT_QUALI_PHASE_DURATIONS_MS[index];
  if (index === 2 && year >= QUALI_Q3_13_MIN_FROM_YEAR)
    return QUALI_Q3_13_MIN_MS;
  return QUALI_PHASE_DURATIONS_MS[index];
}

// Remaining time on the qualifying clock at session-relative time t, or null
// when the feed has no session status messages yet. The clock only runs between
// SESSION STARTED and SESSION ABORTED (red flag) / FINISHED, so it freezes
// under red flags and reads 0 in the break after each phase's chequered flag.
export function qualiClockRemainingMs(
  messages: RaceControl[],
  sessionStartMs: number,
  t: number,
  sessionName: string,
): number | null {
  const statuses = messages
    .map((msg) => ({
      msg,
      ms: new Date(msg.date).getTime() - sessionStartMs,
      status: SESSION_STATUS_RE.exec((msg.message ?? "").toUpperCase())?.[1],
    }))
    .filter((s) => s.status !== undefined && Number.isFinite(s.ms))
    .sort((a, b) => a.ms - b.ms);
  if (!statuses.length) return null;

  const phases: QualiPhaseRun[] = [];
  let current: QualiPhaseRun | null = null;
  for (const { msg, ms, status } of statuses) {
    const open = current?.intervals.at(-1);
    const running = open !== undefined && open.end === null;
    if (status === "STARTED" || status === "RESUMED") {
      const tagged = msg.qualifying_phase;
      const index: number =
        tagged === 1 || tagged === 2 || tagged === 3
          ? tagged - 1
          : current === null
            ? 0
            : current.finishedAt !== null
              ? Math.min(current.index + 1, 2)
              : current.index;
      if (
        current === null ||
        index !== current.index ||
        current.finishedAt !== null
      ) {
        if (open && running) open.end = ms;
        current = { index, intervals: [], finishedAt: null, ranToTime: false };
        phases.push(current);
        current.intervals.push({ start: ms, end: null });
      } else if (!running) {
        current.intervals.push({ start: ms, end: null });
      }
    } else if (current !== null) {
      if (open && running) open.end = ms;
      if (status === "FINISHED" && current.finishedAt === null) {
        current.finishedAt = ms;
        current.ranToTime = running;
      }
    }
  }
  if (!phases.length) return null;

  const phase = phases.findLast((p) => p.intervals[0].start <= t) ?? phases[0];
  if (phase.finishedAt !== null && t >= phase.finishedAt) return 0;

  let elapsed = 0;
  let recorded = 0;
  for (const { start, end } of phase.intervals) {
    if (start < t) elapsed += Math.min(end ?? t, t) - start;
    if (end !== null) recorded += end - start;
  }
  const length = phase.ranToTime
    ? recorded
    : nominalQualiPhaseMs(
        phase.index,
        sessionName,
        new Date(sessionStartMs).getUTCFullYear(),
      );
  return Math.max(0, length - elapsed);
}
