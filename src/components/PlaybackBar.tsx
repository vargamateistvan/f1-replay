import { useEffect, useState, type ReactNode } from "react";
import { useTimeline } from "@/timeline/clock";
import { SPEEDS } from "@/constants";
import { nextAfter, prevBefore } from "@/timeline/events";
import type { RaceControlMarker, MarkerSummary } from "@/timeline/raceControl";

interface Props {
  durationMs: number;
  lapStarts?: number[];
  pitTimes?: number[];
  flagTimes?: number[];
  safetyCarTimes?: number[];
  overtakeTimes?: number[];
  radioTimes?: number[];
  raceControlMarkers?: RaceControlMarker[];
  markerSummary?: MarkerSummary | null;
  canReplayNextIncident?: boolean;
  onReplayNextIncident?: () => void;
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
  "flex h-8 w-6 items-center justify-center text-xs bg-panel text-muted transition-colors shrink-0 hover:text-white hover:bg-[#38383f] sm:w-7 disabled:opacity-30 disabled:hover:bg-panel disabled:hover:text-muted";
const CHIP_STRETCH =
  "h-7 flex-1 flex items-center justify-center text-[10px] font-black uppercase tracking-widest bg-panel text-muted hover:text-white hover:bg-[#38383f] transition-colors sm:flex-none sm:shrink-0 sm:px-3 disabled:opacity-30 disabled:hover:bg-panel disabled:hover:text-muted";

function TransportIcon({ children }: { children: ReactNode }) {
  return (
    <svg
      width="14"
      height="14"
      viewBox="0 0 14 14"
      fill="none"
      className="shrink-0"
      aria-hidden="true"
    >
      {children}
    </svg>
  );
}

function StartIcon() {
  return (
    <TransportIcon>
      <path
        d="M3.5 2.5v9"
        stroke="currentColor"
        strokeWidth="1.5"
        strokeLinecap="round"
      />
      <path d="M10.5 2.8 5.8 7l4.7 4.2V2.8Z" fill="currentColor" />
    </TransportIcon>
  );
}

function PrevLapIcon() {
  return (
    <TransportIcon>
      <path
        d="M3.5 2.5v9"
        stroke="currentColor"
        strokeWidth="1.5"
        strokeLinecap="round"
      />
      <path
        d="M9.8 3.2 6 7l3.8 3.8"
        stroke="currentColor"
        strokeWidth="1.5"
        strokeLinecap="round"
        strokeLinejoin="round"
      />
    </TransportIcon>
  );
}

function PlayIcon() {
  return (
    <TransportIcon>
      <path d="M4.5 3.2 10.8 7l-6.3 3.8V3.2Z" fill="currentColor" />
    </TransportIcon>
  );
}

function PauseIcon() {
  return (
    <TransportIcon>
      <path
        d="M4.5 3.2v7.6"
        stroke="currentColor"
        strokeWidth="1.8"
        strokeLinecap="round"
      />
      <path
        d="M9.5 3.2v7.6"
        stroke="currentColor"
        strokeWidth="1.8"
        strokeLinecap="round"
      />
    </TransportIcon>
  );
}

function NextLapIcon() {
  return (
    <TransportIcon>
      <path
        d="M10.5 2.5v9"
        stroke="currentColor"
        strokeWidth="1.5"
        strokeLinecap="round"
      />
      <path
        d="M4.2 3.2 8 7l-3.8 3.8"
        stroke="currentColor"
        strokeWidth="1.5"
        strokeLinecap="round"
        strokeLinejoin="round"
      />
    </TransportIcon>
  );
}

function EndIcon() {
  return (
    <TransportIcon>
      <path
        d="M10.5 2.5v9"
        stroke="currentColor"
        strokeWidth="1.5"
        strokeLinecap="round"
      />
      <path d="M3.5 2.8 8.2 7l-4.7 4.2V2.8Z" fill="currentColor" />
    </TransportIcon>
  );
}

export function PlaybackBar({
  durationMs,
  lapStarts = [],
  pitTimes = [],
  flagTimes = [],
  safetyCarTimes = [],
  overtakeTimes = [],
  radioTimes = [],
  raceControlMarkers = [],
  markerSummary = null,
  canReplayNextIncident = false,
  onReplayNextIncident,
  countdownMs = null,
  qualiPhase = null,
}: Props) {
  const { t, playing, speed, toggle, setT, setSpeed, setPlaying } =
    useTimeline();
  const [showMarkers, setShowMarkers] = useState(true);

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
  const nextSafetyCar = nextAfter(safetyCarTimes, t);
  const nextPass = nextAfter(overtakeTimes, t);
  const nextRadio = nextAfter(radioTimes, t);

  return (
    <div
      className="flex flex-col gap-1.5 py-2 bg-track border-t border-panel sm:gap-2 sm:py-2.5 sticky z-20 md:static md:z-auto"
      style={{
        paddingLeft: "max(0.75rem, env(safe-area-inset-left))",
        paddingRight: "max(0.75rem, env(safe-area-inset-right))",
        bottom: "calc(44px + env(safe-area-inset-bottom))",
      }}
    >
      {/* ── Transport + scrubber row ─────────────────────────────── */}
      <div className="flex items-center gap-1.5 w-full sm:gap-2">
        {/* Start */}
        <button
          onClick={() => jump(0)}
          disabled={t <= 0}
          className={JUMP_BTN}
          aria-label="Jump to start"
          title="Jump to start"
        >
          <StartIcon />
        </button>

        {/* Prev lap */}
        <button
          onClick={() => jump(prevLap)}
          disabled={prevLap === null}
          className={JUMP_BTN}
          aria-label="Previous lap"
          title="Previous lap ([)"
        >
          <PrevLapIcon />
        </button>

        {/* Play / pause */}
        <button
          onClick={toggle}
          className="w-8 h-8 bg-f1red text-white font-bold flex items-center justify-center hover:bg-red-600 transition-colors shrink-0"
          aria-label={playing ? "Pause" : "Play"}
          title="Play / pause (Space)"
        >
          {playing ? <PauseIcon /> : <PlayIcon />}
        </button>

        {/* Next lap */}
        <button
          onClick={() => jump(nextLap)}
          disabled={nextLap === null}
          className={JUMP_BTN}
          aria-label="Next lap"
          title="Next lap (])"
        >
          <NextLapIcon />
        </button>

        {/* End */}
        <button
          onClick={() => jump(durationMs)}
          disabled={durationMs <= 0 || t >= durationMs}
          className={JUMP_BTN}
          aria-label="Jump to end"
          title="Jump to end"
        >
          <EndIcon />
        </button>

        {/* Current time */}
        <span className="text-muted font-mono text-xs tabular-nums w-9 text-right shrink-0 sm:w-10">
          {fmtTime(t)}
        </span>

        {/* Scrubber */}
        <div className="relative flex-1 h-4 flex items-center">
          <input
            type="range"
            min={0}
            max={durationMs}
            value={Math.min(t, durationMs)}
            onChange={(e) => setT(Number(e.target.value))}
            className="w-full h-1 cursor-pointer"
            style={{ touchAction: "none" }}
            aria-label="Seek"
          />
          {durationMs > 0 && showMarkers && raceControlMarkers.length > 0 && (
            <div className="absolute inset-0">
              {raceControlMarkers.map((marker) => {
                const left = (marker.ms / durationMs) * 100;
                if (!Number.isFinite(left) || left < 0 || left > 100)
                  return null;
                const color =
                  marker.severity === "critical"
                    ? "bg-red-500"
                    : marker.severity === "warning"
                      ? "bg-amber-400"
                      : "bg-slate-400";
                return (
                  <button
                    key={marker.id}
                    type="button"
                    title={`Jump to ${marker.label}`}
                    aria-label={`Jump to ${marker.label}`}
                    onClick={() => jump(marker.ms)}
                    className={`absolute top-0 h-4 w-1 rounded ${color} opacity-80 hover:opacity-100`}
                    style={{ left: `${left}%`, transform: "translateX(-50%)" }}
                  />
                );
              })}
            </div>
          )}
        </div>

        {/* Duration — hidden on mobile to reclaim scrubber space */}
        <span className="hidden sm:inline text-muted font-mono text-xs tabular-nums w-12 shrink-0">
          {fmtTime(durationMs)}
        </span>

        {/* Marker legend toggle — desktop only */}
        {markerSummary !== null &&
          (markerSummary?.critical ?? 0) + (markerSummary?.warning ?? 0) >
            0 && (
            <button
              type="button"
              onClick={() => setShowMarkers((v) => !v)}
              title={
                showMarkers
                  ? "Hide race-control markers"
                  : "Show race-control markers"
              }
              aria-pressed={showMarkers}
              className={`hidden sm:flex items-center gap-1 shrink-0 h-7 px-2 text-[9px] font-black uppercase tracking-widest transition-colors border ${
                showMarkers
                  ? "border-amber-500/60 text-amber-300 bg-amber-500/10 hover:bg-amber-500/20"
                  : "border-panel text-muted bg-panel hover:text-white"
              }`}
            >
              {markerSummary.critical > 0 && (
                <span className="flex items-center gap-0.5">
                  <span className="inline-block w-1.5 h-1.5 rounded-sm bg-red-500" />
                  {markerSummary.critical}
                </span>
              )}
              {markerSummary.warning > 0 && (
                <span className="flex items-center gap-0.5">
                  <span className="inline-block w-1.5 h-1.5 rounded-sm bg-amber-400" />
                  {markerSummary.warning}
                </span>
              )}
            </button>
          )}

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
        style={{ touchAction: "pan-x pan-y" }}
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
          onClick={() => onReplayNextIncident?.()}
          disabled={!canReplayNextIncident}
          className={CHIP_STRETCH}
          aria-label="Replay next incident window"
        >
          Incident ›
        </button>
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
          onClick={() => jump(nextSafetyCar)}
          disabled={nextSafetyCar === null}
          className={CHIP_STRETCH}
          aria-label="Jump to next safety car"
        >
          SC ›
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
