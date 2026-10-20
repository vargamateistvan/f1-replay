export function toSafeExternalUrl(
  raw: string | null | undefined,
): string | null {
  if (typeof raw !== "string") return null;

  const trimmed = raw.trim();
  if (!trimmed) return null;

  const normalized = trimmed.startsWith("http://")
    ? `https://${trimmed.slice("http://".length)}`
    : trimmed;

  try {
    const parsed = new URL(normalized);
    if (parsed.protocol !== "https:" && parsed.protocol !== "http:") {
      return null;
    }
    if (!parsed.hostname) return null;
    return parsed.toString();
  } catch {
    return null;
  }
}

export function replaceHistorySearchParams(next: URLSearchParams) {
  if (typeof window === "undefined") return;

  const search = next.toString();
  const target = `${window.location.pathname}${search ? `?${search}` : ""}${window.location.hash}`;
  window.history.replaceState(window.history.state, "", target);
}

export interface ReplayTarget {
  year: number;
  meetingKey: number;
  sessionKey: number;
  /** Driver to focus on the track map. */
  focus?: number;
}

// Replay page (tracker view) for one session — e.g. a results row on the
// standings pages. Playback starts from the beginning (no ?t=).
export function replayPath({ year, meetingKey, sessionKey, focus }: ReplayTarget): string {
  const params = new URLSearchParams({
    year: String(year),
    meeting: String(meetingKey),
    session: String(sessionKey),
    view: "tracker",
  });
  if (focus !== undefined) params.set("focus", String(focus));
  return `/?${params}`;
}

// Replay path for a standings round; undefined when the round has no meeting
// key (the link is then left out).
export function roundReplayPath(
  year: number,
  round: { sessionKey: number; meetingKey?: number },
  focus?: number,
): string | undefined {
  if (round.meetingKey === undefined) return undefined;
  return replayPath({
    year,
    meetingKey: round.meetingKey,
    sessionKey: round.sessionKey,
    focus,
  });
}
