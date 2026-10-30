import { useEffect, useMemo, useState } from "react";
import type { Driver, Lap, RaceControl } from "@/api/types";
import { useSettings } from "@/stores/settings";
import { toDisplayTemperature, temperatureUnitLabel } from "@/utils/units";
import {
  normalizeRaceControl,
  type NormalizedRaceControlEvent,
} from "@/timeline/raceControl";
import { RaceControlTicker } from "./RaceControlTicker";

interface Props {
  laps: Lap[];
  raceControl: RaceControl[];
  /** Resolves the driver named in the latest message (acronym + team colour). */
  drivers?: Driver[];
  sessionTimeMs: number;
  sessionStartMs: number;
  qualiPhase?: string | null;
  countdownMs?: number | null;
  airTemp?: number | null;
  trackTemp?: number | null;
  lightsOutMs?: number | null;
  isRaceSession?: boolean;
  totalLapCount?: number | null;
  onShowEliminations?: () => void;
  onShowResults?: () => void;
  onJumpToSessionTime?: (sessionTimeMs: number) => void;
  /** False hides the race control ticker below `md` (the page renders it elsewhere). */
  showTickerOnMobile?: boolean;
}

function deriveLatestMessage(
  events: NormalizedRaceControlEvent[],
  sessionTimeMs: number,
): { event: NormalizedRaceControlEvent; sameTimeCount: number } | null {
  let last: NormalizedRaceControlEvent | null = null;
  let sameTimeCount = 0;
  for (const e of events) {
    if (e.ms > sessionTimeMs) break;
    sameTimeCount = last !== null && e.ms === last.ms ? sameTimeCount + 1 : 0;
    last = e;
  }
  return last ? { event: last, sameTimeCount } : null;
}

/** Ticker for the latest race control message at the playhead (nothing before the first one). */
export function LatestRaceControlTicker({
  raceControl,
  drivers = [],
  sessionTimeMs,
  sessionStartMs,
  onJumpToSessionTime,
  className,
}: Readonly<{
  raceControl: RaceControl[];
  drivers?: Driver[];
  sessionTimeMs: number;
  sessionStartMs: number;
  onJumpToSessionTime?: (sessionTimeMs: number) => void;
  className?: string;
}>) {
  const normalizedRaceControl = useMemo(
    () => normalizeRaceControl(raceControl, sessionStartMs),
    [raceControl, sessionStartMs],
  );
  const latestMsg = useMemo(
    () => deriveLatestMessage(normalizedRaceControl, sessionTimeMs),
    [normalizedRaceControl, sessionTimeMs],
  );
  if (!latestMsg) return null;
  const driver =
    latestMsg.event.driverNumber != null
      ? drivers.find((d) => d.driver_number === latestMsg.event.driverNumber)
      : undefined;
  return (
    <RaceControlTicker
      key={latestMsg.event.id}
      event={latestMsg.event}
      sameTimeCount={latestMsg.sameTimeCount}
      driver={driver}
      sessionTimeMs={sessionTimeMs}
      onJumpToSessionTime={onJumpToSessionTime}
      className={className}
    />
  );
}

function fmtElapsed(ms: number): string {
  const s = Math.max(0, Math.floor(ms / 1000));
  const h = Math.floor(s / 3600);
  const m = Math.floor((s % 3600) / 60);
  const sec = s % 60;
  if (h > 0)
    return `${h}:${String(m).padStart(2, "0")}:${String(sec).padStart(2, "0")}`;
  return `${String(m).padStart(2, "0")}:${String(sec).padStart(2, "0")}`;
}

function fmtTemp(
  temp: number | null,
  metricSystem: "metric" | "imperial",
): string {
  if (temp === null || !Number.isFinite(temp)) return "--";
  const value = Math.round(toDisplayTemperature(temp, metricSystem));
  return `${value}°${temperatureUnitLabel(metricSystem)}`;
}

