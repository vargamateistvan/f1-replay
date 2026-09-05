import { useEffect, useRef, useState } from "react";

/**
 * Tracks 0-1 playback progress for an `<audio>` element via its `onTimeUpdate`
 * handler. Resets to 0 whenever `active` goes false (e.g. playback stopped).
 */
export function useAudioProgress(active: boolean) {
  const [progress, setProgress] = useState(0);
  const audioRef = useRef<HTMLAudioElement | null>(null);

  useEffect(() => {
    if (!active) setProgress(0);
  }, [active]);

  function onTimeUpdate() {
    const el = audioRef.current;
    if (el && el.duration > 0) {
      setProgress(Math.min(1, el.currentTime / el.duration));
    }
  }

  return { progress, audioRef, onTimeUpdate };
}
