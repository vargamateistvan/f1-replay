import { useCallback, useEffect, useRef, useState } from "react";
import {
  FastForward,
  Pause,
  Play,
  Rewind,
  SkipBack,
  SkipForward,
} from "lucide-react";
import { useTimeline } from "@/timeline/clock";
import { useMediaQuery } from "@/hooks/useMediaQuery";
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
  incidentReplayHint?: string | null;
  /** Show a countdown badge (timed sessions: practice / qualifying) */
  countdownMs?: number | null;
  /** Active qualifying phase label e.g. "Q1" — shown alongside the countdown */
  qualiPhase?: string | null;
  /** Session-relative start times for qualifying phase jumps. */
  q2StartMs?: number | null;
  q3StartMs?: number | null;
  mobileInline?: boolean;
  showSpeedControls?: boolean;
  showEventChips?: boolean;
}

function fmtTime(ms: number) {
  if (ms < 0) ms = 0;
  const s = Math.floor(ms / 1000);
  const m = Math.floor(s / 60);
  const h = Math.floor(m / 60);
  const pad = (n: number) => String(n).padStart(2, "0");
  return h > 0
    ? `${h}:${pad(m % 60)}:${pad(s % 60)}`
    : `${pad(m)}:${pad(s % 60)}`;
}

function markerTooltip(label: string, ms: number) {
  return `${label} at ${fmtTime(ms)}`;
}

const JUMP_BTN =
  "flex h-8 w-6 items-center justify-center text-xs bg-panel text-muted transition-colors shrink-0 hover:text-white hover:bg-[#38383f] sm:w-7 disabled:opacity-30 disabled:hover:bg-panel disabled:hover:text-muted";
const CHIP_STRETCH =
  "h-7 shrink-0 px-3 flex items-center justify-center text-[10px] font-black uppercase tracking-widest bg-panel text-muted hover:text-white hover:bg-[#38383f] transition-colors sm:flex-none sm:px-3 disabled:opacity-30 disabled:hover:bg-panel disabled:hover:text-muted";

