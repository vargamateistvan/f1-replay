/**
 * Baked FORMULA 1 YouTube highlight videos, keyed by session_key. Generated
 * by `node scripts/fetch-highlights.mjs` (update-highlights workflow).
 *
 * Embedded with a fallback: FOM blocks its videos from playing in players on
 * other sites ("blocked it from display on this website"), so
 * `HighlightsDialog` falls back to a thumbnail + YouTube link on player errors.
 */
import baked from "./session-highlights.json";

export interface SessionHighlight {
  videoId: string;
  title: string;
  publishedAt: string;
}

const HIGHLIGHTS = baked as Record<string, SessionHighlight>;

export function getSessionHighlight(
  sessionKey: number | null | undefined,
): SessionHighlight | null {
  if (sessionKey == null) return null;
  return HIGHLIGHTS[String(sessionKey)] ?? null;
}

export function youTubeWatchUrl(videoId: string): string {
  return `https://www.youtube.com/watch?v=${encodeURIComponent(videoId)}`;
}

export function youTubeThumbnailUrl(videoId: string): string {
  return `https://i.ytimg.com/vi/${encodeURIComponent(videoId)}/hqdefault.jpg`;
}
