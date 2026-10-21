export interface SpoilerState {
  enabled: boolean;
  /** Sessions that ended before this were already known when the mode was turned on. */
  knownBeforeMs: number;
  /** sessionKey → epoch ms it was marked watched. */
  watched: Readonly<Record<number, number>>;
}

interface SpoilerSessionLike {
  session_key: number;
  date_start: string;
  date_end?: string;
}

/** True when spoiler-free mode should keep this session's result out of sight. */
export function isResultHidden(
  session: SpoilerSessionLike,
  state: SpoilerState,
): boolean {
  if (!state.enabled) return false;
  if (state.watched[session.session_key] !== undefined) return false;
  const endMs = Date.parse(session.date_end ?? session.date_start);
  return !Number.isFinite(endMs) || endMs > state.knownBeforeMs;
}

/**
 * Splits chronologically sorted rounds at the first hidden one. Everything
 * from there on is hidden too, so standings never skip an unseen round.
 */
export function splitAtFirstHidden<T>(
  sorted: readonly T[],
  isHidden: (item: T) => boolean,
): { visible: T[]; hidden: T[] } {
  const firstHidden = sorted.findIndex(isHidden);
  if (firstHidden === -1) return { visible: [...sorted], hidden: [] };
  return {
    visible: sorted.slice(0, firstHidden),
    hidden: sorted.slice(firstHidden),
  };
}

/** Adds `sessionKey`, dropping the oldest entries beyond `max`. */
export function withWatched(
  watched: Readonly<Record<number, number>>,
  sessionKey: number,
  nowMs: number,
  max: number,
): Record<number, number> {
  const next = { ...watched, [sessionKey]: nowMs };
  const keys = Object.keys(next);
  if (keys.length <= max) return next;
  const oldestFirst = keys.sort((a, b) => next[Number(a)]! - next[Number(b)]!);
  for (const key of oldestFirst.slice(0, keys.length - max)) {
    delete next[Number(key)];
  }
  return next;
}

/**
 * Scrubber end while a race's result is hidden: `lookahead` past the playhead,
 * rounded up to a whole `step`, never past the real end. The bar's length then
 * gives away neither the finish nor a red flag that ends the race early.
 */
export function visibleScrubEndMs(
  t: number,
  durationMs: number,
  lookaheadMs: number,
  stepMs: number,
): number {
  const end = Math.ceil((Math.max(0, t) + lookaheadMs) / stepMs) * stepMs;
  return Math.min(durationMs, end);
}
