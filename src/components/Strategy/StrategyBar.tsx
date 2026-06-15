import { useMemo } from "react";
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
}

export function StrategyBar({
  stints,
  drivers,
  laps,
  pits,
  sessionTimeMs,
  sessionStartMs,
}: Props) {
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
  const currentLap = useMemo(() => {
    let best = 0;
    for (const l of laps) {
      if (!l.date_start) continue;
      if (new Date(l.date_start).getTime() <= currentT && l.lap_number > best)
        best = l.lap_number;
    }
    return best;
  }, [laps, currentT]);

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
        (stint) => stint.lap_start <= currentLap && currentLap <= stint.lap_end,
      );
      if (!active) continue;
      m.set(driverNumber, {
        compound: active.compound,
        age: currentLap - active.lap_start + active.tyre_age_at_start,
      });
    }
    return m;
  }, [driverStints, currentLap]);

  // Ordered list: drivers with stint data, in API order
  const driverNumbers = useMemo(
    () => driverOrder.filter((n) => driverStints.has(n)),
    [driverOrder, driverStints],
  );

  // Lap axis ticks — roughly every 10 laps
  const axisTicks = useMemo(() => {
    const ticks: number[] = [1];
    const step = maxLap <= 30 ? 5 : maxLap <= 60 ? 10 : 15;
    for (let l = step; l < maxLap; l += step) ticks.push(l);
    if (ticks[ticks.length - 1] !== maxLap) ticks.push(maxLap);
    return ticks;
  }, [maxLap]);

  const currentLapPct = maxLap > 0 ? (currentLap / maxLap) * 100 : 0;

  if (driverNumbers.length === 0) {
    return <div className="text-muted text-xs p-3">No stint data</div>;
  }

  return (
    <div className="px-3 py-2 space-y-0.5 overflow-auto h-full">
      {/* Lap axis */}
      <div className="flex items-center mb-1 pl-10 pr-1 relative h-4">
        {axisTicks.map((lap) => (
          <span
            key={lap}
            className="absolute text-[10px] font-mono text-muted -translate-x-1/2"
            style={{
              left: `calc(2.5rem + ${(lap / maxLap) * 100}% * (100% - 2.5rem) / 100%)`,
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
          <div key={num} className="flex items-center gap-1 h-5">
            {/* Driver label */}
            <span
              className="w-9 text-right shrink-0 text-[10px] font-black truncate"
              style={{ color }}
            >
              {driver?.name_acronym ?? num}
            </span>

            <span
              className="w-10 shrink-0 text-center text-[9px] font-black uppercase tracking-[0.08em] text-white/70 tabular-nums"
              title={
                activeStint
                  ? `${activeStint.compound} · ${activeStint.age} lap${activeStint.age === 1 ? "" : "s"} old`
                  : "No active stint"
              }
            >
              {activeStint ? `${activeStint.age}L` : "—"}
            </span>

            {/* Timeline bar */}
            <div className="relative flex flex-1 h-4 overflow-hidden bg-[#15151e]">
              {/* Stint segments */}
              {dStints.map((s) => {
                const left = ((s.lap_start - 1) / maxLap) * 100;
                const width = ((s.lap_end - s.lap_start + 1) / maxLap) * 100;
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
                    {width > 8 && (
                      <span className="text-[9px] font-black leading-none select-none text-black/70">
                        {COMPOUND_LABEL[s.compound] ?? "?"}
                      </span>
                    )}
                  </div>
                );
              })}

              {/* Pit stop markers */}
              {dPits.map((p, i) => {
                const left = ((p.lap_number - 1) / maxLap) * 100;
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
              {currentLap > 0 && (
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
      <div className="flex flex-wrap gap-x-3 gap-y-0.5 mt-1.5 pt-1.5 border-t border-[#2a2a35]">
        {Object.entries(COMPOUND_COLOR)
          .filter(([c]) => c !== "UNKNOWN")
          .map(([c, color]) => (
            <span key={c} className="flex items-center gap-1">
              <span
                className="w-2.5 h-2.5 inline-block"
                style={{ background: color }}
              />
              <span className="text-muted text-[10px] font-bold uppercase">
                {c[0]}
              </span>
            </span>
          ))}
        <span className="flex items-center gap-1 ml-2">
          <span className="w-px h-3 bg-[#636369] inline-block" />
          <span className="text-muted text-[10px] font-bold uppercase">
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
