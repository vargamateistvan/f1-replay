import { useEffect, useMemo, useState } from "react";
import type { Lap, RaceControl } from "@/api/types";
import { useSettings } from "@/stores/settings";
import { toDisplayTemperature, temperatureUnitLabel } from "@/utils/units";

interface Props {
  laps: Lap[];
  raceControl: RaceControl[];
  sessionTimeMs: number;
  sessionStartMs: number;
  airTemp?: number | null;
  trackTemp?: number | null;
  lightsOutMs?: number | null;
  isRaceSession?: boolean;
  totalLapCount?: number | null;
  onShowResults?: () => void;
  onJumpToSessionTime?: (sessionTimeMs: number) => void;
}

interface TrackStatus {
  label: string;
  bg: string;
  color: string;
}

const FLAG_STATUS: Record<string, TrackStatus> = {
  FORMATION_LAP: { label: "FORMATION LAP", bg: "#1c1c2e", color: "#c8c8ff" },
  GREEN: { label: "GREEN FLAG", bg: "#39b54a", color: "#fff" },
  CLEAR: { label: "TRACK CLEAR", bg: "#39b54a", color: "#fff" },
  YELLOW: { label: "YELLOW FLAG", bg: "#f5d400", color: "#000" },
  DOUBLE_YELLOW: { label: "DBL YELLOW", bg: "#f5d400", color: "#000" },
  RED: { label: "RED FLAG", bg: "#e8002d", color: "#fff" },
  SAFETY_CAR: { label: "SAFETY CAR", bg: "#f5a623", color: "#000" },
  VIRTUAL_SAFETY_CAR: { label: "VSC", bg: "#f5a623", color: "#000" },
  CHEQUERED: { label: "CHEQUERED", bg: "#e8e8e8", color: "#000" },
  BLACK_AND_WHITE: { label: "B&W FLAG", bg: "#888", color: "#fff" },
};

function deriveStatus(entries: RaceControl[], currentT: number): TrackStatus {
  let last: RaceControl | null = null;
  for (const e of entries) {
    if (e.flag === null) continue;
    if (new Date(e.date).getTime() > currentT) break;
    last = e;
  }
  const flag = last?.flag ?? "GREEN";
  return FLAG_STATUS[flag] ?? FLAG_STATUS.GREEN;
}

function deriveLatestMessage(
  entries: RaceControl[],
  currentT: number,
): RaceControl | null {
  let last: RaceControl | null = null;
  for (const e of entries) {
    if (new Date(e.date).getTime() > currentT) break;
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
  sessionTimeMs,
  sessionStartMs,
  airTemp = null,
  trackTemp = null,
  lightsOutMs,
  isRaceSession,
  totalLapCount = null,
  onShowResults,
  onJumpToSessionTime,
}: Props) {
  const lightMode = useSettings((s) => s.lightMode);
  const metricSystem = useSettings((s) => s.metricSystem);
  const [isLapDialogOpen, setIsLapDialogOpen] = useState(false);
  const [lapInput, setLapInput] = useState("");
  const [lapError, setLapError] = useState<string | null>(null);
  const currentT = sessionStartMs + sessionTimeMs;

  const formationStatus = useMemo<TrackStatus>(() => {
    return lightMode
      ? { label: "FORMATION LAP", bg: "#e8ecf8", color: "#4a5575" }
      : FLAG_STATUS["FORMATION_LAP"]!;
  }, [lightMode]);

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

  const status = useMemo(() => {
    if (isFormationLap) return formationStatus;
    return deriveStatus(raceControl, currentT);
  }, [formationStatus, isFormationLap, raceControl, currentT]);
  const latestMsg = useMemo(
    () => deriveLatestMessage(raceControl, currentT),
    [raceControl, currentT],
  );
  const lapDisplay = isFormationLap
    ? "F"
    : currentLap !== null && totalLapCount !== null
      ? `${currentLap}/${totalLapCount}`
      : (currentLap ?? "—");

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
    window.addEventListener("keydown", onKeyDown);
    return () => window.removeEventListener("keydown", onKeyDown);
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

  return (
    <div className="shrink-0 flex items-stretch overflow-x-auto border-b border-panel bg-track text-[10px] font-bold uppercase tracking-[0.1em]">
      {/* Lap counter */}
      <div className="flex shrink-0 items-center justify-center gap-2 border-r border-panel px-2.5 py-2 sm:justify-start sm:px-4">
        <span className="text-muted">Lap</span>
        <button
          type="button"
          onClick={() => setIsLapDialogOpen(true)}
          className="tabular-nums text-[13px] font-black transition-colors hover:text-f1red"
          style={{
            color: isFormationLap ? formationStatus.color : undefined,
          }}
          title={`Jump to lap (1-${selectableLapMax})`}
        >
          {lapDisplay}
        </button>
      </div>

      {/* Track status badge - hide during formation lap since lap display shows 'F' */}
      {!isFormationLap && (
        <div className="flex shrink-0 items-center justify-center border-r border-panel px-2.5 py-2 sm:justify-start sm:px-4">
          <span
            className="px-2 py-0.5 text-center text-[9px] font-black tracking-widest"
            style={{ background: status.bg, color: status.color }}
          >
            {status.label}
          </span>
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
      {latestMsg && (
        <div className="hidden min-w-0 flex-1 items-center gap-2 px-4 py-2 sm:flex">
          {latestMsg.lap_number !== null && (
            <span className="text-muted shrink-0">L{latestMsg.lap_number}</span>
          )}
          <span className="text-white/70 truncate normal-case tracking-normal font-medium">
            {latestMsg.message}
          </span>
        </div>
      )}

      {isLapDialogOpen && (
        <div className="fixed inset-0 z-[230] flex items-center justify-center bg-black/70 px-3 py-6 backdrop-blur-sm">
          <div className="w-full max-w-sm border border-panel bg-[#0f1118] shadow-2xl">
            <div className="border-b border-panel px-4 py-3">
              <div className="text-[10px] font-black uppercase tracking-[0.2em] text-f1red">
                Jump To Lap
              </div>
              <div className="mt-1 text-xs text-white/70 normal-case tracking-normal">
                Enter a lap number between 1 and {selectableLapMax}.
              </div>
            </div>
            <div className="space-y-3 px-4 py-4 normal-case tracking-normal">
              <label className="block text-[11px] font-semibold uppercase tracking-[0.14em] text-muted">
                Lap Number
              </label>
              <input
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