function SpeedButtons({ className }: { className?: string }) {
  const { speed, setSpeed } = useTimeline();
  return (
    <div className={className}>
      {SPEEDS.map((s) => (
        <button
          key={s}
          onClick={() => setSpeed(s)}
          aria-pressed={speed === s}
          aria-label={`${s}x speed`}
          className={`text-[10px] font-black uppercase tracking-widest transition-colors ${
            speed === s
              ? "bg-f1red text-white"
              : "bg-panel text-muted hover:text-white hover:bg-[#38383f]"
          }`}
        >
          {s}×
        </button>
      ))}
    </div>
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
  incidentReplayHint = null,
  countdownMs = null,
  qualiPhase = null,
  q2StartMs = null,
  q3StartMs = null,
  mobileInline = false,
  showSpeedControls = true,
  showEventChips = true,
}: Props) {
  const { t, playing, toggle, setT, setPlaying } = useTimeline();
  const [showMarkers, setShowMarkers] = useState(true);
  const isCompactViewport = useMediaQuery("(max-width: 639px)");
  const hasClampedRef = useRef(false);

  // Clamp playhead to duration end and stop playback when reached.
  useEffect(() => {
    if (durationMs <= 0) {
      hasClampedRef.current = false;
      return;
    }
    if (t >= durationMs && !hasClampedRef.current) {
      hasClampedRef.current = true;
      if (t !== durationMs) setT(durationMs);
      if (playing) setPlaying(false);
    } else if (t < durationMs) {
      hasClampedRef.current = false;
    }
  }, [durationMs, t, playing, setT, setPlaying]);

  const clamp = useCallback(
    (v: number) => Math.max(0, durationMs > 0 ? Math.min(v, durationMs) : v),
    [durationMs],
  );

  const jump = useCallback(
    (target: number | null) => {
      if (target !== null) setT(clamp(target));
    },
    [clamp, setT],
  );

  const prevLap = prevBefore(lapStarts, t);
  const nextLap = nextAfter(lapStarts, t);
  const nextPit = nextAfter(pitTimes, t);
  const nextFlag = nextAfter(flagTimes, t);
  const nextSafetyCar = nextAfter(safetyCarTimes, t);
  const nextPass = nextAfter(overtakeTimes, t);
  const nextRadio = nextAfter(radioTimes, t);

  return (
    <div
      className={`flex flex-col gap-1.5 py-2 bg-track border-t border-panel sm:gap-2 sm:py-2.5 ${
        mobileInline
          ? ""
          : "fixed inset-x-0 z-20 md:static md:inset-auto md:z-auto"
      }`}
      style={
        mobileInline
          ? {
              paddingLeft: "max(0.75rem, env(safe-area-inset-left))",
              paddingRight: "max(0.75rem, env(safe-area-inset-right))",
            }
          : {
              paddingLeft: "max(0.75rem, env(safe-area-inset-left))",
              paddingRight: "max(0.75rem, env(safe-area-inset-right))",
              bottom: "calc(48px + env(safe-area-inset-bottom))",
            }
      }
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
          <SkipBack size={14} strokeWidth={2.2} aria-hidden="true" />
        </button>

        {/* Prev lap */}
        <button
          onClick={() => jump(prevLap)}
          disabled={prevLap === null}
          className={JUMP_BTN}
          aria-label="Lap start"
          title="Lap start ([)"
        >
          <Rewind size={14} strokeWidth={2.2} aria-hidden="true" />
        </button>

        {/* Play / pause */}
        <button
          onClick={toggle}
          className="w-8 h-8 bg-f1red text-white font-bold flex items-center justify-center hover:bg-red-600 transition-colors shrink-0"
          aria-label={playing ? "Pause" : "Play"}
          title="Play / pause (Space)"
        >
          {playing ? (
            <Pause size={14} strokeWidth={2.4} aria-hidden="true" />
          ) : (
            <Play size={14} strokeWidth={2.4} aria-hidden="true" />
          )}
        </button>

        {/* Next lap */}
        <button
          onClick={() => jump(nextLap)}
          disabled={nextLap === null}
          className={JUMP_BTN}
          aria-label="Next lap"
          title="Next lap (])"
        >
          <FastForward size={14} strokeWidth={2.2} aria-hidden="true" />
        </button>

        {/* End */}
        <button
          onClick={() => jump(durationMs)}
          disabled={durationMs <= 0 || t >= durationMs}
          className={JUMP_BTN}
          aria-label="Jump to end"
          title="Jump to end"
        >
          <SkipForward size={14} strokeWidth={2.2} aria-hidden="true" />
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
          {durationMs > 0 && showMarkers && !isCompactViewport && (
            <div className="absolute inset-0 pointer-events-none">
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
                const tooltip = markerTooltip(marker.label, marker.ms);
                return (
                  <button
                    key={marker.id}
                    type="button"
                    title={tooltip}
                    aria-label={`Jump to incident: ${tooltip}`}
                    onClick={() => jump(marker.ms)}
                    className="group absolute top-1/2 h-5 w-5 rounded-full pointer-events-auto"
                    style={{
                      left: `${left}%`,
                      transform: "translate(-50%, -50%)",
                    }}
                  >
                    <span
                      className={`absolute left-1/2 top-1/2 h-4 w-1.5 -translate-x-1/2 -translate-y-1/2 rounded ${color} opacity-90 ring-1 ring-black/35 transition-opacity group-hover:opacity-100`}
                    />
                    <span className="pointer-events-none absolute bottom-full left-1/2 z-20 mb-2 w-max max-w-[180px] -translate-x-1/2 whitespace-nowrap rounded border border-panel bg-[#101117] px-2 py-1 text-[10px] font-black uppercase tracking-wider text-white opacity-0 shadow-[0_8px_20px_rgba(0,0,0,0.45)] transition-opacity group-hover:opacity-100 group-focus-visible:opacity-100">
                      {tooltip}
                    </span>
                  </button>
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
          (markerSummary.critical ?? 0) + (markerSummary.warning ?? 0) > 0 && (
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
        {showSpeedControls && (
          <SpeedButtons className="hidden sm:flex gap-px shrink-0 [&>button]:px-2.5 [&>button]:py-1" />
        )}
      </div>

      {/* ── Speed row — mobile only ──────────────────────────────── */}
      {showSpeedControls && (
        <SpeedButtons className="sm:hidden flex gap-px [&>button]:flex-1 [&>button]:h-7" />
      )}

      {/* ── Event jump chips row ─────────────────────────────────── */}
      {showEventChips && (
        <div
          className="flex gap-1 overflow-x-auto pb-0.5 sm:flex-wrap"
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
          {(q2StartMs !== null || q3StartMs !== null) && (
            <>
              <button
                onClick={() => jump(q2StartMs)}
                disabled={q2StartMs === null || q2StartMs <= t}
                className={CHIP_STRETCH}
                aria-label="Forward to Q2"
              >
                Q2 ›
              </button>
              <button
                onClick={() => jump(q3StartMs)}
                disabled={q3StartMs === null || q3StartMs <= t}
                className={CHIP_STRETCH}
                aria-label="Forward to Q3"
              >
                Q3 ›
              </button>
            </>
          )}
          <button
            onClick={() => {
              if (onReplayNextIncident) onReplayNextIncident();
            }}
            disabled={!canReplayNextIncident}
            className={CHIP_STRETCH}
            aria-label="Replay next incident window"
          >
            Incident ›
          </button>
          {incidentReplayHint && canReplayNextIncident && (
            <span className="h-7 flex items-center px-2 text-[9px] font-black uppercase tracking-widest bg-amber-500/20 text-amber-300 border border-amber-500/30 shrink-0">
              {incidentReplayHint}
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
      )}
    </div>
  );
}
