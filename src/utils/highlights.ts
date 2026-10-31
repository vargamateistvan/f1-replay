/**
 * Matches FORMULA 1 YouTube highlight videos to OpenF1 sessions. Used by
 * scripts/fetch-highlights.mjs to bake src/data/session-highlights.json.
 *
 * Highlight titles look like "Race Highlights | 2026 United States Grand Prix"
 * or "FP1 Highlights | 2026 Mexico City Grand Prix".
 *
 * This module has only type imports so the Node bake script can load it directly.
 */
import type { Meeting, Session } from "@/api/types";

export type HighlightKind =
  | "fp1"
  | "fp2"
  | "fp3"
  | "qualifying"
  | "sprintQualifying"
  | "sprint"
  | "race"
  | "extended";

export interface ParsedHighlightTitle {
  kind: HighlightKind;
  year: number;
  eventName: string;
}

export interface HighlightCandidate {
  videoId: string;
  title: string;
  publishedAt: string;
}

const LABEL_KIND: Record<string, HighlightKind> = {
  fp1: "fp1",
  "practice 1": "fp1",
  fp2: "fp2",
  "practice 2": "fp2",
  fp3: "fp3",
  "practice 3": "fp3",
  qualifying: "qualifying",
  "sprint qualifying": "sprintQualifying",
  "sprint shootout": "sprintQualifying",
  sprint: "sprint",
  race: "race",
  extended: "extended",
};

// OpenF1 renamed Sprint Shootout (2023) to Sprint Qualifying (2024+).
const KIND_SESSION_NAMES: Record<HighlightKind, string[]> = {
  fp1: ["Practice 1"],
  fp2: ["Practice 2"],
  fp3: ["Practice 3"],
  qualifying: ["Qualifying"],
  sprintQualifying: ["Sprint Qualifying", "Sprint Shootout"],
  sprint: ["Sprint"],
  race: ["Race"],
  extended: ["Race"],
};

const TITLE_RE = /^\s*(.+?)\s+highlights\s*\|\s*(\d{4})\s+(.+?)\s*(?:\|.*)?$/i;

export function parseHighlightTitle(title: string): ParsedHighlightTitle | null {
  const match = TITLE_RE.exec(title);
  if (!match) return null;
  const kind = LABEL_KIND[match[1].toLowerCase().replace(/\s+/g, " ")];
  if (!kind) return null;
  return { kind, year: Number(match[2]), eventName: match[3] };
}

/** "São Paulo Grand Prix" / "Emilia-Romagna Grand Prix" → comparable keys. */
export function normalizeEventName(name: string): string {
  return name
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLowerCase()
    .replace(/[^a-z0-9]/g, "");
}

export function matchHighlightSession(
  parsed: ParsedHighlightTitle,
  meetings: Pick<Meeting, "meeting_key" | "meeting_name" | "year">[],
  sessions: Pick<Session, "session_key" | "session_name" | "meeting_key" | "is_cancelled">[],
): number | null {
  const eventKey = normalizeEventName(parsed.eventName);
  const meeting = meetings.find(
    (m) => m.year === parsed.year && normalizeEventName(m.meeting_name) === eventKey,
  );
  if (!meeting) return null;
  const names = KIND_SESSION_NAMES[parsed.kind];
  const session = sessions.find(
    (s) =>
      s.meeting_key === meeting.meeting_key &&
      !s.is_cancelled &&
      names.includes(s.session_name),
  );
  return session?.session_key ?? null;
}

/**
 * Whether `candidate` should replace `current` for the same session: proper
 * highlights beat "Extended Highlights", then the original (earliest) upload
 * beats later re-uploads.
 */
export function isPreferredHighlight(
  candidate: HighlightCandidate,
  current: HighlightCandidate | undefined,
): boolean {
  if (!current) return true;
  if (candidate.videoId === current.videoId) return false;
  const extended = (h: HighlightCandidate) =>
    parseHighlightTitle(h.title)?.kind === "extended";
  if (extended(candidate) !== extended(current)) return extended(current);
  return Date.parse(candidate.publishedAt) < Date.parse(current.publishedAt);
}
