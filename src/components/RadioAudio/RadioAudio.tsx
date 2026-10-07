import { useCallback, useEffect, useRef, type MutableRefObject } from "react";
import { RADIO_INTRO_LEAD_MS, RADIO_INTRO_SOUND_URL } from "@/constants";
import { getAudioContext, loadSample, playSample } from "@/lib/audio";

interface Props {
  src: string;
  audioRef?: MutableRefObject<HTMLAudioElement | null>;
  onTimeUpdate?: () => void;
  onEnded?: () => void;
  onError?: () => void;
}

/**
 * Plays the radio chime, then the team-radio recording once the chime's main
 * beep is done. If the chime can't load, the recording starts straight away.
 * Unmounting (e.g. pressing Stop) cuts the chime as well.
 */
export function RadioAudio({
  src,
  audioRef,
  onTimeUpdate,
  onEnded,
  onError,
}: Props) {
  const elementRef = useRef<HTMLAudioElement | null>(null);
  const setRef = useCallback(
    (el: HTMLAudioElement | null) => {
      elementRef.current = el;
      if (audioRef) audioRef.current = el;
    },
    [audioRef],
  );

  useEffect(() => {
    let cancelled = false;
    let chime: AudioBufferSourceNode | null = null;
    let timer: ReturnType<typeof setTimeout> | null = null;

    const startRecording = () => {
      const el = elementRef.current;
      if (cancelled || !el) return;
      try {
        // Like the autoPlay attribute, a blocked autoplay is ignored.
        void Promise.resolve(el.play()).catch(() => {});
      } catch {
        /* Media playback unsupported (e.g. test environments). */
      }
    };

    void loadSample(RADIO_INTRO_SOUND_URL).then((buffer) => {
      if (cancelled) return;
      const ctx = getAudioContext();
      if (!buffer || !ctx) {
        startRecording();
        return;
      }
      chime = playSample(ctx, buffer);
      timer = setTimeout(startRecording, RADIO_INTRO_LEAD_MS);
    });

    return () => {
      cancelled = true;
      if (timer !== null) clearTimeout(timer);
      try {
        chime?.stop();
      } catch {
        /* Already finished. */
      }
    };
  }, [src]);

  return (
    <audio
      ref={setRef}
      src={src}
      preload="auto"
      onTimeUpdate={onTimeUpdate}
      onEnded={onEnded}
      onError={onError}
      className="hidden"
    >
      <track kind="captions" />
    </audio>
  );
}
