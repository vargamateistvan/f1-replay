import { useMemo, useState } from "react";
import type { Stint, Driver, Lap, Pit } from "@/api/types";
import { teamColor } from "@/utils/color";
import { pitStopTime } from "@/utils/pit";

const COMPOUND_COLOR: Record<string, string> = {
  SOFT: "#E8002D",
  MEDIUM: "#ffd600",
  HARD: "#f0f0f0",
  INTERMEDIATE: "#39d743",
  WET: "#0067ff",
  UNKNOWN: "#555",
};

const COMPOUND_LABEL: Record<string, string> = {
  SOFT: "S",
  MEDIUM: "M",
  HARD: "H",
  INTERMEDIATE: "I",
  WET: "W",
  UNKNOWN: "?",
};

interface Props {
  readonly stints: Stint[];
  readonly drivers: Driver[];
  readonly laps: Lap[];
  readonly pits: Pit[];
  readonly sessionTimeMs: number;
  readonly sessionStartMs: number;
  readonly currentLap?: number;
}

export function StrategyBar({
  stints,
  drivers,
  laps,
  pits,
  sessionTimeMs,
  sessionStartMs,
  currentLap,
}: Props) {
  const [showAllLaps, setShowAllLaps] = useState(false);
  const currentT = sessionStartMs + sessionTimeMs;

  const driverByNumber = useMemo(
    () => new Map(drivers.map((d) => [d.driver_number, d])),
    [drivers],
  );

  // Derive ordering from drivers array (qualifying/race grid order as returned by API)
  const driverOrder = useMemo(
    () => drivers.map((d) => d.driver_number),
    [drivers],
  );

  const maxLap = useMemo(
    () => Math.max(...laps.map((l) => l.lap_number), 1),
    [laps],
  );

  // Current lap at playhead: last lap started before currentT across any driver
  const derivedCurrentLap = useMemo(() => {
    let best = 0;
    for (const l of laps) {
      if (!l.date_start) continue;
      if (new Date(l.date_start).getTime() <= currentT && l.lap_number > best)
        best = l.lap_number;
    }
    return best;
  }, [laps, currentT]);

  const playbackLap = currentLap ?? derivedCurrentLap;

  const visibleMaxLap = useMemo(() => {
    if (showAllLaps) return maxLap;
    if (playbackLap <= 0) return 1;
    return Math.min(playbackLap, maxLap);
  }, [showAllLaps, playbackLap, maxLap]);

  // Pit stops per driver (only those that occurred before currentT)
  const pitsByDriver = useMemo(() => {
    const m = new Map<number, Pit[]>();
    for (const p of pits) {
      if (new Date(p.date).getTime() > currentT) continue;
      if (!m.has(p.driver_number)) m.set(p.driver_number, []);
      m.get(p.driver_number)!.push(p);
    }
    return m;
  }, [pits, currentT]);

  const driverStints = useMemo(() => {
    const m = new Map<number, Stint[]>();
    for (const s of stints) {
      if (!m.has(s.driver_number)) m.set(s.driver_number, []);
      m.get(s.driver_number)!.push(s);
    }
    return m;
  }, [stints]);

  const activeStintByDriver = useMemo(() => {
    const m = new Map<number, { compound: Stint["compound"]; age: number }>();
    for (const [driverNumber, driverStintList] of driverStints) {
      const active = driverStintList.find(
        (stint) =>
          stint.lap_start <= playbackLap && playbackLap <= stint.lap_end,
      );
      if (!active) continue;
      m.set(driverNumber, {
        compound: active.compound,
        age: playbackLap - active.lap_start + active.tyre_age_at_start,
      });
    }
    return m;
  }, [driverStints, playbackLap]);

  // Ordered list: drivers with stint data, in API order
  const driverNumbers = useMemo(
    () => driverOrder.filter((n) => driverStints.has(n)),
    [driverOrder, driverStints],
  );

  // Lap axis ticks — roughly every 10 laps
  const axisTicks = useMemo(() => {
    const ticks: number[] = [1];
    const step = visibleMaxLap <= 30 ? 5 : visibleMaxLap <= 60 ? 10 : 15;
    for (let l = step; l < visibleMaxLap; l += step) ticks.push(l);
    if (ticks[ticks.length - 1] !== visibleMaxLap) ticks.push(visibleMaxLap);
    return ticks;
  }, [visibleMaxLap]);

  const currentLapPct =
    visibleMaxLap > 0
      ? (Math.min(playbackLap, visibleMaxLap) / visibleMaxLap) * 100
      : 0;

  if (driverNumbers.length === 0) {
    return (
      <div className="p-3 sm:p-4">
        <div className="rounded-sm border border-panel bg-track px-3 py-3 sm:px-4">
          <div className="text-[10px] font-black uppercase tracking-[0.14em] text-white">
            No strategy data
          </div>
          <div className="mt-1 text-xs text-muted">
            Tyre stints will appear here once lap and compound data are
            available.
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className="px-2 py-1.5 space-y-0.5 md:overflow-auto md:h-full sm:px-3 sm:py-2">
      <div className="mb-1 flex items-center justify-end">
        <button
          type="button"
          onClick={() => setShowAllLaps((v) => !v)}
          className={`h-5 px-2 text-[9px] font-black uppercase tracking-widest border transition-colors ${
            showAllLaps
              ? "border-f1red bg-f1red text-white"
              : "border-panel bg-track text-muted hover:text-white"
          }`}
          title={showAllLaps ? "Showing all laps" : "Showing elapsed laps"}
        >
          {showAllLaps ? "All" : "Elapsed"}
        </button>
      </div>

      {/* Lap axis */}
      <div className="relative mb-1 flex h-4 items-center pl-8 pr-1 sm:pl-10">
        {axisTicks.map((lap) => (
          <span
            key={lap}
            className="absolute -translate-x-1/2 text-[9px] font-mono text-muted sm:text-[10px]"
            style={{
              left: `calc(2rem + ${(lap / visibleMaxLap) * 100}% * (100% - 2rem) / 100%)`,
            }}
          >
            {lap}
          </span>
        ))}
      </div>

      {/* Driver rows */}
      {driverNumbers.map((num) => {
        const driver = driverByNumber.get(num);
        const dStints = driverStints.get(num) ?? [];
        const dPits = pitsByDriver.get(num) ?? [];
        const color = teamColor(driver?.team_colour);
        const activeStint = activeStintByDriver.get(num) ?? null;

        return (
          <div key={num} className="flex h-[18px] items-center gap-1 sm:h-5">
            {/* Driver label */}
            <span
              className="w-7 shrink-0 truncate text-right text-[9px] font-black sm:w-9 sm:text-[10px]"
              style={{ color }}
            >
              {driver?.name_acronym ?? num}
            </span>

            <span
              className="w-7 shrink-0 text-center text-[8px] font-black uppercase tracking-[0.04em] text-white/70 tabular-nums sm:w-10 sm:text-[9px] sm:tracking-[0.08em]"
              title={
                activeStint
                  ? `${activeStint.compound} · ${activeStint.age} lap${activeStint.age === 1 ? "" : "s"} old`
                  : "No active stint"
              }
            >
              {activeStint ? `${activeStint.age}L` : "—"}
            </span>

            {/* Timeline bar */}
            <div className="relative flex h-3.5 flex-1 overflow-hidden bg-[#15151e] sm:h-4">
              {/* Stint segments */}
              {dStints.map((s) => {
                const visibleStart = Math.max(1, s.lap_start);
                const visibleEnd = Math.min(s.lap_end, visibleMaxLap);
                if (visibleEnd < visibleStart) return null;
                const left = ((visibleStart - 1) / visibleMaxLap) * 100;
                const width =
                  ((visibleEnd - visibleStart + 1) / visibleMaxLap) * 100;
                const bg = COMPOUND_COLOR[s.compound] ?? "#555";
                const isHard = s.compound === "HARD";
                return (
                  <div
                    key={s.stint_number}
                    title={`${s.compound} (new+${s.tyre_age_at_start}) L${s.lap_start}–${s.lap_end}`}
                    className="absolute top-0 h-full flex items-center justify-center"
                    style={{
                      left: `${left}%`,
                      width: `${width}%`,
                      background: bg,
                      borderRight: "1px solid #15151e",
                      outline: isHard ? "1px solid #555" : undefined,
                    }}
                  >
                    {width > 10 && (
                      <span className="select-none text-[8px] font-black leading-none text-black/70 sm:text-[9px]">
                        {COMPOUND_LABEL[s.compound] ?? "?"}
                      </span>
                    )}
                  </div>
                );
              })}

              {/* Pit stop markers */}
              {dPits.map((p, i) => {
                if (p.lap_number > visibleMaxLap) return null;
                const left = ((p.lap_number - 1) / visibleMaxLap) * 100;
                const stop = pitStopTime(p);
                return (
                  <div
                    key={i}
                    title={`Pit L${p.lap_number}${stop !== null ? ` (${stop.toFixed(1)}s)` : ""}`}
                    className="absolute top-0 h-full w-px bg-[#636369] z-10"
                    style={{ left: `${left}%` }}
                  />
                );
              })}

              {/* Current-lap marker */}
              {playbackLap > 0 && (
                <div
                  className="absolute top-0 h-full w-px bg-f1red z-20 pointer-events-none"
                  style={{ left: `${currentLapPct}%` }}
                />
              )}
            </div>
          </div>
        );
      })}

      {/* Legend */}
      <div className="mt-1.5 flex flex-wrap gap-x-2 gap-y-0.5 border-t border-[#2a2a35] pt-1.5 sm:gap-x-3">
        {Object.entries(COMPOUND_COLOR)
          .filter(([c]) => c !== "UNKNOWN")
          .map(([c, color]) => (
            <span key={c} className="flex items-center gap-1">
              <span
                className="inline-block h-2 w-2 sm:h-2.5 sm:w-2.5"
                style={{ background: color }}
              />
              <span className="text-muted text-[9px] font-bold uppercase sm:text-[10px]">
                {c[0]}
              </span>
            </span>
          ))}
        <span className="flex items-center gap-1 ml-2">
          <span className="w-px h-3 bg-[#636369] inline-block" />
          <span className="text-muted text-[9px] font-bold uppercase sm:text-[10px]">
            Pit
          </span>
        </span>
        <span className="text-muted text-[10px] font-bold uppercase">
          Age = laps on tyre
        </span>
        <span className="flex items-center gap-1">
          <span className="w-px h-3 bg-f1red inline-block" />
          <span className="text-muted text-[10px] font-bold uppercase">
            Now
          </span>
        </span>
      </div>
    </div>
  );
}
