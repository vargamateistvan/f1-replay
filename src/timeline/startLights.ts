import {
  LIGHTS_OUT_NOTICE_MS,
  START_LIGHT_COUNT,
  START_LIGHTS_LEAD_IN_MS,
  START_LIGHTS_SEQUENCE_MS,
} from "@/constants";

export type StartLightsState =
  | { phase: "sequence"; lit: number }
  | { phase: "out" };

/**
 * Start-light state at session-relative time `t`. Lights come on one per
 * second during the {@link START_LIGHTS_SEQUENCE_MS} before lights out, all go
 * out together at `lightsOutMs`, and "Lights Out" stays up briefly after.
 */
export function startLightsState(
  t: number,
  lightsOutMs: number | null | undefined,
): StartLightsState | null {
  if (lightsOutMs == null) return null;
  const phase = t - lightsOutMs;
  if (phase >= 0) return phase < LIGHTS_OUT_NOTICE_MS ? { phase: "out" } : null;
  if (phase < -(START_LIGHTS_SEQUENCE_MS + START_LIGHTS_LEAD_IN_MS)) return null;
  const lit = Math.floor((phase + START_LIGHTS_SEQUENCE_MS) / 1_000) + 1;
  return {
    phase: "sequence",
    lit: Math.max(0, Math.min(START_LIGHT_COUNT, lit)),
  };
}
