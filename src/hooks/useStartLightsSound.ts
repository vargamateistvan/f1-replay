import { useEffect, useRef } from "react";
import {
  START_LIGHT_SOUND_URL,
  START_LIGHTS_SOUND_MAX_SPEED,
} from "@/constants";
import { beep, getAudioContext, loadSample, playSample } from "@/lib/audio";
import { useTimeline } from "@/timeline/clock";
import { isNewStartLight, type StartLightsState } from "@/timeline/startLights";

function playStartLightBeep() {
  void loadSample(START_LIGHT_SOUND_URL).then((buffer) => {
    const ctx = getAudioContext();
    if (!ctx) return;
    if (buffer) playSample(ctx, buffer);
    // Fallback approximating the recording: a 0.34 s, ~500 Hz square-wave beep.
    else beep(ctx, 500, ctx.currentTime + 0.01, 0.34, 0.05, "square");
  });
}

/**
 * Beeps as each start light comes on; lights out is silent. Plays
 * public/sounds/start-light.mp3, or a synthesized beep if it's unavailable.
 */
export function useStartLightsSound(
  state: StartLightsState | null,
  enabled: boolean,
) {
  const playing = useTimeline((s) => s.playing);
  const speed = useTimeline((s) => s.speed);
  const prevRef = useRef<StartLightsState | null>(state);

  const phase = state?.phase ?? null;
  const lit = state?.phase === "sequence" ? state.lit : null;

  // Decode the recording up front so the first beep isn't late.
  useEffect(() => {
    if (enabled) void loadSample(START_LIGHT_SOUND_URL);
  }, [enabled]);

  useEffect(() => {
    const next: StartLightsState | null =
      phase === "out"
        ? { phase: "out" }
        : phase === "sequence" && lit !== null
          ? { phase: "sequence", lit }
          : null;
    const prev = prevRef.current;
    prevRef.current = next;

    if (!enabled || !playing || speed > START_LIGHTS_SOUND_MAX_SPEED) return;
    if (
      typeof document !== "undefined" &&
      document.visibilityState !== "visible"
    )
      return;

    if (isNewStartLight(prev, next)) playStartLightBeep();
  }, [phase, lit, enabled, playing, speed]);
}
