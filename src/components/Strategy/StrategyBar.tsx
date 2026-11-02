import { useMemo, useState } from "react";
import type { Stint, Driver, Lap, Pit } from "@/api/types";
import {
  COMPOUND_COLORS,
  COMPOUND_HARD_LIGHT_COLOR,
  COMPOUND_LETTERS,
} from "@/constants";
import { FOCUS_RING } from "@/components/Button/buttonClass";
import { CompoundRing } from "@/components/LiveTiming/TyreBadge";
import { LapRangeToggle } from "@/components/RaceChart/LapRangeToggle";
import { useSettings } from "@/stores/settings";
import { teamColor } from "@/utils/color";
import { formatPitDuration, pitStopTime } from "@/utils/pit";

interface Props {
  readonly stints: Stint[];
  readonly drivers: Driver[];
  readonly laps: Lap[];
  readonly pits: Pit[];
  readonly sessionTimeMs: number;
  readonly sessionStartMs: number;
  readonly currentLap?: number;
  /** Position per driver at the playhead; rows follow it when given. */
  readonly positionByDriver?: ReadonlyMap<number, number> | null;
  /** Highlighted row (the app's focused driver). */
  readonly focusDriver?: number | null;
  /** Row click; rows are buttons only when given. */
  readonly onSelectDriver?: (driverNumber: number) => void;
}

