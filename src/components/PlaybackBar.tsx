import { useState } from "react";
import { useTimeline } from "@/timeline/clock";
import { SPEEDS } from "@/constants";
import { nextAfter, prevBefore } from "@/timeline/events";

interface Props {
  durationMs: number;
  // Session-relative ms marker arrays (sorted ascending) for jump-to-event.
  lapStarts?: number[];
  pitTimes?: number[];
  flagTimes?: number[];
  overtakeTimes?: number[];
  radioTimes?: number[];
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
const CHIP =
  "px-2 h-8 flex items-center text-[10px] font-black uppercase tracking-widest bg-panel text-muted hover:text-white hover:bg-[#38383f] transition-colors shrink-0 disabled:opacity-30 disabled:hover:bg-panel disabled:hover:text-muted";

export function PlaybackBar({
  durationMs,
  lapStarts = [],
  pitTimes = [],
  flagTimes = [],
  overtakeTimes = [],
  radioTimes = [],
}: Props) {
  const { t, playing, speed, toggle, setT, setSpeed } = useTimeline();
  const [showChips, setShowChips] = useState(false);

  const clamp = (v: number) =>
    Math.max(0, durationMs > 0 ? Math.min(v, durationMs) : v);
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
    <div className="flex flex-col sm:flex-row sm:items-center gap-2 px-4 py-2.5 bg-track border-t border-panel">
      {/* Row 1: Transport, scrubber, time, speed (stack on phone, row on sm+) */}
      <div className="flex items-center gap-2 w-full">
        {/* Transport cluster: prev-lap · play · next-lap */}
        <button
          onClick={() => jump(prevLap)}
          disabled={prevLap === null}
          className={JUMP_BTN}
          aria-label="Previous lap"
          title="Previous lap ([)"
        >
          ⏮
        </button>
        <button
          onClick={toggle}
          className="w-8 h-8 bg-f1red text-white font-bold flex items-center justify-center hover:bg-red-600 transition-colors shrink-0"
          aria-label={playing ? "Pause" : "Play"}
          title="Play / pause (Space)"
        >
          {playing ? "⏸" : "▶"}
        </button>
        <button
          onClick={() => jump(nextLap)}
          disabled={nextLap === null}
          className={JUMP_BTN}
          aria-label="Next lap"
          title="Next lap (])"
        >
          ⏭
        </button>

        <span className="text-muted font-mono text-xs tabular-nums w-12 text-right shrink-0 ml-1">
          {fmtTime(t)}
        </span>

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

        <span className="text-muted font-mono text-xs tabular-nums w-12 shrink-0">
          {fmtTime(durationMs)}
        </span>

        {/* Speed buttons — hidden on phone (shown in expanded chips row instead) */}
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

        {/* Toggle button for jump chips + speed (phone only) */}
        <button
          onClick={() => setShowChips(!showChips)}
          className="sm:hidden w-7 h-8 flex items-center justify-center text-xs bg-panel text-muted hover:text-white hover:bg-[#38383f] transition-colors shrink-0"
          aria-label="Jump to event"
          title="Jump events"
        >
          ⋯
        </button>
      </div>

      {/* Row 2: Speed + jump chips (hidden on phone by default, visible on sm+, or toggled by ⋯) */}
      <div
        className={`flex items-center gap-1 overflow-x-auto sm:flex ${showChips ? "flex" : "hidden sm:flex"}`}
      >
        {/* Speed buttons on mobile (desktop shows them in row 1) */}
        <div className="sm:hidden flex gap-px shrink-0 mr-1">
          {SPEEDS.map((s) => (
            <button
              key={s}
              onClick={() => setSpeed(s)}
              aria-pressed={speed === s}
              aria-label={`${s}x speed`}
              className={`px-2 py-1 text-[10px] font-black uppercase tracking-widest transition-colors ${
                speed === s
                  ? "bg-f1red text-white"
                  : "bg-panel text-muted hover:text-white hover:bg-[#38383f]"
              }`}
            >
              {s}×
            </button>
          ))}
        </div>
        <div className="sm:hidden w-px h-5 bg-[#38383f] shrink-0" />
        <button
          onClick={() => jump(nextPit)}
          disabled={nextPit === null}
          className={CHIP}
          aria-label="Jump to next pit stop"
          title="Next pit stop"
        >
          Pit›
        </button>
        <button
          onClick={() => jump(nextFlag)}
          disabled={nextFlag === null}
          className={CHIP}
          aria-label="Jump to next flag or safety car"
          title="Next flag / SC"
        >
          Flag›
        </button>
        <button
          onClick={() => jump(nextPass)}
          disabled={nextPass === null}
          className={CHIP}
          aria-label="Jump to next overtake"
          title="Next overtake"
        >
          Pass›
        </button>
        <button
          onClick={() => jump(nextRadio)}
          disabled={nextRadio === null}
          className={CHIP}
          aria-label="Jump to next radio message"
          title="Next radio"
        >
          Radio›
        </button>
      </div>
    </div>
  );
}
