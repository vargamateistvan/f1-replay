import { useMemo } from "react";
import type { Lap, RaceControl } from "@/api/types";

interface Props {
  laps: Lap[];
  raceControl: RaceControl[];
  sessionTimeMs: number;
  sessionStartMs: number;
  lightsOutMs?: number | null;
  isRaceSession?: boolean;
  totalLapCount?: number | null;
  onShowResults?: () => void;
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

export function SessionInfoBar({
  laps,
  raceControl,
  sessionTimeMs,
  sessionStartMs,
  lightsOutMs,
  isRaceSession,
  totalLapCount = null,
  onShowResults,
}: Props) {
  const currentT = sessionStartMs + sessionTimeMs;

  const currentLap = useMemo(() => {
    let max = 0;
    for (const l of laps) {
      if (!l.date_start) continue;
      if (new Date(l.date_start).getTime() <= currentT && l.lap_number > max)
        max = l.lap_number;
    }
    return max > 0 ? max : null;
  }, [laps, currentT]);

  const isFormationLap =
    isRaceSession && lightsOutMs != null
      ? sessionTimeMs >= 0 && sessionTimeMs < lightsOutMs
      : false;

  const status = useMemo(() => {
    if (isFormationLap) return FLAG_STATUS["FORMATION_LAP"]!;
    return deriveStatus(raceControl, currentT);
  }, [isFormationLap, raceControl, currentT]);
  const latestMsg = useMemo(
    () => deriveLatestMessage(raceControl, currentT),
    [raceControl, currentT],
  );
  const lapDisplay = isFormationLap
    ? "F"
    : currentLap !== null && totalLapCount !== null
      ? `${currentLap}/${totalLapCount}`
      : (currentLap ?? "—");

  if (sessionStartMs === 0) return null;

  return (
    <div className="shrink-0 flex items-center gap-0 border-b border-panel bg-track text-[10px] font-bold uppercase tracking-[0.1em] overflow-hidden">
      {/* Lap counter */}
      <div className="flex items-center gap-2 px-4 py-2 border-r border-panel shrink-0">
        <span className="text-muted">Lap</span>
        <span
          className="tabular-nums text-[13px] font-black"
          style={{ color: isFormationLap ? "#c8c8ff" : undefined }}
        >
          {lapDisplay}
        </span>
      </div>

      {/* Track status badge */}
      <div className="px-4 py-2 border-r border-panel shrink-0">
        <span
          className="px-2 py-0.5 text-[9px] font-black tracking-widest"
          style={{ background: status.bg, color: status.color }}
        >
          {status.label}
        </span>
      </div>

      {/* Elapsed time */}
      <div className="flex items-center gap-2 px-4 py-2 border-r border-panel shrink-0">
        <span className="text-muted">Time</span>
        <span className="text-white tabular-nums font-mono">
          {fmtElapsed(sessionTimeMs)}
        </span>
      </div>

      {onShowResults && (
        <button
          onClick={onShowResults}
          className="shrink-0 border-r border-panel px-4 py-2 text-[10px] font-black uppercase tracking-[0.16em] text-white transition-colors hover:bg-white/5 hover:text-f1red"
        >
          Show Results
        </button>
      )}

      {/* Latest RC message */}
      {latestMsg && (
        <div className="flex items-center gap-2 px-4 py-2 min-w-0">
          {latestMsg.lap_number !== null && (
            <span className="text-muted shrink-0">L{latestMsg.lap_number}</span>
          )}
          <span className="text-white/70 truncate normal-case tracking-normal font-medium">
            {latestMsg.message}
          </span>
        </div>
      )}
    </div>
  );
}
