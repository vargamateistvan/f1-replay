// Shared Web Audio helpers for short synthesized UI cues. One AudioContext is
// reused app-wide because browsers cap how many can be open at once.

let audioCtx: AudioContext | null = null;

export function getAudioContext(): AudioContext | null {
  if (typeof window === "undefined") return null;
  const Ctx =
    window.AudioContext ||
    (window as typeof window & { webkitAudioContext?: typeof AudioContext })
      .webkitAudioContext;
  if (!Ctx) return null;
  if (!audioCtx) audioCtx = new Ctx();
  if (audioCtx.state === "suspended") {
    void audioCtx.resume().catch(() => {
      /* Ignore blocked autoplay contexts. */
    });
  }
  return audioCtx;
}

export function beep(
  ctx: AudioContext,
  frequency: number,
  startAt: number,
  duration: number,
  volume = 0.04,
  type: OscillatorNode["type"] = "sine",
) {
  const osc = ctx.createOscillator();
  const gain = ctx.createGain();
  osc.type = type;
  osc.frequency.setValueAtTime(frequency, startAt);
  gain.gain.setValueAtTime(0, startAt);
  gain.gain.linearRampToValueAtTime(volume, startAt + 0.01);
  gain.gain.exponentialRampToValueAtTime(0.0001, startAt + duration);
  osc.connect(gain).connect(ctx.destination);
  osc.start(startAt);
  osc.stop(startAt + duration);
}

const sampleCache = new Map<string, Promise<AudioBuffer | null>>();

/**
 * Fetches and decodes an audio file once per URL. Resolves to null when the
 * file is missing or isn't decodable audio (e.g. an SPA fallback page), so
 * callers can fall back to a synthesized cue.
 */
export function loadSample(url: string): Promise<AudioBuffer | null> {
  const ctx = getAudioContext();
  if (!ctx || typeof fetch === "undefined") return Promise.resolve(null);
  let cached = sampleCache.get(url);
  if (!cached) {
    cached = fetch(url)
      .then((res) => (res.ok ? res.arrayBuffer() : null))
      .then((data) => (data ? ctx.decodeAudioData(data) : null))
      .catch(() => null);
    sampleCache.set(url, cached);
  }
  return cached;
}

export function playSample(
  ctx: AudioContext,
  buffer: AudioBuffer,
  volume = 1,
): AudioBufferSourceNode {
  const source = ctx.createBufferSource();
  const gain = ctx.createGain();
  source.buffer = buffer;
  gain.gain.value = volume;
  source.connect(gain).connect(ctx.destination);
  source.start();
  return source;
}
