import { renderHook } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { START_LIGHT_SOUND_URL } from "@/constants";
import type { StartLightsState } from "@/timeline/startLights";
import { useStartLightsSound } from "./useStartLightsSound";

const { audio, timeline } = vi.hoisted(() => ({
  audio: {
    beep: vi.fn(),
    playSample: vi.fn(),
    loadSample: vi.fn(),
  },
  timeline: { playing: true, speed: 1 },
}));

vi.mock("@/lib/audio", () => ({
  getAudioContext: () => ({ currentTime: 0 }),
  beep: audio.beep,
  playSample: audio.playSample,
  loadSample: audio.loadSample,
}));

vi.mock("@/timeline/clock", () => ({
  useTimeline: (selector: (s: typeof timeline) => unknown) =>
    selector(timeline),
}));

const seq = (lit: number): StartLightsState => ({ phase: "sequence", lit });
const FULL_SEQUENCE: (StartLightsState | null)[] = [
  null,
  seq(0),
  seq(1),
  seq(2),
  seq(3),
  seq(4),
  seq(5),
  { phase: "out" },
  null,
];

function renderSequence(states: (StartLightsState | null)[], enabled = true) {
  const { rerender } = renderHook(
    ({ state }) => useStartLightsSound(state, enabled),
    { initialProps: { state: states[0] ?? null } },
  );
  for (const state of states.slice(1)) rerender({ state });
}

const flush = () => new Promise((resolve) => setTimeout(resolve, 0));

describe("useStartLightsSound", () => {
  beforeEach(() => {
    audio.beep.mockClear();
    audio.playSample.mockClear();
    audio.loadSample.mockReset();
    audio.loadSample.mockResolvedValue(null);
    timeline.playing = true;
    timeline.speed = 1;
  });

  it("plays the recording once per light and stays silent at lights out", async () => {
    const buffer = { id: "start-light" };
    audio.loadSample.mockResolvedValue(buffer);
    renderSequence(FULL_SEQUENCE);
    await flush();
    expect(audio.loadSample).toHaveBeenCalledWith(START_LIGHT_SOUND_URL);
    expect(audio.playSample.mock.calls.map((call) => call[1])).toEqual(
      Array(5).fill(buffer),
    );
    expect(audio.beep).not.toHaveBeenCalled();
  });

  it("falls back to a synthesized beep when the recording is unavailable", async () => {
    renderSequence(FULL_SEQUENCE);
    await flush();
    expect(audio.beep).toHaveBeenCalledTimes(5);
    expect(audio.playSample).not.toHaveBeenCalled();
  });

  it("preloads the recording only when enabled", () => {
    renderSequence([null], false);
    expect(audio.loadSample).not.toHaveBeenCalled();
    renderSequence([null], true);
    expect(audio.loadSample).toHaveBeenCalledWith(START_LIGHT_SOUND_URL);
  });

  it("is silent when disabled, paused or playing too fast", async () => {
    renderSequence([seq(0), seq(1)], false);
    timeline.playing = false;
    renderSequence([seq(0), seq(1)]);
    timeline.playing = true;
    timeline.speed = 8;
    renderSequence([seq(0), seq(1)]);
    await flush();
    expect(audio.beep).not.toHaveBeenCalled();
  });

  it("does not replay a light when playback resumes on it", async () => {
    timeline.playing = false;
    const { rerender } = renderHook(
      ({ state }) => useStartLightsSound(state, true),
      { initialProps: { state: seq(2) as StartLightsState | null } },
    );
    rerender({ state: seq(3) });
    timeline.playing = true;
    rerender({ state: seq(3) });
    await flush();
    expect(audio.beep).not.toHaveBeenCalled();
  });
});