export function SessionInfoBar({
  laps,
  raceControl,
  drivers = [],
  sessionTimeMs,
  sessionStartMs,
  qualiPhase = null,
  countdownMs = null,
  airTemp = null,
  trackTemp = null,
  lightsOutMs,
  isRaceSession,
  totalLapCount = null,
  onShowEliminations,
  onShowResults,
  onJumpToSessionTime,
  showTickerOnMobile = true,
}: Readonly<Props>) {
  const lightMode = useSettings((s) => s.lightMode);
  const metricSystem = useSettings((s) => s.metricSystem);
  const [isLapDialogOpen, setIsLapDialogOpen] = useState(false);
  const [lapInput, setLapInput] = useState("");
  const [lapError, setLapError] = useState<string | null>(null);
  const currentT = sessionStartMs + sessionTimeMs;

  const isQualifyingBreak = useMemo(() => {
    if (qualiPhase !== "Q1" && qualiPhase !== "Q2") return false;
    let latestStatus: string | null = null;
    let latestMs = -Infinity;
    for (const entry of raceControl) {
      const status = /^SESSION (STARTED|RESUMED|ABORTED|SUSPENDED|FINISHED)\b/i.exec(
        entry.message,
      )?.[1];
      if (!status) continue;
      const ms = Date.parse(entry.date);
      if (ms <= currentT && ms >= latestMs) {
        latestMs = ms;
        latestStatus = status.toUpperCase();
      }
    }
    return latestStatus === "FINISHED";
  }, [raceControl, currentT, qualiPhase]);

  const formationLapColor = lightMode ? "#4a5575" : "#c8c8ff";

  const currentLap = useMemo(() => {
    let max = 0;
    for (const l of laps) {
      if (!l.date_start) continue;
      if (new Date(l.date_start).getTime() <= currentT && l.lap_number > max)
        max = l.lap_number;
    }
    return max > 0 ? max : null;
  }, [laps, currentT]);

  const lapStartsByNumber = useMemo(() => {
    const starts = new Map<number, number>();
    for (const lap of laps) {
      if (!lap.date_start) continue;
      const absoluteMs = new Date(lap.date_start).getTime();
      const relativeMs = absoluteMs - sessionStartMs;
      if (!Number.isFinite(relativeMs) || relativeMs < 0) continue;
      const existing = starts.get(lap.lap_number);
      if (existing === undefined || relativeMs < existing) {
        starts.set(lap.lap_number, relativeMs);
      }
    }
    return starts;
  }, [laps, sessionStartMs]);

  const selectableLapMax = useMemo(() => {
    const observedMax = lapStartsByNumber.size
      ? Math.max(...Array.from(lapStartsByNumber.keys()))
      : 1;
    if (totalLapCount !== null && totalLapCount > 0) {
      return Math.max(totalLapCount, observedMax);
    }
    return observedMax;
  }, [lapStartsByNumber, totalLapCount]);

  const isFormationLap =
    isRaceSession && lightsOutMs != null
      ? sessionTimeMs >= 0 && sessionTimeMs < lightsOutMs
      : false;

  let lapDisplay: string | number = "—";
  if (isFormationLap) {
    lapDisplay = "F";
  } else if (currentLap !== null && totalLapCount !== null) {
    lapDisplay = `${currentLap}/${totalLapCount}`;
  } else if (currentLap !== null) {
    lapDisplay = currentLap;
  }

  useEffect(() => {
    if (!isLapDialogOpen) return;
    const defaultLap = currentLap ?? 1;
    setLapInput(String(defaultLap));
    setLapError(null);
  }, [isLapDialogOpen, currentLap]);

  useEffect(() => {
    if (!isLapDialogOpen) return;
    function onKeyDown(event: KeyboardEvent) {
      if (event.key === "Escape") {
        setIsLapDialogOpen(false);
      }
    }
    globalThis.addEventListener("keydown", onKeyDown);
    return () => globalThis.removeEventListener("keydown", onKeyDown);
  }, [isLapDialogOpen]);

  function submitLapSelection() {
    const parsed = Number(lapInput);
    if (!Number.isInteger(parsed)) {
      setLapError("Enter a whole lap number.");
      return;
    }
    if (parsed < 1 || parsed > selectableLapMax) {
      setLapError(`Enter a lap between 1 and ${selectableLapMax}.`);
      return;
    }
    const targetMs = lapStartsByNumber.get(parsed);
    if (targetMs === undefined) {
      setLapError(`Lap ${parsed} is not available in loaded timing data.`);
      return;
    }
    onJumpToSessionTime?.(targetMs);
    setIsLapDialogOpen(false);
  }

  if (sessionStartMs === 0) return null;

  const showQualiEliminationTile =
    onShowEliminations !== undefined &&
    qualiPhase !== null &&
    typeof countdownMs === "number";
  const showTimedCountdownTile =
    !showQualiEliminationTile &&
    !isRaceSession &&
    typeof countdownMs === "number";

  return (
    <div className="shrink-0 flex flex-col border-b border-panel bg-track text-caption font-bold uppercase tracking-widest sm:flex-row sm:items-stretch">
      {/* Mobile: tiles scroll sideways and the race control ticker gets its own row below */}
      <div className="flex min-w-0 items-stretch overflow-x-auto">
        {/* Left tile: qualifying action in quali; countdown in timed practice; lap counter in race */}
        {showQualiEliminationTile ? (
          <button
            type="button"
            onClick={onShowEliminations}
            className="flex shrink-0 items-center gap-2 border-r border-panel px-2.5 py-2 text-caption font-black uppercase tracking-caps text-fg transition-colors hover:bg-fg/5 hover:text-f1red sm:px-4 sm:tracking-eyebrow"
            aria-label="Show eliminated drivers"
            title="Show eliminated drivers"
          >
            <span className="rounded-sm bg-f1red px-1.5 py-0.5 text-tiny font-black tracking-eyebrow text-white">
              {qualiPhase}
            </span>
            <span className="font-mono text-small tabular-nums text-fg/90">
              {isQualifyingBreak
                ? "Break"
                : countdownMs <= 0
                  ? "00:00"
                  : fmtElapsed(countdownMs)}
            </span>
            <span className="text-caption font-black tracking-caps text-fg">
              Eliminated
            </span>
          </button>
        ) : showTimedCountdownTile ? (
          <div className="flex shrink-0 items-center justify-center gap-2 border-r border-panel px-2.5 py-2 sm:justify-start sm:px-4">
            <span className="text-muted">
              {isQualifyingBreak ? "Break" : "Countdown"}
            </span>
            <span className="text-fg tabular-nums font-mono">
              {isQualifyingBreak
                ? qualiPhase
                : countdownMs <= 0
                  ? "00:00"
                  : fmtElapsed(countdownMs)}
            </span>
          </div>
        ) : (
          <div className="flex shrink-0 items-center justify-center gap-2 border-r border-panel px-2.5 py-2 sm:justify-start sm:px-4">
            <span className="text-muted">Lap</span>
            <button
              type="button"
              onClick={() => setIsLapDialogOpen(true)}
              className="tabular-nums text-body font-black transition-colors hover:text-f1red"
              style={{
                color: isFormationLap ? formationLapColor : undefined,
              }}
              title={`Jump to lap (1-${selectableLapMax})`}
            >
              {lapDisplay}
            </button>
          </div>
        )}

        {/* Elapsed time */}
        <div className="flex shrink-0 items-center justify-center gap-2 border-r border-panel px-2.5 py-2 sm:justify-start sm:px-4">
          <span className="text-muted">Time</span>
          <span className="text-fg tabular-nums font-mono">
            {fmtElapsed(sessionTimeMs)}
          </span>
        </div>

        {/* Weather temperatures */}
        <div className="flex shrink-0 items-center justify-center gap-2 border-r border-panel px-2.5 py-2 sm:justify-start sm:px-4">
          <span className="text-muted">Air</span>
          <span className="text-fg tabular-nums font-mono">
            {fmtTemp(airTemp, metricSystem)}
          </span>
        </div>
        <div className="flex shrink-0 items-center justify-center gap-2 border-r border-panel px-2.5 py-2 sm:justify-start sm:px-4">
          <span className="text-muted">Track</span>
          <span className="text-fg tabular-nums font-mono">
            {fmtTemp(trackTemp, metricSystem)}
          </span>
        </div>

        {onShowEliminations && !showQualiEliminationTile && (
          <button
            onClick={onShowEliminations}
            className="shrink-0 border-r border-panel px-3 py-2 text-caption font-black uppercase tracking-caps text-fg transition-colors hover:bg-fg/5 hover:text-f1red sm:px-4 sm:tracking-eyebrow"
          >
            <span className="sm:hidden">Out</span>
            <span className="hidden sm:inline">Eliminated</span>
          </button>
        )}

        {onShowResults && (
          <button
            onClick={onShowResults}
            className="shrink-0 border-r border-panel px-3 py-2 text-caption font-black uppercase tracking-caps text-fg transition-colors hover:bg-fg/5 hover:text-f1red sm:px-4 sm:tracking-eyebrow"
          >
            <span className="sm:hidden">Results</span>
            <span className="hidden sm:inline">Show Results</span>
          </button>
        )}
      </div>

      {/* Latest RC message */}
      <LatestRaceControlTicker
        raceControl={raceControl}
        drivers={drivers}
        sessionTimeMs={sessionTimeMs}
        sessionStartMs={sessionStartMs}
        onJumpToSessionTime={onJumpToSessionTime}
        className={showTickerOnMobile ? "" : "hidden md:flex"}
      />

      {isLapDialogOpen && (
        <div className="fixed inset-0 z-modal flex items-center justify-center bg-black/70 px-3 py-6 backdrop-blur-sm">
          <div className="w-full max-w-sm border border-panel bg-track shadow-2xl">
            <div className="border-b border-panel px-4 py-3">
              <div className="text-caption font-black uppercase tracking-spaced text-f1red">
                Jump To Lap
              </div>
              <div className="mt-1 text-xs text-fg/70 normal-case tracking-normal">
                Enter a lap number between 1 and {selectableLapMax}.
              </div>
            </div>
            <div className="space-y-3 px-4 py-4 normal-case tracking-normal">
              <label
                htmlFor="lap-jump-input"
                className="block text-small font-semibold uppercase tracking-caps text-muted"
              >
                Lap Number
              </label>
              <input
                id="lap-jump-input"
                type="number"
                min={1}
                max={selectableLapMax}
                step={1}
                value={lapInput}
                onChange={(event) => {
                  setLapInput(event.target.value);
                  if (lapError) setLapError(null);
                }}
                onKeyDown={(event) => {
                  if (event.key === "Enter") {
                    event.preventDefault();
                    submitLapSelection();
                  }
                }}
                className="w-full border border-panel bg-track px-3 py-2 text-sm font-semibold text-fg outline-none transition-colors focus:border-f1red"
                autoFocus
              />
              {lapError && (
                <div className="text-xs text-red-fg">{lapError}</div>
              )}
            </div>
            <div className="flex items-center justify-end gap-2 border-t border-panel px-4 py-3">
              <button
                type="button"
                onClick={() => setIsLapDialogOpen(false)}
                className="border border-panel bg-track px-3 py-1.5 text-caption font-black uppercase tracking-caps text-muted transition-colors hover:text-fg"
              >
                Cancel
              </button>
              <button
                type="button"
                onClick={submitLapSelection}
                className="border border-f1red bg-f1red px-3 py-1.5 text-caption font-black uppercase tracking-caps text-white transition-colors hover:brightness-110"
              >
                Jump
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
