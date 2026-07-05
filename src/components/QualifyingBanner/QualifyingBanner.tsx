import { useEffect, useMemo, useState } from "react";
import type { Driver, Position } from "@/api/types";
import type { QualiPhase } from "@/utils/session";
import { teamColor } from "@/utils/color";

interface Props {
  readonly phase: QualiPhase | null;
  readonly drivers: Driver[];
  readonly positions: Position[];
  readonly sessionTimeMs: number;
  readonly sessionStartMs: number;
  readonly countdownMs?: number | null;
  readonly openByDefault?: boolean;
  readonly dialogOnly?: boolean;
  readonly onClose?: () => void;
}

interface EliminatedDriver {
  driverNumber: number;
  position: number;
}

const Q3_GRID_SIZE = 10;

function fmtCountdown(ms: number): string {
  const total = Math.max(0, Math.floor(ms / 1000));
  const minutes = Math.floor(total / 60);
  const seconds = total % 60;
  return `${String(minutes).padStart(2, "0")}:${String(seconds).padStart(2, "0")}`;
}

function bannerMeta(
  phase: QualiPhase,
  fieldSize: number,
): {
  title: string;
  subtitle: string;
  range: [number, number] | null;
} {
  const eliminatedTotal = Math.max(0, fieldSize - Q3_GRID_SIZE);
  const q1EliminationCount = Math.floor(eliminatedTotal / 2);
  const q2EliminationCount = eliminatedTotal - q1EliminationCount;

  if (phase === "Q1") {
    return {
      title: "Q1 Running",
      subtitle: "No drivers eliminated yet",
      range: null,
    };
  }
  if (phase === "Q2") {
    const minPos = fieldSize - q1EliminationCount + 1;
    return {
      title: "Q1 Eliminated",
      subtitle:
        q1EliminationCount === 1
          ? "1 driver out"
          : `${q1EliminationCount} drivers out`,
      range: q1EliminationCount > 0 ? [Math.max(1, minPos), fieldSize] : null,
    };
  }

  const q2MinPos = Q3_GRID_SIZE + 1;
  const q2MaxPos = Q3_GRID_SIZE + q2EliminationCount;
  return {
    title: "Q2 Eliminated",
    subtitle:
      q2EliminationCount === 1
        ? "1 driver out"
        : `${q2EliminationCount} drivers out`,
    range: q2EliminationCount > 0 ? [q2MinPos, q2MaxPos] : null,
  };
}

