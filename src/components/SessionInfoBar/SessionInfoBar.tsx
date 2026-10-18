import { useEffect, useMemo, useState } from "react";
import type { Driver, Lap, RaceControl } from "@/api/types";
import { useSettings } from "@/stores/settings";
import { teamColor } from "@/utils/color";
import { toDisplayTemperature, temperatureUnitLabel } from "@/utils/units";
import {
  normalizeRaceControl,
  type NormalizedRaceControlEvent,
} from "@/timeline/raceControl";
import { COMMENTARY_BADGE_CLASS } from "@/components/CommentaryPanels/commentaryList";
import {
  raceControlEventAccent,
  raceControlEventBadge,
} from "@/components/RaceControl/eventStyle";

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
}

function deriveLatestMessage(
  events: NormalizedRaceControlEvent[],
  sessionTimeMs: number,
): NormalizedRaceControlEvent | null {
  let last: NormalizedRaceControlEvent | null = null;
  for (const e of events) {
    if (e.ms > sessionTimeMs) break;
    last = e;
  }
  return last;
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
}: Readonly<Props>) {
  const lightMode = useSettings((s) => s.lightMode);
  const metricSystem = useSettings((s) => s.metricSystem);
  const [isLapDialogOpen, setIsLapDialogOpen] = useState(false);
  const [lapInput, setLapInput] = useState("");
  const [lapError, setLapError] = useState<string | null>(null);
  const currentT = sessionStartMs + sessionTimeMs;

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

  const normalizedRaceControl = useMemo(
    () => normalizeRaceControl(raceControl, sessionStartMs),
    [raceControl, sessionStartMs],
  );
  const latestMsg = useMemo(
    () => deriveLatestMessage(normalizedRaceControl, sessionTimeMs),
    [normalizedRaceControl, sessionTimeMs],
  );
  const latestMsgDriver =
    latestMsg?.driverNumber != null
      ? drivers.find((d) => d.driver_number === latestMsg.driverNumber)
      : undefined;
  const latestMsgBadge = latestMsg ? raceControlEventBadge(latestMsg) : null;
  const latestMsgAccent = latestMsg
    ? raceControlEventAccent(latestMsg, latestMsgDriver?.team_colour)
    : null;
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
    <div className="shrink-0 flex items-stretch overflow-x-auto border-b border-panel bg-track text-[10px] font-bold uppercase tracking-[0.1em]">
      {/* Left tile: qualifying action in quali; countdown in timed practice; lap counter in race */}
      {showQualiEliminationTile ? (
        <button
          type="button"
          onClick={onShowEliminations}
          className="flex shrink-0 items-center gap-2 border-r border-panel px-2.5 py-2 text-[10px] font-black uppercase tracking-[0.12em] text-white transition-colors hover:bg-white/5 hover:text-f1red sm:px-4 sm:tracking-[0.16em]"
          aria-label="Show eliminated drivers"
          title="Show eliminated drivers"
        >
          <span className="rounded bg-f1red px-1.5 py-0.5 text-[9px] font-black tracking-[0.16em] text-white">
            {qualiPhase}
          </span>
          <span className="font-mono text-[11px] tabular-nums text-white/90">
            {countdownMs <= 0 ? "00:00" : fmtElapsed(countdownMs)}
          </span>
          <span className="text-[10px] font-black tracking-[0.12em] text-white">
            Eliminated
          </span>
        </button>
      ) : showTimedCountdownTile ? (
        <div className="flex shrink-0 items-center justify-center gap-2 border-r border-panel px-2.5 py-2 sm:justify-start sm:px-4">
          <span className="text-muted">Countdown</span>
          <span className="text-white tabular-nums font-mono">
            {countdownMs <= 0 ? "00:00" : fmtElapsed(countdownMs)}
          </span>
        </div>
      ) : (
        <div className="flex shrink-0 items-center justify-center gap-2 border-r border-panel px-2.5 py-2 sm:justify-start sm:px-4">
          <span className="text-muted">Lap</span>
          <button
            type="button"
            onClick={() => setIsLapDialogOpen(true)}
            className="tabular-nums text-[13px] font-black transition-colors hover:text-f1red"
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
        <span className="text-white tabular-nums font-mono">
          {fmtElapsed(sessionTimeMs)}
        </span>
      </div>

      {/* Weather temperatures */}
      <div className="flex shrink-0 items-center justify-center gap-2 border-r border-panel px-2.5 py-2 sm:justify-start sm:px-4">
        <span className="text-muted">Air</span>
        <span className="text-white tabular-nums font-mono">
          {fmtTemp(airTemp, metricSystem)}
        </span>
      </div>
      <div className="flex shrink-0 items-center justify-center gap-2 border-r border-panel px-2.5 py-2 sm:justify-start sm:px-4">
        <span className="text-muted">Track</span>
        <span className="text-white tabular-nums font-mono">
          {fmtTemp(trackTemp, metricSystem)}
        </span>
      </div>

      {onShowEliminations && !showQualiEliminationTile && (
        <button
          onClick={onShowEliminations}
          className="shrink-0 border-r border-panel px-3 py-2 text-[10px] font-black uppercase tracking-[0.12em] text-white transition-colors hover:bg-white/5 hover:text-f1red sm:px-4 sm:tracking-[0.16em]"
        >
          <span className="sm:hidden">Out</span>
          <span className="hidden sm:inline">Eliminated</span>
        </button>
      )}

      {onShowResults && (
        <button
          onClick={onShowResults}
          className="shrink-0 border-r border-panel px-3 py-2 text-[10px] font-black uppercase tracking-[0.12em] text-white transition-colors hover:bg-white/5 hover:text-f1red sm:px-4 sm:tracking-[0.16em]"
        >
          <span className="sm:hidden">Results</span>
          <span className="hidden sm:inline">Show Results</span>
        </button>
      )}

      {/* Latest RC message */}
      {latestMsg && latestMsgBadge && (
        <div className="relative hidden min-w-0 flex-1 items-center gap-2 px-4 py-2 sm:flex">
          {latestMsgAccent && (
            <span
              aria-hidden="true"
              className="absolute inset-y-0 left-0 w-[4px]"
              style={latestMsgAccent}
            />
          )}
          {latestMsg.lapNumber !== null && (
            <span className="text-muted shrink-0">L{latestMsg.lapNumber}</span>
          )}
          <span
            className={`${COMMENTARY_BADGE_CLASS} ${latestMsgBadge.className}`}
            style={latestMsgBadge.style}
          >
            {latestMsgBadge.label}
          </span>
          {latestMsgDriver && (
            <span
              className="shrink-0 font-black"
              style={{ color: teamColor(latestMsgDriver.team_colour) }}
            >
              {latestMsgDriver.name_acronym}
            </span>
          )}
          <span className="text-white/70 truncate normal-case tracking-normal font-medium">
            {latestMsg.description}
          </span>
        </div>
      )}

      {isLapDialogOpen && (
        <div className="fixed inset-0 z-[230] flex items-center justify-center bg-black/70 px-3 py-6 backdrop-blur-sm">
          <div className="w-full max-w-sm border border-panel bg-track shadow-2xl">
            <div className="border-b border-panel px-4 py-3">
              <div className="text-[10px] font-black uppercase tracking-[0.2em] text-f1red">
                Jump To Lap
              </div>
              <div className="mt-1 text-xs text-white/70 normal-case tracking-normal">
                Enter a lap number between 1 and {selectableLapMax}.
              </div>
            </div>
            <div className="space-y-3 px-4 py-4 normal-case tracking-normal">
              <label
                htmlFor="lap-jump-input"
                className="block text-[11px] font-semibold uppercase tracking-[0.14em] text-muted"
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
                className="w-full border border-panel bg-track px-3 py-2 text-sm font-semibold text-white outline-none transition-colors focus:border-f1red"
                autoFocus
              />
              {lapError && (
                <div className="text-xs text-[#ff7b7b]">{lapError}</div>
              )}
            </div>
            <div className="flex items-center justify-end gap-2 border-t border-panel px-4 py-3">
              <button
                type="button"
                onClick={() => setIsLapDialogOpen(false)}
                className="border border-panel bg-track px-3 py-1.5 text-[10px] font-black uppercase tracking-[0.14em] text-muted transition-colors hover:text-white"
              >
                Cancel
              </button>
              <button
                type="button"
                onClick={submitLapSelection}
                className="border border-f1red bg-f1red px-3 py-1.5 text-[10px] font-black uppercase tracking-[0.14em] text-white transition-colors hover:brightness-110"
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
