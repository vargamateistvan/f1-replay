import { Play, Square } from "lucide-react";
import { COMMENTARY_BUTTON_CLASS } from "@/components/CommentaryPanels/commentaryList";
import { useAudioProgress } from "@/hooks/useAudioProgress";
import { RadioAudio } from "./RadioAudio";

export function RadioPlayback({
  src,
  playing,
  onToggle,
  onEnded,
  onError = onEnded,
  ariaLabel,
}: {
  src: string | null;
  playing: boolean;
  onToggle: () => void;
  onEnded: () => void;
  onError?: () => void;
  ariaLabel?: string;
}) {
  const isPlaying = playing && src !== null;
  const { progress, audioRef, onTimeUpdate } = useAudioProgress(isPlaying);
  return (
    <>
      <button
        type="button"
        onClick={onToggle}
        disabled={!src}
        aria-label={ariaLabel ?? (isPlaying ? "Stop" : "Play")}
        className={`${COMMENTARY_BUTTON_CLASS} relative w-[64px] overflow-hidden ${
          isPlaying ? "border-f1red text-fg" : ""
        }`}
      >
        {isPlaying && (
          <span
            aria-hidden="true"
            className="absolute inset-y-0 left-0 bg-f1red transition-[width] duration-150 ease-linear"
            style={{ width: `${progress * 100}%` }}
            data-progress={Math.round(progress * 100)}
          />
        )}
        <span className="relative flex items-center gap-1.5">
          {isPlaying ? (
            <><Square size={11} strokeWidth={2.4} aria-hidden="true" /> Stop</>
          ) : (
            <><Play size={11} strokeWidth={2.4} aria-hidden="true" /> Play</>
          )}
        </span>
      </button>
      {isPlaying && src && (
        <RadioAudio
          key={src}
          audioRef={audioRef}
          src={src}
          onTimeUpdate={onTimeUpdate}
          onEnded={onEnded}
          onError={onError}
        />
      )}
    </>
  );
}
