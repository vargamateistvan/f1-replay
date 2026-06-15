import { useEffect } from "react";
import { useTimeline } from "@/timeline/clock";
import { SPEEDS } from "@/constants";
import { nextAfter, prevBefore } from "@/timeline/events";

interface Props {
  durationMs: number;
  lapStarts?: number[];
  pitTimes?: number[];
  flagTimes?: number[];
  overtakeTimes?: number[];
  radioTimes?: number[];
  /** Show a countdown badge (timed sessions: practice / qualifying) */
  countdownMs?: number | null;
  /** Active qualifying phase label e.g. "Q1" — shown alongside the countdown */
  qualiPhase?: string | null;
}

function fmtTime(ms: number) {
  const s = Math.floor(ms / 1000);
  const m = Math.floor(s / 60);
  const h = Math.floor(m / 60);
  const pad = (n: number) => String(n).padStart(2, "0");
  return h > 0
    ? `${h}:${pad(m % 60)}:${pad(s % 60)}`
    : `${pad(m)}:${pad(s % 60)}`;
}

const JUMP_BTN =
  "w-7 h-8 flex items-center justify-center text-xs bg-panel text-muted hover:text-white hover:bg-[#38383f] transition-colors shrink-0 disabled:opacity-30 disabled:hover:bg-panel disabled:hover:text-muted";
const CHIP_STRETCH =
  "h-7 flex-1 flex items-center justify-center text-[10px] font-black uppercase tracking-widest bg-panel text-muted hover:text-white hover:bg-[#38383f] transition-colors sm:flex-none sm:shrink-0 sm:px-3 disabled:opacity-30 disabled:hover:bg-panel disabled:hover:text-muted";

