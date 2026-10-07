import { act, render } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { RADIO_INTRO_LEAD_MS, RADIO_INTRO_SOUND_URL } from "@/constants";
import { RadioAudio } from "./RadioAudio";

const { audio, chime } = vi.hoisted(() => ({
  audio: { loadSample: vi.fn(), playSample: vi.fn() },
  chime: { stop: vi.fn() },
}));

vi.mock("@/lib/audio", () => ({
  getAudioContext: () => ({}),
  loadSample: audio.loadSample,
  playSample: audio.playSample,
}));

const play = vi.mocked(HTMLMediaElement.prototype.play);

async function flushLoad() {
  await act(async () => {
    await Promise.resolve();
  });
}

describe("RadioAudio", () => {
  beforeEach(() => {
    vi.useFakeTimers();
    play.mockClear();
    audio.loadSample.mockReset();
    audio.playSample.mockReset().mockReturnValue(chime);
    chime.stop.mockClear();
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  it("plays the chime first and starts the recording after its lead time", async () => {
    audio.loadSample.mockResolvedValue({ duration: 2.6 });
    render(<RadioAudio src="https://example.com/radio.mp3" />);
    await flushLoad();

    expect(audio.loadSample).toHaveBeenCalledWith(RADIO_INTRO_SOUND_URL);
    expect(audio.playSample).toHaveBeenCalledTimes(1);
    expect(play).not.toHaveBeenCalled();

    act(() => {
      vi.advanceTimersByTime(RADIO_INTRO_LEAD_MS);
    });
    expect(play).toHaveBeenCalledTimes(1);
  });

  it("starts the recording straight away when the chime is unavailable", async () => {
    audio.loadSample.mockResolvedValue(null);
    render(<RadioAudio src="https://example.com/radio.mp3" />);
    await flushLoad();

    expect(audio.playSample).not.toHaveBeenCalled();
    expect(play).toHaveBeenCalledTimes(1);
  });

  it("cuts the chime and never starts the recording when stopped early", async () => {
    audio.loadSample.mockResolvedValue({ duration: 2.6 });
    const { unmount } = render(
      <RadioAudio src="https://example.com/radio.mp3" />,
    );
    await flushLoad();
    unmount();

    expect(chime.stop).toHaveBeenCalled();
    act(() => {
      vi.advanceTimersByTime(RADIO_INTRO_LEAD_MS);
    });
    expect(play).not.toHaveBeenCalled();
  });

  it("exposes the audio element through audioRef", () => {
    audio.loadSample.mockReturnValue(new Promise(() => {}));
    const audioRef = { current: null as HTMLAudioElement | null };
    render(
      <RadioAudio src="https://example.com/radio.mp3" audioRef={audioRef} />,
    );
    expect(audioRef.current).toBeInstanceOf(HTMLAudioElement);
    expect(audioRef.current?.getAttribute("src")).toBe(
      "https://example.com/radio.mp3",
    );
  });
});
