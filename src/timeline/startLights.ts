import {
  LIGHTS_OUT_NOTICE_MS,
  START_LIGHT_COUNT,
  START_LIGHT_INTERVAL_MS,
  START_LIGHTS_LEAD_IN_MS,
  START_LIGHTS_SEQUENCE_MS,
} from "@/constants";

export type StartLightsState =
  { phase: "sequence"; lit: number } | { phase: "out" };

/**
 * Start-light state at session-relative time `t`. Lights come on one every
 * {@link START_LIGHT_INTERVAL_MS}, the last one holds for
 * `START_LIGHTS_HOLD_MS`, all go out together at `lightsOutMs`, and
 * "Lights Out" stays up briefly after.
 */
export function startLightsState(
  t: number,
  lightsOutMs: number | null | undefined,
): StartLightsState | null {
  if (lightsOutMs == null) return null;
  const phase = t - lightsOutMs;
  if (phase >= 0) return phase < LIGHTS_OUT_NOTICE_MS ? { phase: "out" } : null;
  if (phase < -(START_LIGHTS_SEQUENCE_MS + START_LIGHTS_LEAD_IN_MS))
    return null;
  const lit =
    Math.floor((phase + START_LIGHTS_SEQUENCE_MS) / START_LIGHT_INTERVAL_MS) +
    1;
  return {
    phase: "sequence",
    lit: Math.max(0, Math.min(START_LIGHT_COUNT, lit)),
  };
}

/**
 * The session-relative span the start-light sequence occupies, from the
 * "get ready" lead-in to lights out. Played back at 1x regardless of speed.
 */
export function startLightsWindow(lightsOutMs: number): {
  startMs: number;
  endMs: number;
} {
  return {
    startMs: lightsOutMs - START_LIGHTS_SEQUENCE_MS - START_LIGHTS_LEAD_IN_MS,
    endMs: lightsOutMs,
  };
}

/**
 * Whether moving from `prev` to `next` turned on exactly one more light — the
 * moment to play the start-light beep. Seeking into, across or back through
 * the sequence doesn't count, and lights out is silent.
 */
export function isNewStartLight(
  prev: StartLightsState | null,
  next: StartLightsState | null,
): boolean {
  if (next?.phase !== "sequence") return false;
  const prevLit =
    prev === null ? 0 : prev.phase === "sequence" ? prev.lit : null;
  return prevLit !== null && next.lit === prevLit + 1;
}