export function StrategyBar({
  stints,
  drivers,
  laps,
  pits,
  sessionTimeMs,
  sessionStartMs,
  currentLap,
  positionByDriver = null,
  focusDriver = null,
  onSelectDriver,
}: Props) {
  const [showAllLaps, setShowAllLaps] = useState(false);
  const lightMode = useSettings((s) => s.lightMode);
  const currentT = sessionStartMs + sessionTimeMs;

  const driverByNumber = useMemo(
    () => new Map(drivers.map((d) => [d.driver_number, d])),
    [drivers],
  );

  // Current position order; drivers without a position keep the API list order after them.
  const driverOrder = useMemo(() => {
    const listOrder = new Map(drivers.map((d, i) => [d.driver_number, i]));
    const rank = (n: number) =>
      positionByDriver?.get(n) ?? 1000 + (listOrder.get(n) ?? 0);
    return drivers.map((d) => d.driver_number).sort((a, b) => rank(a) - rank(b));
  }, [drivers, positionByDriver]);

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

  // Pit stops per driver (only those that occurred before currentT). Untimed
  // lap-1 entries are pre-race pit exits to the grid, not stops.
  const pitsByDriver = useMemo(() => {
    const m = new Map<number, Pit[]>();
    for (const p of pits) {
      if (new Date(p.date).getTime() > currentT) continue;
      if (p.lap_number <= 1 && pitStopTime(p) === null) continue;
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
    // Before the start, show the tyre each car starts on.
    const lap = Math.max(playbackLap, 1);
    const m = new Map<number, { compound: Stint["compound"]; age: number }>();
    for (const [driverNumber, driverStintList] of driverStints) {
      const active = driverStintList.find(
        (stint) => stint.lap_start <= lap && lap <= stint.lap_end,
      );
      if (!active) continue;
      m.set(driverNumber, {
        compound: active.compound,
        age: Math.max(playbackLap, active.lap_start) - active.lap_start + active.tyre_age_at_start,
      });
    }
    return m;
  }, [driverStints, playbackLap]);

  // Ordered list: drivers with stint data, in current order
  const driverNumbers = useMemo(
    () => driverOrder.filter((n) => driverStints.has(n)),
    [driverOrder, driverStints],
  );

  // Compounds raced this session, in the usual dry → wet order.
  const usedCompounds = useMemo(() => {
    const seen = new Set(stints.map((s) => s.compound));
    return LEGEND_COMPOUNDS.filter((c) => seen.has(c));
  }, [stints]);

  // Lap axis ticks; the final lap replaces a regular tick that would collide with it.
  const axisTicks = useMemo(() => {
    const step = visibleMaxLap <= 30 ? 5 : visibleMaxLap <= 60 ? 10 : 15;
    const ticks: number[] = [1];
    for (let l = step; l <= visibleMaxLap - step / 2; l += step) ticks.push(l);
    if (visibleMaxLap > 1) ticks.push(visibleMaxLap);
    return ticks;
  }, [visibleMaxLap]);

  const lapPct = (lap: number) => (lap / visibleMaxLap) * 100;
  const nowPct = lapPct(Math.min(Math.max(playbackLap, 0), visibleMaxLap));

  if (driverNumbers.length === 0) {
    return (
      <div className="p-3 sm:p-4">
        <div className="rounded-sm border border-panel bg-track px-3 py-3 sm:px-4">
          <div className="text-caption font-black uppercase tracking-caps text-fg">
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
    <div className="flex flex-col">
      <div className="sticky top-0 z-30 bg-surface">
        {/* Toolbar: legend + lap range */}
        <div className="flex items-center gap-2 border-b border-panel bg-track px-2 py-1.5 sm:px-3">
          <div className="flex min-w-0 flex-1 flex-wrap items-center gap-x-2.5 gap-y-1">
            {usedCompounds.map((c) => (
              <span
                key={c}
                className="flex items-center gap-1 text-tiny font-bold uppercase tracking-widest text-muted"
              >
                <CompoundRing compound={c} size="sm" />
                <span className="hidden sm:inline">{COMPOUND_NAMES[c]}</span>
              </span>
            ))}
            <span
              className="flex items-center gap-1 text-tiny font-bold uppercase tracking-widest text-muted"
              title="Pit stop (end of the in-lap)"
            >
              <span className="inline-block h-3.5 w-px bg-fg/60" aria-hidden="true" />
              Pit
            </span>
          </div>
          <LapRangeToggle
            showAll={showAllLaps}
            onToggle={() => setShowAllLaps((v) => !v)}
            allTitle="Showing every lap; laps still to come are dimmed"
          />
        </div>

        {/* Column header + lap axis */}
        <div
          className={`flex h-6 items-center border-b border-panel ${HEADER_TEXT}`}
        >
          <span className={COL_POS}>P</span>
          <span className={COL_DRIVER}>Driver</span>
          <span className={`${COL_TYRE} text-center`} title="Laps on the current tyre">
            Tyre
          </span>
          <div className={`${COL_BAR} h-full font-mono tracking-normal`}>
            {axisTicks.map((lap, i) => {
              const first = i === 0;
              const last = i === axisTicks.length - 1 && !first;
              return (
                <span
                  key={lap}
                  className={`absolute top-1/2 -translate-y-1/2 tabular-nums ${
                    first ? "" : last ? "-translate-x-full" : "-translate-x-1/2"
                  }`}
                  style={{ left: `${first ? 0 : lapPct(lap)}%` }}
                >
                  {lap}
                </span>
              );
            })}
          </div>
        </div>
      </div>

      {/* Driver rows */}
      {driverNumbers.map((num) => {
        const driver = driverByNumber.get(num);
        const dStints = driverStints.get(num) ?? [];
        const dPits = pitsByDriver.get(num) ?? [];
        const color = teamColor(driver?.team_colour);
        const activeStint = activeStintByDriver.get(num) ?? null;
        const position = positionByDriver?.get(num);
        const focused = focusDriver === num;
        const acronym = driver?.name_acronym ?? String(num);

        const cells = (
          <>
            <span className={`${COL_POS} font-mono text-caption font-bold text-muted tabular-nums`}>
              {position ?? ""}
            </span>
            <span
              className={`${COL_DRIVER} truncate text-small font-black`}
              style={{ color: focused ? color : undefined }}
            >
              {acronym}
            </span>
            <span
              className={`${COL_TYRE} flex items-center justify-center gap-1`}
              title={
                activeStint
                  ? `${activeStint.compound} · ${activeStint.age} lap${activeStint.age === 1 ? "" : "s"} old`
                  : "No active stint"
              }
            >
              {activeStint ? (
                <>
                  <span className="w-4 text-right font-mono text-caption font-bold tabular-nums text-fg">
                    {activeStint.age}
                  </span>
                  <CompoundRing compound={activeStint.compound} size="sm" />
                </>
              ) : (
                <span className="text-caption text-muted">—</span>
              )}
            </span>

            {/* Timeline bar */}
            <div className={`${COL_BAR} h-4`}>
              <div className="absolute inset-0 overflow-hidden bg-track">
                {dStints.map((s) => {
                  const visibleStart = Math.max(1, s.lap_start);
                  const visibleEnd = Math.min(s.lap_end, visibleMaxLap);
                  if (visibleEnd < visibleStart) return null;
                  const width = lapPct(visibleEnd - visibleStart + 1);
                  const laps = s.lap_end - s.lap_start + 1;
                  const isHard = s.compound === "HARD";
                  const darkLetter = !(isHard && lightMode);
                  return (
                    <div
                      key={s.stint_number}
                      title={`${COMPOUND_NAMES[s.compound]} · L${s.lap_start}–${s.lap_end} (${laps} lap${laps === 1 ? "" : "s"}${s.tyre_age_at_start > 0 ? `, ${s.tyre_age_at_start} old at start` : ", new"})`}
                      className="absolute inset-y-0 flex items-center justify-center gap-1 overflow-hidden border-r border-track"
                      style={{
                        left: `${lapPct(visibleStart - 1)}%`,
                        width: `${width}%`,
                        background: compoundColor(s.compound, lightMode),
                        boxShadow:
                          isHard && !lightMode
                            ? "inset 0 0 0 1px rgb(var(--color-line))"
                            : undefined,
                      }}
                    >
                      {width > 6 && (
                        <span
                          className={`select-none text-micro font-black leading-none sm:text-tiny ${
                            darkLetter ? "text-black/75" : "text-white"
                          }`}
                        >
                          {COMPOUND_LETTERS[s.compound] ?? COMPOUND_LETTERS.UNKNOWN}
                          {width > 14 && (
                            <span className="ml-1 font-mono font-bold opacity-70">
                              {visibleEnd - visibleStart + 1}
                            </span>
                          )}
                        </span>
                      )}
                    </div>
                  );
                })}

                {/* Laps still to come (All mode) */}
                {nowPct < 100 && playbackLap > 0 && (
                  <div
                    className="pointer-events-none absolute inset-y-0 right-0 z-10 bg-track/70"
                    style={{ width: `${100 - nowPct}%` }}
                  />
                )}
              </div>

              {/* Pit stops: at the end of the in-lap, poking out of the bar */}
              {dPits.map((p, i) => {
                if (p.lap_number > visibleMaxLap) return null;
                const stop = pitStopTime(p);
                return (
                  <div
                    key={i}
                    title={`Pit L${p.lap_number}${stop !== null ? ` (${formatPitDuration(stop) ?? "--:--:---"})` : ""}`}
                    className="absolute -inset-y-0.5 z-20 w-px -translate-x-1/2 bg-fg/60"
                    style={{ left: `${lapPct(p.lap_number)}%` }}
                  />
                );
              })}

              {/* Current lap */}
              {playbackLap > 0 && (
                <div
                  className="pointer-events-none absolute -inset-y-0.5 z-20 w-0.5 bg-f1red"
                  style={{ right: `${100 - nowPct}%` }}
                />
              )}
            </div>
          </>
        );

        const rowClass = `flex h-6 w-full items-center border-b border-panel text-left transition-colors ${
          focused ? "bg-panel/60 text-fg" : "text-fg/80"
        }`;
        const rowStyle = { boxShadow: `inset ${focused ? 4 : 2}px 0 0 ${color}` };

        return onSelectDriver ? (
          <button
            key={num}
            type="button"
            onClick={() => onSelectDriver(num)}
            aria-pressed={focused}
            aria-label={`${focused ? "Unfocus" : "Focus"} ${acronym}`}
            className={`${rowClass} hover:bg-panel/40 ${FOCUS_RING}`}
            style={rowStyle}
          >
            {cells}
          </button>
        ) : (
          <div key={num} className={rowClass} style={rowStyle}>
            {cells}
          </div>
        );
      })}
    </div>
  );
}

const LEGEND_COMPOUNDS = ["SOFT", "MEDIUM", "HARD", "INTERMEDIATE", "WET"] as const;

const COMPOUND_NAMES: Record<Stint["compound"], string> = {
  SOFT: "Soft",
  MEDIUM: "Medium",
  HARD: "Hard",
  INTERMEDIATE: "Inter",
  WET: "Wet",
  UNKNOWN: "Unknown",
};

// Shared column widths keep the header and the rows aligned.
const COL_POS = "w-6 shrink-0 pr-1 text-right";
const COL_DRIVER = "w-10 shrink-0 pl-1.5";
const COL_TYRE = "w-11 shrink-0";
const COL_BAR = "relative ml-1.5 mr-2 flex-1 sm:mr-3";
const HEADER_TEXT = "text-tiny font-bold uppercase tracking-widest text-muted";

function compoundColor(compound: Stint["compound"], lightMode: boolean): string {
  if (lightMode && compound === "HARD") return COMPOUND_HARD_LIGHT_COLOR;
  return COMPOUND_COLORS[compound] ?? COMPOUND_COLORS.UNKNOWN;
}