export function QualifyingBanner({
  phase,
  drivers,
  positions,
  sessionTimeMs,
  sessionStartMs,
  countdownMs = null,
  openByDefault = false,
  dialogOnly = false,
  onClose,
}: Props) {
  const [open, setOpen] = useState(openByDefault);
  const currentT = sessionStartMs + sessionTimeMs;

  const driverByNumber = useMemo(
    () => new Map(drivers.map((driver) => [driver.driver_number, driver])),
    [drivers],
  );

  const latestPositions = useMemo(() => {
    const latest = new Map<number, number>();
    for (const position of positions) {
      const ms = new Date(position.date).getTime();
      if (ms > currentT) continue;
      latest.set(position.driver_number, position.position);
    }
    return latest;
  }, [positions, currentT]);

  const fieldSize = useMemo(() => {
    const highestPosition = Math.max(0, ...latestPositions.values());
    return Math.max(drivers.length, latestPositions.size, highestPosition);
  }, [drivers.length, latestPositions]);

  const meta = useMemo(() => {
    if (!phase) return null;
    return bannerMeta(phase, fieldSize);
  }, [phase, fieldSize]);

  const eliminatedDrivers = useMemo<EliminatedDriver[]>(() => {
    if (!phase || !meta) return [];
    const range = meta.range;
    if (!range) return [];
    const [minPos, maxPos] = range;
    return [...latestPositions.entries()]
      .map(([driverNumber, position]) => ({ driverNumber, position }))
      .filter((entry) => entry.position >= minPos && entry.position <= maxPos)
      .sort((a, b) => a.position - b.position);
  }, [phase, meta, latestPositions]);

  useEffect(() => {
    if (openByDefault) {
      setOpen(true);
      return;
    }
    setOpen(false);
  }, [phase, openByDefault]);

  useEffect(() => {
    if (!open) return;
    function onKeyDown(event: KeyboardEvent) {
      if (event.key === "Escape") setOpen(false);
    }
    globalThis.addEventListener("keydown", onKeyDown);
    return () => globalThis.removeEventListener("keydown", onKeyDown);
  }, [open]);

  useEffect(() => {
    if (open) return;
    if (!openByDefault) return;
    onClose?.();
  }, [open, openByDefault, onClose]);

  if (!phase) return null;
  if (!meta) return null;

  return (
    <>
      {!dialogOnly && (
        <div className="pointer-events-none absolute right-3 top-3 z-[120] sm:right-4 sm:top-4">
          <div className="pointer-events-auto flex items-center gap-2 rounded border border-panel bg-[#11131b]/90 px-2 py-1.5 backdrop-blur">
            <span className="rounded bg-f1red px-1.5 py-0.5 text-[9px] font-black uppercase tracking-[0.16em] text-white">
              {phase}
            </span>
            {countdownMs !== null && countdownMs > 0 && (
              <span className="font-mono text-[10px] tabular-nums text-white/90">
                {fmtCountdown(countdownMs)}
              </span>
            )}
            <button
              onClick={() => setOpen(true)}
              className="rounded border border-white/10 bg-black/25 px-2 py-1 text-[10px] font-black uppercase tracking-[0.12em] text-white transition-colors hover:border-f1red/40 hover:bg-f1red/10"
            >
              Eliminated
            </button>
          </div>
        </div>
      )}

      {open && (
        <div className="fixed inset-0 z-[230] flex items-start justify-center overflow-y-auto bg-black/75 px-3 py-4 backdrop-blur-sm sm:items-center sm:px-6">
          <div className="my-auto w-full max-w-2xl border border-panel bg-[#0f1118] shadow-2xl">
            <div className="flex items-center justify-between border-b border-panel px-4 py-3 sm:px-5">
              <div>
                <div className="text-[10px] font-black uppercase tracking-[0.2em] text-f1red">
                  {phase} Elimination
                </div>
                <div className="mt-1 text-sm font-black text-white sm:text-base">
                  {meta.title}
                </div>
                <div className="text-xs text-white/65">{meta.subtitle}</div>
              </div>
              <button
                onClick={() => setOpen(false)}
                aria-label="Close elimination dialog"
                className="flex h-8 w-8 items-center justify-center text-lg text-muted transition-colors hover:bg-white/5 hover:text-white"
              >
                ×
              </button>
            </div>

            <div className="px-4 py-4 sm:px-5">
              {eliminatedDrivers.length === 0 ? (
                <div className="rounded border border-panel bg-track px-3 py-3 text-sm text-muted">
                  No eliminated drivers available yet.
                </div>
              ) : (
                <div className="grid gap-2 sm:grid-cols-2">
                  {eliminatedDrivers.map((entry) => {
                    const driver = driverByNumber.get(entry.driverNumber);
                    const color = teamColor(driver?.team_colour);
                    return (
                      <div
                        key={entry.driverNumber}
                        className="flex items-center gap-2 rounded border border-panel bg-track px-3 py-2"
                      >
                        <span className="font-mono text-xs tabular-nums text-white/65">
                          P{entry.position}
                        </span>
                        <span
                          className="h-4 w-[3px] rounded-sm"
                          style={{ background: color }}
                        />
                        <span
                          className="text-xs font-black uppercase tracking-[0.12em]"
                          style={{ color }}
                        >
                          {driver?.name_acronym ?? entry.driverNumber}
                        </span>
                        <span className="ml-auto text-[10px] uppercase tracking-[0.12em] text-white/55">
                          out
                        </span>
                      </div>
                    );
                  })}
                </div>
              )}
            </div>
          </div>
        </div>
      )}
    </>
  );
}