export function PlaybackBar({
  durationMs,
  lapStarts = [],
  pitTimes = [],
  flagTimes = [],
  overtakeTimes = [],
  radioTimes = [],
  countdownMs = null,
  qualiPhase = null,
}: Props) {
  const { t, playing, speed, toggle, setT, setSpeed, setPlaying } =
    useTimeline();

  const clamp = (v: number) =>
    Math.max(0, durationMs > 0 ? Math.min(v, durationMs) : v);

  useEffect(() => {
    if (durationMs <= 0 || t < durationMs) return;
    if (t !== durationMs) setT(durationMs);
    if (playing) setPlaying(false);
  }, [durationMs, playing, setPlaying, setT, t]);

  const jump = (target: number | null) => {
    if (target !== null) setT(clamp(target));
  };

  const prevLap = prevBefore(lapStarts, t);
  const nextLap = nextAfter(lapStarts, t);
  const nextPit = nextAfter(pitTimes, t);
  const nextFlag = nextAfter(flagTimes, t);
  const nextPass = nextAfter(overtakeTimes, t);
  const nextRadio = nextAfter(radioTimes, t);

  return (
    <div
      className="flex flex-col gap-1.5 py-2 bg-track border-t border-panel sm:gap-2 sm:py-2.5"
      style={{
        paddingLeft: "max(0.75rem, env(safe-area-inset-left))",
        paddingRight: "max(0.75rem, env(safe-area-inset-right))",
      }}
    >
      {/* ── Transport + scrubber row ─────────────────────────────── */}
      <div className="flex items-center gap-2 w-full">
        {/* Prev lap */}
        <button
          onClick={() => jump(prevLap)}
          disabled={prevLap === null}
          className={JUMP_BTN}
          aria-label="Previous lap"
          title="Previous lap ([)"
        >
          ⏮
        </button>

        {/* Play / pause */}
        <button
          onClick={toggle}
          className="w-8 h-8 bg-f1red text-white font-bold flex items-center justify-center hover:bg-red-600 transition-colors shrink-0"
          aria-label={playing ? "Pause" : "Play"}
          title="Play / pause (Space)"
        >
          {playing ? "⏸" : "▶"}
        </button>

        {/* Next lap */}
        <button
          onClick={() => jump(nextLap)}
          disabled={nextLap === null}
          className={JUMP_BTN}
          aria-label="Next lap"
          title="Next lap (])"
        >
          ⏭
        </button>

        {/* Current time */}
        <span className="text-muted font-mono text-xs tabular-nums w-10 text-right shrink-0">
          {fmtTime(t)}
        </span>

        {/* Scrubber */}
        <input
          type="range"
          min={0}
          max={durationMs}
          value={Math.min(t, durationMs)}
          onChange={(e) => setT(Number(e.target.value))}
          className="flex-1 h-1 cursor-pointer"
          style={{ touchAction: "none" }}
          aria-label="Seek"
        />

        {/* Duration — hidden on mobile to reclaim scrubber space */}
        <span className="hidden sm:inline text-muted font-mono text-xs tabular-nums w-12 shrink-0">
          {fmtTime(durationMs)}
        </span>

        {/* Speed buttons — desktop only (mobile lives in chips row) */}
        <div className="hidden sm:flex gap-px shrink-0">
          {SPEEDS.map((s) => (
            <button
              key={s}
              onClick={() => setSpeed(s)}
              aria-pressed={speed === s}
              aria-label={`${s}x speed`}
              className={`px-2.5 py-1 text-[10px] font-black uppercase tracking-widest transition-colors ${
                speed === s
                  ? "bg-f1red text-white"
                  : "bg-panel text-muted hover:text-white hover:bg-[#38383f]"
              }`}
            >
              {s}×
            </button>
          ))}
        </div>
      </div>

      {/* ── Speed row — mobile only ──────────────────────────────── */}
      <div className="sm:hidden flex gap-px">
        {SPEEDS.map((s) => (
          <button
            key={s}
            onClick={() => setSpeed(s)}
            aria-pressed={speed === s}
            aria-label={`${s}x speed`}
            className={`flex-1 h-7 text-[10px] font-black uppercase tracking-widest transition-colors ${
              speed === s ? "bg-f1red text-white" : "bg-panel text-muted"
            }`}
          >
            {s}×
          </button>
        ))}
      </div>

      {/* ── Event jump chips row ─────────────────────────────────── */}
      <div
        className="flex gap-1 sm:overflow-x-auto sm:flex-wrap"
        style={{ touchAction: "pan-x" }}
      >
        {/* Countdown / qualifying phase chip — practice & qualifying only */}
        {countdownMs !== null && (
          <span className="flex items-center gap-1 shrink-0 px-2 h-7 bg-panel text-[10px] font-black tabular-nums uppercase tracking-widest">
            {qualiPhase && <span className="text-f1red">{qualiPhase}</span>}
            <span
              className={
                countdownMs <= 0
                  ? "text-muted"
                  : countdownMs <= 60_000
                    ? "text-[#f5a623]"
                    : "text-white"
              }
            >
              {countdownMs <= 0 ? "ENDED" : fmtTime(countdownMs)}
            </span>
          </span>
        )}
        <button
          onClick={() => jump(nextPit)}
          disabled={nextPit === null}
          className={CHIP_STRETCH}
          aria-label="Jump to next pit stop"
        >
          Pit ›
        </button>
        <button
          onClick={() => jump(nextFlag)}
          disabled={nextFlag === null}
          className={CHIP_STRETCH}
          aria-label="Jump to next flag or safety car"
        >
          Flag ›
        </button>
        <button
          onClick={() => jump(nextPass)}
          disabled={nextPass === null}
          className={CHIP_STRETCH}
          aria-label="Jump to next overtake"
        >
          Pass ›
        </button>
        <button
          onClick={() => jump(nextRadio)}
          disabled={nextRadio === null}
          className={CHIP_STRETCH}
          aria-label="Jump to next radio message"
        >
          Radio ›
        </button>
      </div>
    </div>
  );
}
