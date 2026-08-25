import type { RaceControl } from "@/api/types";

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
